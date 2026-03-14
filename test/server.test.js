'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const { createServer, start } = require('../src/server.js');
const { initRenderer } = require('../src/renderer.js');

let testDir;

// Helper: wrap a single testDir as the sources array format expected by createServer
function makeSources(dir) {
  return [{ name: 'test', path: dir, available: true, conventions: [] }];
}

before(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-server-test-'));
  await fs.writeFile(path.join(testDir, 'valid.txt'), 'hello');
  await fs.mkdir(path.join(testDir, 'subdir'));
  await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), 'nested');

  // Markdown files for /render route tests
  await fs.writeFile(path.join(testDir, 'README.md'), '# Hello World\n\nThis is a test.\n');
  await fs.writeFile(path.join(testDir, 'test.md'), [
    '# Test Doc',
    '',
    '| Col A | Col B |',
    '|-------|-------|',
    '| 1     | 2     |',
    '',
    '```javascript',
    'const x = 1;',
    '```',
    '',
    '- [x] done',
    '- [ ] todo',
  ].join('\n'));

  // initRenderer required for /render route to work via fastify.inject()
  await initRenderer();
});

after(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

// SERV-04: Cache-Control header
test('SERV-04: GET /file returns Cache-Control: no-store header', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({
    method: 'GET',
    url: '/file',
    query: { path: 'valid.txt' }
  });
  assert.equal(response.headers['cache-control'], 'no-store');
  await fastify.close();
});

// SERV-05: Port configuration
test('SERV-05: server starts on port 0 (random) and reports port > 0', async () => {
  const fastify = await start(0, makeSources(testDir));
  const addr = fastify.server.address();
  assert.ok(addr.port > 0, `expected port > 0, got ${addr.port}`);
  await fastify.close();
});

test('SERV-05: EADDRINUSE error when port is already occupied', async () => {
  const first = await start(0, makeSources(testDir));
  const occupiedPort = first.server.address().port;
  try {
    await assert.rejects(
      async () => start(occupiedPort, makeSources(testDir)),
      (err) => {
        assert.equal(err.code, 'EADDRINUSE');
        return true;
      }
    );
  } finally {
    await first.close();
  }
});

// SERV-06: Localhost binding
test('SERV-06: server binds to 127.0.0.1 (not 0.0.0.0)', async () => {
  const fastify = await start(0, makeSources(testDir));
  const addr = fastify.server.address();
  assert.equal(addr.address, '127.0.0.1');
  await fastify.close();
});

// SERV-07: Path traversal protection
test('SERV-07: GET /file?path=../../../etc/passwd returns 403', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({
    method: 'GET',
    url: '/file',
    query: { path: '../../../etc/passwd' }
  });
  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.ok(body.status === 403, 'body.status should be 403');
  assert.ok(typeof body.error === 'string', 'body.error should be a string');
  await fastify.close();
});

test('SERV-07: GET /file?path=valid.txt returns 200 with file content', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({
    method: 'GET',
    url: '/file',
    query: { path: 'valid.txt' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'hello');
  await fastify.close();
});

test('SERV-07: GET /file without path param returns 400', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({
    method: 'GET',
    url: '/file'
  });
  assert.equal(response.statusCode, 400);
  await fastify.close();
});

// SERV-08: Content-Security-Policy header
test("SERV-08: GET /file response has CSP header containing script-src 'none'", async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({
    method: 'GET',
    url: '/file',
    query: { path: 'valid.txt' }
  });
  const csp = response.headers['content-security-policy'];
  assert.ok(csp, 'Content-Security-Policy header should be present');
  assert.ok(csp.includes("script-src 'none'"), `CSP should contain script-src 'none', got: ${csp}`);
  await fastify.close();
});

// Error format test
test('Error format: 403 response body has all 4 locked fields', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({
    method: 'GET',
    url: '/file',
    query: { path: '../outside' }
  });
  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.ok('error' in body, 'body should have error field');
  assert.ok('status' in body, 'body should have status field');
  assert.ok('requested' in body, 'body should have requested field');
  assert.ok('allowed' in body, 'body should have allowed field');
  assert.equal(body.status, 403);
  assert.ok(Array.isArray(body.allowed), 'allowed should be an array');
  await fastify.close();
});

// Directory listing test
test('Directory listing: GET /file?path=. returns JSON with type directory and entries', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({
    method: 'GET',
    url: '/file',
    query: { path: '.' }
  });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.type, 'directory');
  assert.ok(Array.isArray(body.entries), 'entries should be an array');
  assert.ok(body.entries.includes('valid.txt'), 'entries should include valid.txt');
  assert.ok(body.entries.some(e => e === 'subdir/'), 'entries should include subdir/ with trailing slash');
  await fastify.close();
});

// CLI flag tests
test('CLI: --help flag prints Usage:', () => {
  const result = execSync(
    `node ${path.join(__dirname, '..', 'bin', 'gsd-browser.cjs')} --help`,
    { encoding: 'utf8' }
  );
  assert.ok(result.includes('Usage:'), `expected "Usage:" in output, got: ${result}`);
});

test('CLI: --version flag prints gsd-browser v with version number', () => {
  const result = execSync(
    `node ${path.join(__dirname, '..', 'bin', 'gsd-browser.cjs')} --version`,
    { encoding: 'utf8' }
  );
  assert.match(result, /gsd-browser v\d/);
});

test('CLI: no args and no registered sources exits with code 1', () => {
  // Run with XDG_CONFIG_HOME pointing to a temp empty dir so no real config is loaded
  const tmpConfig = require('node:os').tmpdir();
  try {
    execSync(
      `node ${path.join(__dirname, '..', 'bin', 'gsd-browser.cjs')}`,
      { encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: tmpConfig } }
    );
    assert.fail('Expected non-zero exit code');
  } catch (err) {
    assert.equal(err.status, 1, `expected exit code 1, got ${err.status}`);
  }
});

// ============================================================
// Phase 2 Plan 02: /render route, static CSS, and root / route
// ============================================================

// SERV-02: /render route
test('SERV-02: GET /render?path=test.md returns 200 with HTML content-type', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['content-type'].includes('text/html'), `expected text/html, got ${response.headers['content-type']}`);
  await fastify.close();
});

test('SERV-02: GET /render response contains <!DOCTYPE html>', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  assert.ok(response.body.includes('<!DOCTYPE html>'), 'response body should contain <!DOCTYPE html>');
  await fastify.close();
});

test('REND-02: GET /render response contains .markdown-body', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  assert.ok(response.body.includes('markdown-body'), 'response body should contain markdown-body class');
  await fastify.close();
});

test('REND-02: GET /render response contains breadcrumb with file path', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  assert.ok(response.body.includes('breadcrumb'), 'response body should contain breadcrumb element');
  assert.ok(response.body.includes('test.md'), 'response body should contain the file path');
  await fastify.close();
});

test('REND-02: GET /render response links to /styles/markdown.css', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  assert.ok(response.body.includes('/styles/markdown.css'), 'response body should link to /styles/markdown.css');
  await fastify.close();
});

test('SERV-02: GET /render?path=../evil returns 403', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=../evil' });
  assert.equal(response.statusCode, 403);
  await fastify.close();
});

test('SERV-02: GET /render without path param returns 400', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render' });
  assert.equal(response.statusCode, 400);
  await fastify.close();
});

test('SERV-02: GET /render?path=nonexistent.md returns 404', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=nonexistent.md' });
  assert.equal(response.statusCode, 404);
  await fastify.close();
});

test('SERV-08: GET /render has CSP header', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  const csp = response.headers['content-security-policy'];
  assert.ok(csp, 'Content-Security-Policy header should be present');
  await fastify.close();
});

test('SERV-04: GET /render has Cache-Control: no-store', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  assert.equal(response.headers['cache-control'], 'no-store');
  await fastify.close();
});

test('REND-02: GET /styles/markdown.css returns 200 text/css', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/styles/markdown.css' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['content-type'].includes('text/css'), `expected text/css, got ${response.headers['content-type']}`);
  await fastify.close();
});

test('SERV-02: GET / with README.md present returns 200 with rendered HTML', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['content-type'].includes('text/html'), `expected text/html, got ${response.headers['content-type']}`);
  assert.ok(response.body.includes('<!DOCTYPE html>'), 'response body should contain <!DOCTYPE html>');
  await fastify.close();
});

test('GET / without README.md falls back to directory listing', async () => {
  const noReadmeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-noreadme-'));
  await fs.writeFile(path.join(noReadmeDir, 'file.txt'), 'content');
  const fastify = createServer(makeSources(noReadmeDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  // Should be JSON directory listing
  const body = JSON.parse(response.body);
  assert.equal(body.type, 'directory');
  await fastify.close();
  await fs.rm(noReadmeDir, { recursive: true, force: true });
});

// ============================================================
// Phase 3 Plan 02: Multi-source tests
// ============================================================

test('Multi-source: file from source A is accessible when A is registered', async () => {
  const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-srcA-'));
  await fs.writeFile(path.join(dirA, 'from-a.txt'), 'source A content');

  const sources = [
    { name: 'sourceA', path: dirA, available: true, conventions: [] }
  ];
  const fastify = createServer(sources);
  const response = await fastify.inject({
    method: 'GET',
    url: '/file',
    query: { path: 'from-a.txt' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'source A content');
  await fastify.close();
  await fs.rm(dirA, { recursive: true, force: true });
});

test('Multi-source: path outside ALL sources returns 403 with all source paths in allowed', async () => {
  const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-srcA-'));
  const dirB = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-srcB-'));

  const sources = [
    { name: 'sourceA', path: dirA, available: true, conventions: [] },
    { name: 'sourceB', path: dirB, available: true, conventions: [] },
  ];
  const fastify = createServer(sources);
  const response = await fastify.inject({
    method: 'GET',
    url: '/file',
    query: { path: '../../../etc/passwd' }
  });
  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.ok(Array.isArray(body.allowed), 'allowed should be an array');
  assert.equal(body.allowed.length, 2, 'allowed should list both source paths');
  await fastify.close();
  await fs.rm(dirA, { recursive: true, force: true });
  await fs.rm(dirB, { recursive: true, force: true });
});

test('Multi-source: files from two different sources are both accessible', async () => {
  const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-srcA-'));
  const dirB = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-srcB-'));
  await fs.writeFile(path.join(dirA, 'file-a.txt'), 'from A');
  await fs.writeFile(path.join(dirB, 'file-b.txt'), 'from B');

  const sources = [
    { name: 'sourceA', path: dirA, available: true, conventions: [] },
    { name: 'sourceB', path: dirB, available: true, conventions: [] },
  ];
  const fastify = createServer(sources);

  const responseA = await fastify.inject({
    method: 'GET', url: '/file', query: { path: 'file-a.txt' }
  });
  assert.equal(responseA.statusCode, 200);
  assert.equal(responseA.body, 'from A');

  const responseB = await fastify.inject({
    method: 'GET', url: '/file', query: { path: 'file-b.txt' }
  });
  assert.equal(responseB.statusCode, 200);
  assert.equal(responseB.body, 'from B');

  await fastify.close();
  await fs.rm(dirA, { recursive: true, force: true });
  await fs.rm(dirB, { recursive: true, force: true });
});

test('Multi-source: /render works across sources (finds correct source for file)', async () => {
  const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-srcA-'));
  const dirB = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-srcB-'));
  await fs.writeFile(path.join(dirB, 'doc.md'), '# From Source B\n\nContent here.\n');

  const sources = [
    { name: 'sourceA', path: dirA, available: true, conventions: [] },
    { name: 'sourceB', path: dirB, available: true, conventions: [] },
  ];
  const fastify = createServer(sources);
  const response = await fastify.inject({ method: 'GET', url: '/render?path=doc.md' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('From Source B'), 'rendered content should include heading from source B');
  await fastify.close();
  await fs.rm(dirA, { recursive: true, force: true });
  await fs.rm(dirB, { recursive: true, force: true });
});

test('Multi-source: start() skips unavailable sources and serves available ones', async () => {
  const dirA = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-srcA-'));
  await fs.writeFile(path.join(dirA, 'alive.txt'), 'alive');

  const sources = [
    { name: 'sourceA', path: dirA, available: true, conventions: [] },
    { name: 'missing', path: '/nonexistent/path/that/does/not/exist', available: false, conventions: [] },
  ];

  // start() enriches sources and filters to available-only
  const fastify = await start(0, sources);

  // File from the available source should be accessible
  const response = await fastify.inject({
    method: 'GET', url: '/file', query: { path: 'alive.txt' }
  });
  assert.equal(response.statusCode, 200);

  await fastify.close();
  await fs.rm(dirA, { recursive: true, force: true });
});
