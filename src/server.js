'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Fastify = require('fastify');
const mime = require('mime-types');
const { isPathAllowed, readFileIfAllowed } = require('./filesystem.js');
const { initRenderer, renderMarkdown, buildPage } = require('./renderer.js');
const { enrichSourcesWithConventions, addSource, removeSource, listSources } = require('./sources.js');

// CSP header value — defined as a named constant for easy Phase 4 update
// Phase 4: change script-src 'none' to script-src 'self' when adding frontend JS
const CSP_HEADER = "default-src 'self'; script-src 'none'; object-src 'none'";

// Relaxed CSP for the /sources management page — allows inline script execution
const MANAGEMENT_CSP = "default-src 'self'; script-src 'self'; object-src 'none'";

/**
 * Find which source contains the requested path (for path traversal check and routing).
 * Iterates sources in order; returns the first matching source or null.
 *
 * @param {string} requestedPath
 * @param {Array<{ name: string, path: string, available: boolean, conventions: string[] }>} sources
 * @returns {Promise<object|null>}
 */
async function findSourceForPath(requestedPath, sources) {
  for (const source of sources) {
    const allowed = await isPathAllowed(requestedPath, source.path);
    if (allowed) return source;
  }
  return null;
}

/**
 * Create a Fastify server instance with security hooks and file serving routes.
 *
 * @param {Array<{ name: string, path: string, available: boolean, conventions: string[] }>} sources
 *   Array of available source objects (only available sources should be passed)
 * @returns {import('fastify').FastifyInstance}
 */
function createServer(sources) {
  // Mutable reference to live sources — updated by add/remove API calls so that
  // /file and /render always reflect current state without a server restart.
  let activeSources = sources;

  const fastify = Fastify({ logger: false });

  // Register @fastify/static BEFORE routes (per research pitfall 7)
  // Serves public/ directory at /styles/*, /*, etc.
  fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
    decorateReply: false,  // avoid conflict with existing reply.send usage
  });

  // Global security headers on every response
  fastify.addHook('preHandler', async (request, reply) => {
    reply.header('Content-Security-Policy', CSP_HEADER);
    reply.header('Cache-Control', 'no-store');
  });

  // GET /api/sources — list all registered sources (fresh from config each time)
  fastify.get('/api/sources', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sources = await listSources();
    return reply.send({ sources });
  });

  // POST /api/sources — add a new source
  fastify.post('/api/sources', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const body = request.body || {};
    const targetPath = body.path;
    const name = body.name;

    if (!targetPath) {
      return reply.code(400).send({ error: 'Missing required field: path' });
    }

    const result = await addSource(targetPath, name ? { name } : {});

    if (result.ok) {
      // Refresh activeSources from config so new source is served immediately
      const enriched = await listSources();
      activeSources = enriched.filter(s => s.available);
      return reply.code(201).send({ source: result.source });
    }

    if (result.reason === 'duplicate') {
      return reply.code(409).send({ error: result.message || 'Source path already registered' });
    }

    return reply.code(400).send({ error: result.message || 'Failed to add source' });
  });

  // DELETE /api/sources/:identifier — remove a source by name or path
  fastify.delete('/api/sources/:identifier', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const identifier = request.params.identifier;
    const result = await removeSource(identifier);

    if (result.ok) {
      // Refresh activeSources from config so removed source stops being served
      const enriched = await listSources();
      activeSources = enriched.filter(s => s.available);
      return reply.code(200).send({ removed: result.removed });
    }

    if (result.reason === 'not-found') {
      return reply.code(404).send({ error: result.message || `Source not found: ${identifier}` });
    }

    if (result.reason === 'ambiguous') {
      return reply.code(409).send({ error: result.message || 'Ambiguous identifier', matches: result.matches });
    }

    return reply.code(400).send({ error: result.message || 'Failed to remove source' });
  });

  // GET /sources — serve the management page (explicit route shadows static for this path)
  fastify.get('/sources', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'sources.html');
    const html = await fs.readFile(htmlPath, 'utf8');
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  // GET /file — serve a file or directory listing
  fastify.get('/file', async (request, reply) => {
    const requestedPath = request.query.path;

    if (!requestedPath) {
      return reply.code(400).send({
        error: 'Missing required query parameter: path',
        status: 400
      });
    }

    const matchedSource = await findSourceForPath(requestedPath, activeSources);

    if (!matchedSource) {
      return reply.code(403).send({
        error: 'Access denied: path is outside the registered root',
        status: 403,
        requested: requestedPath,
        allowed: activeSources.map(s => s.path)
      });
    }

    // Path is allowed — resolve it to check if it's a file or directory
    const resolvedPath = path.resolve(matchedSource.path, requestedPath);

    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch (err) {
      return reply.code(404).send({
        error: 'File not found',
        status: 404,
        requested: requestedPath
      });
    }

    if (stat.isDirectory()) {
      // Return a directory listing
      const entries = await fs.readdir(resolvedPath);
      const annotated = [];
      for (const entry of entries) {
        const entryStat = await fs.stat(path.join(resolvedPath, entry));
        annotated.push(entryStat.isDirectory() ? entry + '/' : entry);
      }
      return reply.send({
        type: 'directory',
        path: requestedPath,
        entries: annotated
      });
    }

    // Regular file — read and serve with correct MIME type
    // .md files are served as text/plain in Phase 1 (no rendering)
    const mimeType = mime.lookup(resolvedPath) || 'text/plain';
    const contentType = mimeType === 'text/markdown' ? 'text/plain' : mimeType;

    const content = await fs.readFile(resolvedPath);
    return reply.header('Content-Type', contentType).send(content);
  });

  // GET /render — render a markdown file as a full HTML page
  fastify.get('/render', async (request, reply) => {
    const requestedPath = request.query.path;

    if (!requestedPath) {
      return reply.code(400).send({
        error: 'Missing required query parameter: path',
        status: 400
      });
    }

    // Distinguish path traversal (403) from missing file (404).
    // Strategy:
    //   1. Check that the path, if it existed, would be within at least ONE source root.
    //      If it's outside ALL roots → 403 (traversal).
    //   2. Among the allowed roots, try to read the file from each.
    //      First source that returns content wins.
    //      If none have the file → 404.

    // Step 1: Compute which sources the path is geometrically within (no existence check)
    const allowedSources = [];
    for (const source of activeSources) {
      let realBase;
      try {
        realBase = await fs.realpath(path.resolve(source.path));
      } catch {
        realBase = path.resolve(source.path);
      }
      const resolvedPath = path.resolve(realBase, requestedPath);
      const isWithinRoot = resolvedPath === realBase || resolvedPath.startsWith(realBase + path.sep);
      if (isWithinRoot) {
        allowedSources.push(source);
      }
    }

    if (allowedSources.length === 0) {
      return reply.code(403).send({
        error: 'Access denied: path is outside the registered root',
        status: 403,
        requested: requestedPath,
        allowed: activeSources.map(s => s.path)
      });
    }

    // Step 2: Find the first source where the file actually exists
    let content = null;
    for (const source of allowedSources) {
      content = await readFileIfAllowed(requestedPath, source.path);
      if (content !== null) break;
    }

    if (content === null) {
      return reply.code(404).send({
        error: 'File not found',
        status: 404,
        requested: requestedPath
      });
    }

    const bodyHtml = await renderMarkdown(content);
    const html = buildPage({ filePath: requestedPath, bodyHtml });
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  // GET / — render README.md if present in any source, otherwise directory listing of first source
  fastify.get('/', async (request, reply) => {
    // Try to render README.md — check sources in order
    for (const source of activeSources) {
      const readmeContent = await readFileIfAllowed('README.md', source.path);
      if (readmeContent !== null) {
        const bodyHtml = await renderMarkdown(readmeContent);
        const html = buildPage({ filePath: 'README.md', bodyHtml });
        return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
      }
    }

    // Fallback: directory listing of first source
    const firstSource = activeSources[0];
    const entries = await fs.readdir(firstSource.path);
    const annotated = [];
    for (const entry of entries) {
      const entryStat = await fs.stat(path.join(firstSource.path, entry));
      annotated.push(entryStat.isDirectory() ? entry + '/' : entry);
    }
    return reply.send({ type: 'directory', path: '.', entries: annotated });
  });

  return fastify;
}

/**
 * Start the server, bind to 127.0.0.1, print startup message.
 *
 * @param {number} port - Port number (0 = OS assigns random port)
 * @param {Array<{ name: string, path: string, available?: boolean, conventions?: string[] }>} sources
 *   Source array (will be enriched with conventions at startup)
 * @param {object} [options] - Options
 * @param {boolean} [options.open] - Open browser after start
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function start(port, sources, options = {}) {
  // Re-scan conventions at startup (fresh-from-disk philosophy)
  const enriched = await enrichSourcesWithConventions(sources);
  const availableSources = enriched.filter(s => s.available);

  const fastify = createServer(availableSources);

  // Initialize Shiki + Mermaid before accepting requests
  await initRenderer();

  await fastify.listen({ port, host: '127.0.0.1' });

  const actualPort = fastify.server.address().port;

  if (availableSources.length === 1) {
    process.stdout.write(`gsd-browser serving ${availableSources[0].path} at http://127.0.0.1:${actualPort}\n`);
  } else {
    process.stdout.write(`gsd-browser serving ${availableSources.length} sources at http://127.0.0.1:${actualPort}\n`);
    for (const src of availableSources) {
      process.stdout.write(`  ${src.name}: ${src.path}\n`);
    }
  }

  if (options.open) {
    try {
      const open = await import('open');
      await open.default(`http://127.0.0.1:${actualPort}`);
    } catch (err) {
      // open package may not be installed — that's fine
    }
  }

  process.on('SIGINT', async () => {
    await fastify.close();
    process.exit(0);
  });

  return fastify;
}

module.exports = { start, createServer };
