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

  // Phase 4 Plan 01: Additional fixtures for tree API and fragment mode tests
  await fs.mkdir(path.join(testDir, '.planning'), { recursive: true });
  await fs.writeFile(path.join(testDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');

  await fs.mkdir(path.join(testDir, 'docs'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'docs', 'guide.md'), '# Guide\n');

  await fs.mkdir(path.join(testDir, 'empty-dir'), { recursive: true });

  await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'src', 'app.js'), 'const x = 1;\n');

  await fs.mkdir(path.join(testDir, 'notes'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'notes', 'todo.md'), '# Todo\n');
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

test('GET / serves the browse page with 200', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['content-type'].includes('text/html'), `expected text/html, got ${response.headers['content-type']}`);
  assert.ok(response.body.includes('gsd-browser'), 'response body should contain gsd-browser title');
  assert.ok(response.headers['content-security-policy'].includes("'unsafe-inline'"), 'browse page needs relaxed CSP');
  await fastify.close();
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

// ============================================================
// Phase 3 Plan 03: Source management REST API and /sources page
// ============================================================

// Helper: create an isolated config directory for API tests
async function withTempConfig(fn) {
  const tmpConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-config-'));
  const origXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpConfigDir;
  try {
    return await fn(tmpConfigDir);
  } finally {
    process.env.XDG_CONFIG_HOME = origXdg === undefined ? undefined : origXdg;
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    await fs.rm(tmpConfigDir, { recursive: true, force: true });
  }
}

test('SRC-06: GET /api/sources returns 200 with sources array', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeSources(testDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/sources' });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(Array.isArray(body.sources), 'body.sources should be an array');
    await fastify.close();
  });
});

test('SRC-06: POST /api/sources adds a source and returns 201', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeSources(testDir));
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/sources',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: testDir })
    });
    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body);
    assert.ok(body.source, 'response should include source object');
    assert.equal(body.source.path, testDir);
    await fastify.close();
  });
});

test('SRC-06: POST /api/sources with duplicate returns 409', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeSources(testDir));
    // Add once
    await fastify.inject({
      method: 'POST',
      url: '/api/sources',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: testDir })
    });
    // Add again — should conflict
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/sources',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: testDir })
    });
    assert.equal(response.statusCode, 409);
    const body = JSON.parse(response.body);
    assert.ok(body.error, 'response should include error message');
    await fastify.close();
  });
});

test('SRC-06: DELETE /api/sources/:name removes and returns 200', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeSources(testDir));
    // Add first so we have something to remove
    const addRes = await fastify.inject({
      method: 'POST',
      url: '/api/sources',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: testDir, name: 'to-remove' })
    });
    assert.equal(addRes.statusCode, 201);

    const delRes = await fastify.inject({
      method: 'DELETE',
      url: '/api/sources/to-remove'
    });
    assert.equal(delRes.statusCode, 200);
    const body = JSON.parse(delRes.body);
    assert.ok(body.removed, 'response should include removed source');
    await fastify.close();
  });
});

test('SRC-06: DELETE /api/sources/unknown returns 404', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeSources(testDir));
    const response = await fastify.inject({
      method: 'DELETE',
      url: '/api/sources/no-such-source-name'
    });
    assert.equal(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.ok(body.error, 'response should include error message');
    await fastify.close();
  });
});

test('SRC-06: GET /sources returns 200 with text/html content-type', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/sources' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['content-type'].includes('text/html'), `expected text/html, got ${response.headers['content-type']}`);
  await fastify.close();
});

test("SRC-06: GET /sources has relaxed CSP (script-src 'self')", async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/sources' });
  const csp = response.headers['content-security-policy'];
  assert.ok(csp, 'Content-Security-Policy header should be present');
  assert.ok(csp.includes("script-src 'self'"), `CSP should contain script-src 'self', got: ${csp}`);
  assert.ok(!csp.includes("script-src 'none'"), `CSP should NOT contain script-src 'none', got: ${csp}`);
  await fastify.close();
});

test("SRC-06: GET /render still has strict CSP (script-src 'none')", async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  const csp = response.headers['content-security-policy'];
  assert.ok(csp, 'Content-Security-Policy header should be present');
  assert.ok(csp.includes("script-src 'none'"), `CSP should contain script-src 'none', got: ${csp}`);
  await fastify.close();
});

// ============================================================
// Phase 4 Plan 01: Tree API and fragment mode
// ============================================================

// Additional fixtures are created in the shared before() hook at the top of this file.

// Tree endpoint tests
test('NAV-01: GET /api/sources/:name/tree returns 200 with source and tree fields', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/api/sources/test/tree' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.ok(body.source, 'response should have source field');
  assert.ok(Array.isArray(body.tree), 'response should have tree array');
  await fastify.close();
});

test('NAV-01: tree includes .md files with { name, type: "file", path } shape', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/api/sources/test/tree' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  // Find the README.md at root
  const readme = body.tree.find(n => n.name === 'README.md' && n.type === 'file');
  assert.ok(readme, 'README.md should be in tree as a file node');
  assert.ok(readme.path, 'file node should have a path');
  assert.equal(readme.type, 'file');
  await fastify.close();
});

test('NAV-01: tree includes directories with { name, type: "dir", children } shape', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/api/sources/test/tree' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  // .planning is a convention dir, should have children
  const planningDir = body.tree.find(n => n.name === '.planning' && n.type === 'dir');
  assert.ok(planningDir, '.planning dir should be in tree');
  assert.ok(Array.isArray(planningDir.children), '.planning dir should have children array');
  await fastify.close();
});

test('NAV-01: convention directories (.planning) have convention: true flag', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/api/sources/test/tree' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  const planningDir = body.tree.find(n => n.name === '.planning');
  assert.ok(planningDir, '.planning dir should be in tree');
  assert.equal(planningDir.convention, true, '.planning should have convention: true');
  await fastify.close();
});

test('NAV-01: non-convention directories have convention: false flag', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/api/sources/test/tree' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  const notesDir = body.tree.find(n => n.name === 'notes' && n.type === 'dir');
  assert.ok(notesDir, 'notes dir should be in tree');
  assert.equal(notesDir.convention, false, 'notes dir should have convention: false');
  await fastify.close();
});

test('NAV-01: directories with no .md files at any depth are omitted from tree', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/api/sources/test/tree' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  // empty-dir has no .md files, should be absent
  const emptyDir = body.tree.find(n => n.name === 'empty-dir');
  assert.equal(emptyDir, undefined, 'empty-dir should be omitted from tree');
  // src/ has only .js files, should be absent
  const srcDir = body.tree.find(n => n.name === 'src');
  assert.equal(srcDir, undefined, 'src/ (no .md files) should be omitted from tree');
  await fastify.close();
});

test('NAV-01: convention directories are sorted before non-convention directories', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/api/sources/test/tree' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  const dirs = body.tree.filter(n => n.type === 'dir');
  const firstConventionIdx = dirs.findIndex(n => n.convention === true);
  const firstNonConventionIdx = dirs.findIndex(n => n.convention === false);
  if (firstConventionIdx !== -1 && firstNonConventionIdx !== -1) {
    assert.ok(
      firstConventionIdx < firstNonConventionIdx,
      `convention dirs should come before non-convention dirs, got order: ${dirs.map(d => d.name).join(', ')}`
    );
  }
  await fastify.close();
});

test('NAV-01: GET /api/sources/nonexistent/tree returns 404', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/api/sources/nonexistent/tree' });
  assert.equal(response.statusCode, 404);
  await fastify.close();
});

// Fragment mode tests
test('NAV-02: GET /render?path=X&fragment=true returns HTML without "<!DOCTYPE html>"', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md&fragment=true' });
  assert.equal(response.statusCode, 200);
  assert.ok(!response.body.includes('<!DOCTYPE html>'), 'fragment should NOT contain <!DOCTYPE html>');
  await fastify.close();
});

test('NAV-02: GET /render?path=X&fragment=true returns HTML containing "markdown-body"', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md&fragment=true' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('markdown-body'), 'fragment should contain markdown-body class');
  await fastify.close();
});

test('NAV-02: GET /render?path=X (no fragment param) still returns full page with "<!DOCTYPE html>"', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('<!DOCTYPE html>'), 'full page should contain <!DOCTYPE html>');
  await fastify.close();
});

test("NAV-02: GET /render?path=X&fragment=true has strict CSP (script-src 'none')", async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/render?path=test.md&fragment=true' });
  const csp = response.headers['content-security-policy'];
  assert.ok(csp, 'Content-Security-Policy header should be present');
  assert.ok(csp.includes("script-src 'none'"), `fragment CSP should contain script-src 'none', got: ${csp}`);
  await fastify.close();
});
