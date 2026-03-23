'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { start } = require('../src/server.js');
const { addSource, removeSource, listSources } = require('../src/sources.js');

const CLI = path.join(__dirname, '..', 'bin', 'gsd-browser.cjs');
const PROJECT_ROOT = path.join(__dirname, '..');

let tmpConfigDir;
let configPath;

before(async () => {
  tmpConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-e2e-'));
  configPath = path.join(tmpConfigDir, 'gsd-browser', 'sources.json');
});

after(async () => {
  await fs.rm(tmpConfigDir, { recursive: true, force: true });
});

// --- CLI smoke tests ---

test('E2E: CLI --help shows subcommands', () => {
  const out = execFileSync('node', [CLI, '--help'], { encoding: 'utf8' });
  assert.match(out, /Commands:/);
  assert.match(out, /add/);
  assert.match(out, /remove/);
  assert.match(out, /list/);
});

test('E2E: CLI --version prints version', () => {
  const out = execFileSync('node', [CLI, '--version'], { encoding: 'utf8' });
  assert.match(out, /\d+\.\d+\.\d+/);
});

// --- Source management round-trip via module API ---

test('E2E: add → list → remove round-trip', async () => {
  const addResult = await addSource(PROJECT_ROOT, {}, configPath);
  assert.ok(addResult.ok, `add failed: ${JSON.stringify(addResult)}`);
  assert.equal(addResult.source.path, PROJECT_ROOT);

  const sources = await listSources(configPath);
  assert.ok(sources.length >= 1);
  const found = sources.find(s => s.path === PROJECT_ROOT);
  assert.ok(found, 'registered source not in list');
  assert.equal(found.available, true);
  assert.ok(Array.isArray(found.conventions));

  const removeResult = await removeSource(found.name, configPath);
  assert.ok(removeResult.ok, `remove failed: ${JSON.stringify(removeResult)}`);

  const afterRemove = await listSources(configPath);
  assert.ok(!afterRemove.find(s => s.path === PROJECT_ROOT), 'source still present after remove');
});

test('E2E: convention discovery finds .planning in this repo', async () => {
  const addResult = await addSource(PROJECT_ROOT, {}, configPath);
  assert.ok(addResult.ok);

  const sources = await listSources(configPath);
  const found = sources.find(s => s.path === PROJECT_ROOT);
  assert.ok(found.conventions.includes('.planning'), `conventions: ${found.conventions}`);

  await removeSource(addResult.source.name, configPath);
});

test('E2E: duplicate add is rejected', async () => {
  const first = await addSource(PROJECT_ROOT, {}, configPath);
  assert.ok(first.ok);
  const second = await addSource(PROJECT_ROOT, {}, configPath);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'duplicate');
  await removeSource(first.source.name, configPath);
});

// --- Server + API smoke tests ---

test('E2E: server serves /api/sources, /sources page, /file', async () => {
  // Register this repo as a source
  await addSource(PROJECT_ROOT, { name: 'e2e-test' }, configPath);
  const sources = await listSources(configPath);

  // Start server on random port
  const server = await start(0, sources, { open: false });
  const addr = server.server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    // GET /api/sources
    const apiRes = await fetch(`${base}/api/sources`);
    assert.equal(apiRes.status, 200);
    const apiBody = await apiRes.json();
    assert.ok(Array.isArray(apiBody.sources), 'expected sources array');
    assert.ok(apiBody.sources.length >= 1);

    // GET /sources (management page)
    const pageRes = await fetch(`${base}/sources`);
    assert.equal(pageRes.status, 200);
    const csp = pageRes.headers.get('content-security-policy');
    assert.ok(csp.includes("script-src 'self'"), `management CSP should allow scripts: ${csp}`);
    const html = await pageRes.text();
    assert.ok(html.includes('gsd-browser'), 'page should mention gsd-browser');

    // GET /file?path=package.json
    const fileRes = await fetch(`${base}/file?path=package.json`);
    assert.equal(fileRes.status, 200);
    const fileBody = await fileRes.text();
    assert.ok(fileBody.includes('"name"'), 'should serve package.json content');

    // GET / (root — directory listing since no README.md)
    const rootRes = await fetch(base);
    assert.equal(rootRes.status, 200);

    // Path traversal blocked
    const traversalRes = await fetch(`${base}/file?path=../../../etc/passwd`);
    assert.equal(traversalRes.status, 403, 'path traversal should be blocked');

    // CSP on /render should be strict
    const renderRes = await fetch(`${base}/render?path=.gitignore`);
    if (renderRes.status === 200) {
      const renderCsp = renderRes.headers.get('content-security-policy');
      assert.ok(renderCsp.includes("script-src 'none'"), `render CSP should block scripts: ${renderCsp}`);
    }
  } finally {
    await server.close();
    await removeSource('e2e-test', configPath);
  }
});

test('E2E: POST and DELETE /api/sources work', async () => {
  // Point the server's API routes at our temp config
  const origXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpConfigDir;

  const sources = await listSources(configPath);
  const server = await start(0, sources, { open: false });
  const addr = server.server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    // POST to add a source
    const postRes = await fetch(`${base}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: PROJECT_ROOT, name: 'api-test' })
    });
    assert.equal(postRes.status, 201);
    const postBody = await postRes.json();
    assert.ok(postBody.source);

    // Duplicate POST returns 409
    const dupRes = await fetch(`${base}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: PROJECT_ROOT })
    });
    assert.equal(dupRes.status, 409);

    // DELETE to remove
    const delRes = await fetch(`${base}/api/sources/api-test`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);

    // DELETE unknown returns 404
    const del404 = await fetch(`${base}/api/sources/nonexistent`, { method: 'DELETE' });
    assert.equal(del404.status, 404);
  } finally {
    await server.close();
    await removeSource('api-test', configPath);
    // Restore XDG_CONFIG_HOME
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = origXdg;
  }
});
