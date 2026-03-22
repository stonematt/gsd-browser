'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Fastify = require('fastify');
const mime = require('mime-types');
const { isPathAllowed, readFileIfAllowed } = require('./filesystem.js');
const { initRenderer, renderMarkdown, buildPage } = require('./renderer.js');
const { enrichSourcesWithConventions, addSource, removeSource, listSources, loadConfig, saveConfig } = require('./sources.js');

// CSP header value — defined as a named constant for easy Phase 4 update
// Phase 4: change script-src 'none' to script-src 'self' when adding frontend JS
const CSP_HEADER = "default-src 'self'; script-src 'none'; object-src 'none'";

// Relaxed CSP for the /sources management page — allows inline script execution
const MANAGEMENT_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'";

// Directories treated as "convention" directories (sorted first, flagged with convention: true)
const CONVENTION_DIRS = new Set(['.planning', 'docs']);

/**
 * buildTree(dirPath, relBase) — recursively build a JSON tree of .md files.
 *
 * Rules:
 * - Only .md files are included; non-.md files are ignored
 * - Directories with no .md descendants at any depth are omitted
 * - Directories named in CONVENTION_DIRS get convention: true flag
 * - Convention dirs are sorted before non-convention dirs; within each group, sorted alphabetically
 * - File paths are relative to dirPath (the source root)
 *
 * @param {string} dirPath - Absolute path to scan
 * @param {string} [relBase=''] - Relative base path (for building node path values)
 * @returns {Promise<Array>} - Array of tree nodes
 */
async function buildTree(dirPath, relBase = '') {
  let entries;
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return [];
  }

  const nodes = [];

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry);
    const relPath = relBase ? `${relBase}/${entry}` : entry;

    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const children = await buildTree(absPath, relPath);
      // Omit directories that have no .md descendants at any depth
      if (children.length === 0) continue;
      const isConvention = CONVENTION_DIRS.has(entry);
      nodes.push({
        name: entry,
        type: 'dir',
        convention: isConvention,
        children,
      });
    } else if (entry.endsWith('.md')) {
      nodes.push({
        name: entry,
        type: 'file',
        path: relPath,
      });
    }
  }

  // Sort: convention dirs first, then non-convention dirs, then files — each group alphabetically
  nodes.sort((a, b) => {
    const aIsConventionDir = a.type === 'dir' && a.convention === true;
    const bIsConventionDir = b.type === 'dir' && b.convention === true;
    const aIsDir = a.type === 'dir';
    const bIsDir = b.type === 'dir';

    if (aIsConventionDir !== bIsConventionDir) {
      return aIsConventionDir ? -1 : 1;
    }
    if (aIsDir !== bIsDir) {
      return aIsDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

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

  // GET /api/sources/:name/files — list markdown files in a source, grouped by priority
  fastify.get('/api/sources/:name/files', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sourceName = request.params.name;
    const sources = await listSources();
    const source = sources.find(s => s.name === sourceName);

    if (!source) {
      return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    }

    if (!source.available) {
      return reply.code(404).send({ error: `Source unavailable: ${sourceName}` });
    }

    const files = { readme: [], planning: [], docs: [], other: [] };

    // Helper: build file entry
    const entry = (name, absPath) => ({ name, path: absPath });

    // Check for root README.md (case-insensitive match)
    try {
      const rootEntries = await fs.readdir(source.path);
      for (const name of rootEntries) {
        if (name.toLowerCase() === 'readme.md') {
          files.readme.push(entry(name, path.join(source.path, name)));
        }
      }
    } catch { /* skip if unreadable */ }

    // Check .planning/*.md
    try {
      const planningDir = path.join(source.path, '.planning');
      const planningEntries = await fs.readdir(planningDir);
      for (const name of planningEntries) {
        if (name.endsWith('.md')) {
          files.planning.push(entry(name, path.join(planningDir, name)));
        }
      }
    } catch { /* skip if missing */ }

    // Check docs/*.md
    try {
      const docsDir = path.join(source.path, 'docs');
      const docsEntries = await fs.readdir(docsDir);
      for (const name of docsEntries) {
        if (name.endsWith('.md')) {
          files.docs.push(entry(name, path.join(docsDir, name)));
        }
      }
    } catch { /* skip if missing */ }

    // Other *.md in root (excluding README.md already captured)
    try {
      const rootEntries = await fs.readdir(source.path);
      const readmeNames = new Set(files.readme.map(f => f.name));
      for (const name of rootEntries) {
        if (name.endsWith('.md') && !readmeNames.has(name)) {
          files.other.push(entry(name, path.join(source.path, name)));
        }
      }
    } catch { /* skip if unreadable */ }

    return reply.send({
      source: { name: source.name, path: source.path },
      files
    });
  });

  // GET /api/sources/:name/tree — return a recursive JSON tree of .md files for a source
  fastify.get('/api/sources/:name/tree', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sourceName = request.params.name;
    const source = activeSources.find(s => s.name === sourceName);
    if (!source) return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    const tree = await buildTree(source.path);
    return reply.send({ source: { name: source.name, path: source.path }, tree });
  });

  // PATCH /api/sources/:name — update source name or path
  fastify.patch('/api/sources/:name', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sourceName = request.params.name;
    const { name: newName, path: newPath } = request.body || {};

    if (!newName && !newPath) {
      return reply.code(400).send({ error: 'Provide name or path to update' });
    }

    const config = await loadConfig();
    const sourceIdx = config.sources.findIndex(s => s.name === sourceName);

    if (sourceIdx === -1) {
      return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    }

    const source = config.sources[sourceIdx];

    if (newName) {
      const nameExists = config.sources.some((s, i) => i !== sourceIdx && s.name === newName);
      if (nameExists) {
        return reply.code(409).send({ error: `Name already taken: ${newName}` });
      }
      source.name = newName;
    }

    if (newPath) {
      const resolvedPath = path.resolve(newPath);
      const pathExists = config.sources.some((s, i) => i !== sourceIdx && s.path === resolvedPath);
      if (pathExists) {
        return reply.code(409).send({ error: 'Path already registered' });
      }
      source.path = resolvedPath;
    }

    config.sources[sourceIdx] = source;
    await saveConfig(config);

    const enriched = await enrichSourcesWithConventions([source]);
    return reply.send({ source: enriched[0] });
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
    const isFragment = request.query.fragment === 'true';
    const html = buildPage({ filePath: requestedPath, bodyHtml, fragment: isFragment });
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  // GET / — serve the browse page
  fastify.get('/', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = await fs.readFile(htmlPath, 'utf8');
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
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
