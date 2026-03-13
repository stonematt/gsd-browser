'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Fastify = require('fastify');
const mime = require('mime-types');
const { isPathAllowed } = require('./filesystem.js');

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
