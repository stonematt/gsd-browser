'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const { createServer, start, parseStateMd, parsePhaseDir, getPhaseInfo, isValidBranchName, parsePlanFrontmatter, buildPlanDetails, comparePhaseNums, parseRoadmapPhaseGoals } = require('../src/server.js');
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

// ============================================================
// Phase 4 Plan 02: SPA shell HTML structure smoke tests
// ============================================================

test('NAV-03: GET / response contains id="browse-sidebar" element', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('id="browse-sidebar"'), 'response body should contain id="browse-sidebar"');
  await fastify.close();
});

test('NAV-03: GET / response contains id="browse-content" element', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('id="browse-content"'), 'response body should contain id="browse-content"');
  await fastify.close();
});

test('NAV-03: GET / response contains id="app-header" element', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('id="app-header"'), 'response body should contain id="app-header"');
  await fastify.close();
});

test('NAV-03: GET / response contains id="source-select" element', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('id="source-select"'), 'response body should contain id="source-select"');
  await fastify.close();
});

test('NAV-03: GET / response links theme.css (token-based theming)', async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('href="/styles/theme.css"'), 'response body should link /styles/theme.css for token-based theming');
  await fastify.close();
});

test("NAV-03: GET / has MANAGEMENT_CSP (script-src 'unsafe-inline')", async () => {
  const fastify = createServer(makeSources(testDir));
  const response = await fastify.inject({ method: 'GET', url: '/' });
  const csp = response.headers['content-security-policy'];
  assert.ok(csp, 'Content-Security-Policy header should be present');
  assert.ok(csp.includes("'unsafe-inline'"), `GET / should have MANAGEMENT_CSP with 'unsafe-inline', got: ${csp}`);
  await fastify.close();
});

// ============================================================
// Phase 4.5 Plan 01 - Task 1: Helper utilities (TDD)
// ============================================================

// Separate testDir for Phase 4.5 fixtures
let gsdTestDir;

before(async () => {
  gsdTestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-dash-test-'));

  // STATE.md with YAML frontmatter
  const stateMdContent = [
    '---',
    'gsd_state_version: 1.0',
    'milestone: v1.0',
    'milestone_name: milestone',
    'status: Phase 4.5 context gathered',
    'stopped_at: Phase 4.5 context gathered',
    'last_updated: "2026-03-23T03:42:33.322Z"',
    'last_activity: 2026-03-21 — Added Phase 4.5',
    'progress:',
    '  total_phases: 7',
    '  completed_phases: 4',
    '  total_plans: 9',
    '  completed_plans: 9',
    '  percent: 43',
    '---',
    '',
    '# Project State',
    '',
    'Some content here.',
  ].join('\n');

  await fs.mkdir(path.join(gsdTestDir, '.planning', 'phases', '01-test'), { recursive: true });
  await fs.mkdir(path.join(gsdTestDir, '.planning', 'phases', '02-wip'), { recursive: true });
  await fs.writeFile(path.join(gsdTestDir, '.planning', 'STATE.md'), stateMdContent);

  // 01-test: 2 PLANs, 2 SUMMARYs
  await fs.writeFile(path.join(gsdTestDir, '.planning', 'phases', '01-test', '01-01-PLAN.md'), '# Plan 1\n');
  await fs.writeFile(path.join(gsdTestDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md'), '# Summary 1\n');
  await fs.writeFile(path.join(gsdTestDir, '.planning', 'phases', '01-test', '01-02-PLAN.md'), '# Plan 2\n');
  await fs.writeFile(path.join(gsdTestDir, '.planning', 'phases', '01-test', '01-02-SUMMARY.md'), '# Summary 2\n');

  // 02-wip: 2 PLANs, 0 SUMMARYs
  await fs.writeFile(path.join(gsdTestDir, '.planning', 'phases', '02-wip', '02-01-PLAN.md'), '# Plan 1\n');
  await fs.writeFile(path.join(gsdTestDir, '.planning', 'phases', '02-wip', '02-02-PLAN.md'), '# Plan 2\n');
});

after(async () => {
  await fs.rm(gsdTestDir, { recursive: true, force: true });
});

// parseStateMd tests
test('DASH-02: parseStateMd returns object with status and progress for valid frontmatter', () => {
  const content = [
    '---',
    'status: Phase 4.5 context gathered',
    'progress:',
    '  percent: 43',
    '---',
    '# Content',
  ].join('\n');
  const result = parseStateMd(content);
  assert.ok(result, 'parseStateMd should return non-null for valid frontmatter');
  assert.equal(result.status, 'Phase 4.5 context gathered');
  assert.ok(result.progress, 'result should have progress object');
  assert.equal(result.progress.percent, '43');
});

test('DASH-02: parseStateMd returns null for content with no frontmatter', () => {
  const result = parseStateMd('no frontmatter here');
  assert.equal(result, null);
});

// parsePhaseDir tests
test('DASH-03: parsePhaseDir parses integer phase directory names', () => {
  const result = parsePhaseDir('01-foundation');
  assert.ok(result, 'should parse 01-foundation');
  assert.equal(result.num, 1);
  assert.equal(result.numStr, '01');
  assert.equal(result.slug, 'foundation');
  assert.equal(result.dir, '01-foundation');
});

test('DASH-03: parsePhaseDir parses decimal phase directory names', () => {
  const result = parsePhaseDir('04.5-gsd-dashboard');
  assert.ok(result, 'should parse 04.5-gsd-dashboard');
  assert.equal(result.num, 4.5);
  assert.equal(result.numStr, '04.5');
  assert.equal(result.slug, 'gsd-dashboard');
  assert.equal(result.dir, '04.5-gsd-dashboard');
});

test('DASH-03: parsePhaseDir returns null for invalid directory names', () => {
  const result = parsePhaseDir('invalid');
  assert.equal(result, null);
});

// getPhaseInfo tests
test('DASH-03: getPhaseInfo returns complete for dir with 2 PLANs and 2 SUMMARYs', async () => {
  const phaseDir = path.join(gsdTestDir, '.planning', 'phases', '01-test');
  const info = await getPhaseInfo(phaseDir);
  assert.ok(info, 'getPhaseInfo should return non-null');
  assert.equal(info.status, 'complete');
  assert.equal(info.planCount, 2);
  assert.equal(info.completedPlans, 2);
});

test('DASH-03: getPhaseInfo returns in-progress for dir with 2 PLANs and 0 SUMMARYs', async () => {
  const phaseDir = path.join(gsdTestDir, '.planning', 'phases', '02-wip');
  const info = await getPhaseInfo(phaseDir);
  assert.ok(info, 'getPhaseInfo should return non-null');
  assert.equal(info.status, 'in-progress');
  assert.equal(info.planCount, 2);
  assert.equal(info.completedPlans, 0);
});

test('DASH-03: getPhaseInfo returns pending for empty dir with no plans', async () => {
  const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-empty-phase-'));
  try {
    const info = await getPhaseInfo(emptyDir);
    assert.ok(info, 'getPhaseInfo should return non-null for empty dir');
    assert.equal(info.status, 'pending');
    assert.equal(info.planCount, 0);
    assert.equal(info.completedPlans, 0);
  } finally {
    await fs.rm(emptyDir, { recursive: true, force: true });
  }
});

test('DASH-03: getPhaseInfo returns complete for dir with VERIFICATION.md', async () => {
  const verifyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-verify-phase-'));
  try {
    await fs.writeFile(path.join(verifyDir, '01-01-PLAN.md'), '# Plan\n');
    await fs.writeFile(path.join(verifyDir, '01-VERIFICATION.md'), '# Verification\n');
    const info = await getPhaseInfo(verifyDir);
    assert.ok(info, 'getPhaseInfo should return non-null');
    assert.equal(info.status, 'complete');
  } finally {
    await fs.rm(verifyDir, { recursive: true, force: true });
  }
});

// isValidBranchName tests
test('DASH-05: isValidBranchName returns true for valid branch names', () => {
  assert.equal(isValidBranchName('main'), true);
  assert.equal(isValidBranchName('feature/my-branch'), true);
  assert.equal(isValidBranchName('release-1.0'), true);
});

test('DASH-05: isValidBranchName returns false for dangerous branch names', () => {
  assert.equal(isValidBranchName('feat; rm -rf /'), false);
  assert.equal(isValidBranchName('branch && evil'), false);
  assert.equal(isValidBranchName(''), false);
});

// ============================================================
// Phase 4.5 Plan 01 - Task 2: API endpoints (TDD)
// ============================================================

// More complete GSD fixture for endpoint tests
let gsdSourceDir;   // GSD source: has .planning/STATE.md
let nonGsdSourceDir; // Non-GSD source: no .planning dir

before(async () => {
  gsdSourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-api-test-'));
  nonGsdSourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-nongsd-test-'));

  // GSD source: full .planning structure
  const stateMdContent = [
    '---',
    'gsd_state_version: 1.0',
    'milestone: v1.0',
    'milestone_name: milestone',
    'status: Phase 2 context gathered',
    'stopped_at: Phase 2 context gathered',
    'last_updated: "2026-03-23T03:42:33.322Z"',
    'last_activity: 2026-03-21 — Added Phase 2',
    'progress:',
    '  total_phases: 3',
    '  completed_phases: 1',
    '  total_plans: 4',
    '  completed_plans: 2',
    '  percent: 33',
    '---',
    '',
    '# Project State',
  ].join('\n');

  await fs.mkdir(path.join(gsdSourceDir, '.planning', 'phases', '01-foundation'), { recursive: true });
  await fs.mkdir(path.join(gsdSourceDir, '.planning', 'phases', '02-wip'), { recursive: true });
  await fs.writeFile(path.join(gsdSourceDir, '.planning', 'STATE.md'), stateMdContent);
  await fs.writeFile(path.join(gsdSourceDir, '.planning', 'PROJECT.md'), '# Project\n');
  await fs.writeFile(path.join(gsdSourceDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');

  // phase 01-foundation: complete (1 plan, 1 summary)
  await fs.writeFile(path.join(gsdSourceDir, '.planning', 'phases', '01-foundation', '01-01-PLAN.md'), '# Plan\n');
  await fs.writeFile(path.join(gsdSourceDir, '.planning', 'phases', '01-foundation', '01-01-SUMMARY.md'), '# Summary\n');

  // phase 02-wip: in-progress (1 plan, no summary)
  await fs.writeFile(path.join(gsdSourceDir, '.planning', 'phases', '02-wip', '02-01-PLAN.md'), '# Plan\n');
});

after(async () => {
  await fs.rm(gsdSourceDir, { recursive: true, force: true });
  await fs.rm(nonGsdSourceDir, { recursive: true, force: true });
});

// Helper: create server with both sources
function makeGsdSources(gsdDir) {
  return [{ name: 'my-project', path: gsdDir, available: true, conventions: [] }];
}

function makeMixedSources(gsdDir, nonGsdDir) {
  return [
    { name: 'my-project', path: gsdDir, available: true, conventions: [] },
    { name: 'plain-repo', path: nonGsdDir, available: true, conventions: [] },
  ];
}

// DASH-01: /api/dashboard with one GSD source
test('DASH-01: GET /api/dashboard returns { projects, other } with GSD source in projects', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(Array.isArray(body.projects), 'body.projects should be an array');
    assert.ok(Array.isArray(body.other), 'body.other should be an array');
    assert.equal(body.projects.length, 1, 'should have 1 GSD project');
    assert.equal(body.other.length, 0, 'should have 0 non-GSD sources');
    await fastify.close();
  });
});

test('DASH-01: GSD project entry has isGsd, progress, phaseStatus, quickLinks fields', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
    const body = JSON.parse(response.body);
    const project = body.projects[0];
    assert.equal(project.isGsd, true);
    assert.ok(project.progress, 'project should have progress object');
    assert.ok(Array.isArray(project.phaseStatus), 'project should have phaseStatus array');
    assert.ok(Array.isArray(project.quickLinks), 'project should have quickLinks array');
    await fastify.close();
  });
});

test('DASH-02: GSD project quickLinks includes files that exist', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
    const body = JSON.parse(response.body);
    const project = body.projects[0];
    const stateLink = project.quickLinks.find(l => l.name === 'STATE.md');
    assert.ok(stateLink, 'quickLinks should include STATE.md');
    assert.equal(stateLink.exists, true, 'STATE.md should exist');
    await fastify.close();
  });
});

// DASH-06: non-GSD source in other array
test('DASH-06: GET /api/dashboard with non-GSD source returns it in other array', async () => {
  await withTempConfig(async () => {
    const fastify = createServer([
      { name: 'plain-repo', path: nonGsdSourceDir, available: true, conventions: [] }
    ]);
    const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.projects.length, 0, 'should have 0 GSD projects');
    assert.equal(body.other.length, 1, 'should have 1 non-GSD source');
    assert.equal(body.other[0].name, 'plain-repo');
    await fastify.close();
  });
});

test('DASH-06: GET /api/dashboard with mixed sources returns both in correct arrays', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeMixedSources(gsdSourceDir, nonGsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.projects.length, 1, 'should have 1 GSD project');
    assert.equal(body.other.length, 1, 'should have 1 non-GSD source');
    await fastify.close();
  });
});

// DASH-01/DASH-03: CSP header on /api/dashboard
test('DASH-01: GET /api/dashboard has MANAGEMENT_CSP header', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
    const csp = response.headers['content-security-policy'];
    assert.ok(csp, 'CSP header should be present');
    assert.ok(csp.includes("'unsafe-inline'"), `dashboard should have MANAGEMENT_CSP, got: ${csp}`);
    await fastify.close();
  });
});

// DASH-03: /api/projects/:name/detail
test('DASH-03: GET /api/projects/:name/detail returns { source, state, phases, branch, branches }', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/projects/my-project/detail' });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.source, 'should have source');
    assert.ok(body.state !== undefined, 'should have state field');
    assert.ok(Array.isArray(body.phases), 'should have phases array');
    await fastify.close();
  });
});

test('DASH-03: detail phases array has correct status per phase', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/projects/my-project/detail' });
    const body = JSON.parse(response.body);
    const phases = body.phases;
    const foundation = phases.find(p => p.slug === 'foundation');
    const wip = phases.find(p => p.slug === 'wip');
    assert.ok(foundation, '01-foundation phase should be present');
    assert.equal(foundation.status, 'complete', '01-foundation should be complete');
    assert.ok(wip, '02-wip phase should be present');
    assert.equal(wip.status, 'in-progress', '02-wip should be in-progress');
    await fastify.close();
  });
});

test('DASH-03: GET /api/projects/nonexistent/detail returns 404', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/projects/nonexistent/detail' });
    assert.equal(response.statusCode, 404);
    await fastify.close();
  });
});

// DASH-05: /api/projects/:name/branches
test('DASH-05: GET /api/projects/:name/branches returns { branches: [] } for non-git directory', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/projects/my-project/branches' });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(Array.isArray(body.branches), 'branches should be an array');
    // gsdSourceDir is not a git repo, so should return []
    assert.equal(body.branches.length, 0, 'should return empty array for non-git dir');
    await fastify.close();
  });
});

test('DASH-05: GET /api/projects/nonexistent/branches returns 404', async () => {
  await withTempConfig(async () => {
    const fastify = createServer(makeGsdSources(gsdSourceDir));
    const response = await fastify.inject({ method: 'GET', url: '/api/projects/nonexistent/branches' });
    assert.equal(response.statusCode, 404);
    await fastify.close();
  });
});

// DASH-12: parsePlanFrontmatter requirements parsing
test('DASH-12: parsePlanFrontmatter returns requirements array from multi-line YAML list', () => {
  const content = `---
phase: 04.5.1-dashboard-ux-polish
plan: 01
wave: 1
depends_on: []
requirements:
  - DASH-01
  - DASH-02
---

# Plan content
`;
  const result = parsePlanFrontmatter(content);
  assert.deepEqual(result.requirements, ['DASH-01', 'DASH-02']);
});

test('DASH-12: parsePlanFrontmatter returns empty requirements array when requirements field is absent', () => {
  const content = `---
phase: 04.5.1-dashboard-ux-polish
plan: 01
wave: 1
depends_on: []
---

# Plan content
`;
  const result = parsePlanFrontmatter(content);
  assert.deepEqual(result.requirements, []);
});

test('DASH-12: parsePlanFrontmatter returns empty requirements array for empty requirements section', () => {
  const content = `---
phase: 04.5.1-dashboard-ux-polish
plan: 01
requirements:
---

# Plan content
`;
  const result = parsePlanFrontmatter(content);
  assert.deepEqual(result.requirements, []);
});

test('DASH-12: parsePlanFrontmatter supports inline array format for requirements', () => {
  const content = `---
phase: 04.5.1-dashboard-ux-polish
plan: 01
requirements: [DASH-01, DASH-02]
---

# Plan content
`;
  const result = parsePlanFrontmatter(content);
  assert.deepEqual(result.requirements, ['DASH-01', 'DASH-02']);
});

test('DASH-12: parsePlanFrontmatter preserves existing wave and dependsOn parsing alongside requirements', () => {
  const content = `---
wave: 2
depends_on: [01-PLAN.md]
requirements:
  - DASH-03
---
`;
  const result = parsePlanFrontmatter(content);
  assert.equal(result.wave, 2);
  assert.deepEqual(result.dependsOn, ['01-PLAN.md']);
  assert.deepEqual(result.requirements, ['DASH-03']);
});

test('DASH-12: buildPlanDetails includes requirements in each returned plan object', async () => {
  const content = `---
wave: 1
depends_on: []
requirements:
  - DASH-10
  - DASH-11
---
# Plan
`;
  const readFn = async (_file) => content;
  const result = await buildPlanDetails(readFn, ['01-PLAN.md']);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].requirements, ['DASH-10', 'DASH-11']);
});

test('DASH-12: buildPlanDetails includes empty requirements array when plan file has no requirements', async () => {
  const readFn = async (_file) => null;
  const result = await buildPlanDetails(readFn, ['01-PLAN.md']);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].requirements, []);
});

// ============================================================
// Phase 4.5.3 Plan 01 - Task 1: Depth-2 regex fixes and comparePhaseNums (TDD)
// ============================================================

describe('parsePhaseDir depth-2', () => {
  test('parsePhaseDir parses depth-2 phase dir "04.5.1-dashboard-ux-polish"', () => {
    const result = parsePhaseDir('04.5.1-dashboard-ux-polish');
    assert.ok(result, 'should parse depth-2 dir name');
    assert.equal(result.numStr, '04.5.1');
    assert.equal(result.slug, 'dashboard-ux-polish');
    assert.equal(result.dir, '04.5.1-dashboard-ux-polish');
  });

  test('parsePhaseDir parses depth-2 phase dir "04.5.2-theme-token-system"', () => {
    const result = parsePhaseDir('04.5.2-theme-token-system');
    assert.ok(result, 'should parse 04.5.2-theme-token-system');
    assert.equal(result.numStr, '04.5.2');
    assert.equal(result.slug, 'theme-token-system');
  });

  test('parsePhaseDir parses depth-2 phase dir "04.5.3-dashboard-tile-redesign"', () => {
    const result = parsePhaseDir('04.5.3-dashboard-tile-redesign');
    assert.ok(result, 'should parse 04.5.3-dashboard-tile-redesign');
    assert.equal(result.numStr, '04.5.3');
    assert.equal(result.slug, 'dashboard-tile-redesign');
  });

  test('parsePhaseDir still parses integer dir "01-foundation"', () => {
    const result = parsePhaseDir('01-foundation');
    assert.ok(result, 'should still parse integer dir');
    assert.equal(result.numStr, '01');
    assert.equal(result.slug, 'foundation');
  });

  test('parsePhaseDir still parses decimal dir "04.5-gsd-dashboard"', () => {
    const result = parsePhaseDir('04.5-gsd-dashboard');
    assert.ok(result, 'should still parse decimal dir');
    assert.equal(result.numStr, '04.5');
    assert.equal(result.slug, 'gsd-dashboard');
  });
});

describe('parseRoadmapPhaseNames depth-2', () => {
  const { parseRoadmapPhaseNames } = require('../src/server.js');

  test('parseRoadmapPhaseNames extracts name for depth-2 phase heading', () => {
    const content = [
      '### Phase 4.5.1: Dashboard UX Polish',
      'Some text',
      '### Phase 4.5.2: Theme Token System (INSERTED)',
      'More text',
    ].join('\n');
    const names = parseRoadmapPhaseNames(content);
    assert.equal(names['4.5.1'], 'Dashboard UX Polish');
    assert.equal(names['4.5.2'], 'Theme Token System');
  });

  test('parseRoadmapPhaseNames still works for depth-0 and depth-1 headings', () => {
    const content = [
      '### Phase 4: Browser UI',
      'text',
      '### Phase 4.5: GSD Dashboard',
      'text',
    ].join('\n');
    const names = parseRoadmapPhaseNames(content);
    assert.equal(names['4'], 'Browser UI');
    assert.equal(names['4.5'], 'GSD Dashboard');
  });
});

describe('comparePhaseNums', () => {
  test('comparePhaseNums("4", "4.5") returns negative (4 before 4.5)', () => {
    assert.ok(comparePhaseNums('4', '4.5') < 0);
  });

  test('comparePhaseNums("4.5", "4.5.1") returns negative', () => {
    assert.ok(comparePhaseNums('4.5', '4.5.1') < 0);
  });

  test('comparePhaseNums("4.5.1", "4.5.2") returns negative', () => {
    assert.ok(comparePhaseNums('4.5.1', '4.5.2') < 0);
  });

  test('comparePhaseNums("4.5.2", "5") returns negative', () => {
    assert.ok(comparePhaseNums('4.5.2', '5') < 0);
  });

  test('comparePhaseNums("4", "4") returns 0', () => {
    assert.equal(comparePhaseNums('4', '4'), 0);
  });

  test('comparePhaseNums("4.5", "4") returns positive', () => {
    assert.ok(comparePhaseNums('4.5', '4') > 0);
  });

  test('phases with numStr sort correctly using comparePhaseNums', () => {
    const phases = [
      { numStr: '4.5.2' },
      { numStr: '4' },
      { numStr: '4.5.1' },
      { numStr: '5' },
      { numStr: '4.5' },
    ];
    phases.sort((a, b) => comparePhaseNums(a.numStr, b.numStr));
    const order = phases.map(p => p.numStr);
    assert.deepEqual(order, ['4', '4.5', '4.5.1', '4.5.2', '5']);
  });
});

// ============================================================
// Phase 4.5.3 Plan 01 - Task 2: requirementCount and phaseGoals (TDD)
// ============================================================

describe('parseRoadmapPhaseGoals', () => {
  test('parseRoadmapPhaseGoals extracts goal text for a depth-0 phase', () => {
    const content = [
      '### Phase 4: Browser UI',
      '**Goal**: Users can navigate the file tree.',
      'Other text',
    ].join('\n');
    const goals = parseRoadmapPhaseGoals(content);
    assert.equal(goals['4'], 'Users can navigate the file tree.');
  });

  test('parseRoadmapPhaseGoals extracts goal for a depth-1 phase', () => {
    const content = [
      '### Phase 4.5: GSD Dashboard',
      '**Goal**: Visualize project progress at a glance.',
    ].join('\n');
    const goals = parseRoadmapPhaseGoals(content);
    assert.equal(goals['4.5'], 'Visualize project progress at a glance.');
  });

  test('parseRoadmapPhaseGoals extracts goal for a depth-2 phase', () => {
    const content = [
      '### Phase 4.5.1: Dashboard UX Polish',
      '**Goal**: Polish timeline and card layout.',
    ].join('\n');
    const goals = parseRoadmapPhaseGoals(content);
    assert.equal(goals['4.5.1'], 'Polish timeline and card layout.');
  });

  test('parseRoadmapPhaseGoals handles multiple phases', () => {
    const content = [
      '### Phase 4: Browser UI',
      '**Goal**: First goal.',
      '',
      '### Phase 4.5: GSD Dashboard',
      '**Goal**: Second goal.',
    ].join('\n');
    const goals = parseRoadmapPhaseGoals(content);
    assert.equal(goals['4'], 'First goal.');
    assert.equal(goals['4.5'], 'Second goal.');
  });

  test('parseRoadmapPhaseGoals returns empty object for content with no phases', () => {
    const goals = parseRoadmapPhaseGoals('# Just a heading\n\nSome text.');
    assert.deepEqual(goals, {});
  });

  test('parseRoadmapPhaseGoals returns empty goal for phase with no Goal line', () => {
    const content = '### Phase 4: Browser UI\n\nSome other text.\n\n### Phase 5: Next';
    const goals = parseRoadmapPhaseGoals(content);
    assert.ok(!('4' in goals), 'Phase 4 should not have an entry if no Goal line found');
  });
});

describe('requirementCount in buildPhaseListFromReader', () => {
  test('buildPhaseListFromReader phase object has requirementCount field', async () => {
    const { buildPhaseListFromReader } = require('../src/server.js');
    const reader = {
      listDir: async (p) => {
        if (p === '.planning/phases') return ['01-test'];
        if (p === '.planning/phases/01-test') return ['01-01-PLAN.md', '01-01-SUMMARY.md'];
        return [];
      },
      readFile: async (_f) => `---\nwave: 1\ndepends_on: []\nrequirements: [DASH-01, DASH-02]\n---\n# Plan\n`,
    };
    const phases = await buildPhaseListFromReader(reader);
    assert.equal(phases.length, 1);
    assert.ok('requirementCount' in phases[0], 'phase should have requirementCount field');
    assert.equal(phases[0].requirementCount, 2);
  });

  test('buildPhaseListFromReader deduplicates requirementCount across plans', async () => {
    const { buildPhaseListFromReader } = require('../src/server.js');
    const reader = {
      listDir: async (p) => {
        if (p === '.planning/phases') return ['01-test'];
        if (p === '.planning/phases/01-test') return ['01-01-PLAN.md', '01-02-PLAN.md'];
        return [];
      },
      readFile: async (_f) => `---\nwave: 1\ndepends_on: []\nrequirements: [DASH-01, DASH-02]\n---\n# Plan\n`,
    };
    const phases = await buildPhaseListFromReader(reader);
    assert.equal(phases[0].requirementCount, 2, 'deduped: DASH-01 and DASH-02 across two plans');
  });

  test('buildPhaseListFromReader requirementCount is 0 for phase with no plans', async () => {
    const { buildPhaseListFromReader } = require('../src/server.js');
    const reader = {
      listDir: async (p) => {
        if (p === '.planning/phases') return ['01-empty'];
        if (p === '.planning/phases/01-empty') return [];
        return [];
      },
      readFile: async (_f) => null,
    };
    const phases = await buildPhaseListFromReader(reader);
    // empty phase dir returns no phases (getPhaseInfo-like filtering)
    assert.equal(phases.length, 0, 'empty phase dir should produce no phase');
  });
});

describe('/api/dashboard phaseGoals and requirementCount', () => {
  test('/api/dashboard phaseStatus entries include requirementCount field', async () => {
    await withTempConfig(async () => {
      const fastify = createServer(makeGsdSources(gsdSourceDir));
      const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
      const body = JSON.parse(response.body);
      const project = body.projects[0];
      assert.ok(Array.isArray(project.phaseStatus), 'phaseStatus should be an array');
      for (const phase of project.phaseStatus) {
        assert.ok('requirementCount' in phase, `phase ${phase.numStr} should have requirementCount`);
        assert.ok(typeof phase.requirementCount === 'number', 'requirementCount should be a number');
      }
      await fastify.close();
    });
  });

  test('/api/dashboard response includes phaseGoals map', async () => {
    await withTempConfig(async () => {
      const fastify = createServer(makeGsdSources(gsdSourceDir));
      const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
      const body = JSON.parse(response.body);
      const project = body.projects[0];
      assert.ok('phaseGoals' in project, 'project should have phaseGoals field');
      assert.ok(typeof project.phaseGoals === 'object', 'phaseGoals should be an object');
      await fastify.close();
    });
  });

  test('/api/dashboard response includes phaseNames map', async () => {
    await withTempConfig(async () => {
      const fastify = createServer(makeGsdSources(gsdSourceDir));
      const response = await fastify.inject({ method: 'GET', url: '/api/dashboard' });
      const body = JSON.parse(response.body);
      const project = body.projects[0];
      assert.ok('phaseNames' in project, 'project should have phaseNames field');
      assert.ok(typeof project.phaseNames === 'object', 'phaseNames should be an object');
      await fastify.close();
    });
  });
});

describe('/api/projects/:name/detail phaseGoals', () => {
  test('/api/projects/:name/detail response includes phaseGoals map', async () => {
    await withTempConfig(async () => {
      const fastify = createServer(makeGsdSources(gsdSourceDir));
      const response = await fastify.inject({ method: 'GET', url: '/api/projects/my-project/detail' });
      const body = JSON.parse(response.body);
      assert.ok('phaseGoals' in body, 'detail response should have phaseGoals field');
      assert.ok(typeof body.phaseGoals === 'object', 'phaseGoals should be an object');
      await fastify.close();
    });
  });
});
