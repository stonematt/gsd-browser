'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Fastify = require('fastify');
const mime = require('mime-types');
const { isPathAllowed, readFileIfAllowed } = require('./filesystem.js');
const { initRenderer, renderMarkdown, buildPage } = require('./renderer.js');

// CSP header value — defined as a named constant for easy Phase 4 update
// Phase 4: change script-src 'none' to script-src 'self' when adding frontend JS
const CSP_HEADER = "default-src 'self'; script-src 'none'; object-src 'none'";

/**
 * Create a Fastify server instance with security hooks and file serving route.
 *
 * @param {string} registeredRoot - The root directory to serve files from
 * @returns {import('fastify').FastifyInstance}
 */
function createServer(registeredRoot) {
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

  // GET /file — serve a file or directory listing
  fastify.get('/file', async (request, reply) => {
    const requestedPath = request.query.path;

    if (!requestedPath) {
      return reply.code(400).send({
        error: 'Missing required query parameter: path',
        status: 400
      });
    }

    const allowed = await isPathAllowed(requestedPath, registeredRoot);

    if (!allowed) {
      return reply.code(403).send({
        error: 'Access denied: path is outside the registered root',
        status: 403,
        requested: requestedPath,
        allowed: [registeredRoot]
      });
    }

    // Path is allowed — resolve it to check if it's a file or directory
    const resolvedPath = path.resolve(registeredRoot, requestedPath);

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
    // Strategy: normalize the path WITHOUT requiring it to exist (path.resolve is sync),
    // then compare against realpath of the root (which exists and may differ due to symlinks).
    // If outside → 403 immediately.
    // If inside but file missing → readFileIfAllowed returns null → 404.
    let realBase;
    try {
      realBase = await fs.realpath(path.resolve(registeredRoot));
    } catch {
      realBase = path.resolve(registeredRoot);
    }
    const resolvedPath = path.resolve(realBase, requestedPath);
    const isWithinRoot = resolvedPath === realBase || resolvedPath.startsWith(realBase + path.sep);

    if (!isWithinRoot) {
      return reply.code(403).send({
        error: 'Access denied: path is outside the registered root',
        status: 403,
        requested: requestedPath,
        allowed: [registeredRoot]
      });
    }

    const content = await readFileIfAllowed(requestedPath, registeredRoot);

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

  // GET / — render README.md if present, otherwise directory listing
  fastify.get('/', async (request, reply) => {
    // Try to render README.md from root
    const readmeContent = await readFileIfAllowed('README.md', registeredRoot);
    if (readmeContent !== null) {
      const bodyHtml = await renderMarkdown(readmeContent);
      const html = buildPage({ filePath: 'README.md', bodyHtml });
      return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
    }

    // Fallback: directory listing (same format as /file?path=.)
    const entries = await fs.readdir(registeredRoot);
    const annotated = [];
    for (const entry of entries) {
      const entryStat = await fs.stat(path.join(registeredRoot, entry));
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
 * @param {string} registeredRoot - Root directory to serve
 * @param {object} [options] - Options
 * @param {boolean} [options.open] - Open browser after start
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function start(port, registeredRoot, options = {}) {
  const fastify = createServer(registeredRoot);

  // Initialize Shiki + Mermaid before accepting requests
  await initRenderer();

  await fastify.listen({ port, host: '127.0.0.1' });

  const actualPort = fastify.server.address().port;
  process.stdout.write(`gsd-browser serving ${registeredRoot} at http://127.0.0.1:${actualPort}\n`);

  if (options.open) {
    try {
      const open = await import('open');
      await open.default(`http://127.0.0.1:${actualPort}`);
    } catch (err) {
      // open package may not be installed in Phase 1 — that's fine
    }
  }

  process.on('SIGINT', async () => {
    await fastify.close();
    process.exit(0);
  });

  return fastify;
}

module.exports = { start, createServer };
