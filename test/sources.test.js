'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// We override XDG_CONFIG_HOME before requiring sources.js so tests use a temp dir.
// All tests that call sources.js functions pass configPath explicitly for isolation.

const {
  getConfigPath,
  loadConfig,
  saveConfig,
  addSource,
  removeSource,
  listSources,
  discoverConventions,
  enrichSourcesWithConventions,
} = require('../src/sources.js');

let testDir;
let configPath;
let sourceDir;     // a mock "repo" directory for convention discovery
let sourceDirA;    // another mock "repo" for duplicate name testing

before(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-sources-test-'));
  configPath = path.join(testDir, 'sources.json');

  // A source directory with all three conventions
  sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-source-dir-'));
  await fs.mkdir(path.join(sourceDir, '.planning'));
  await fs.mkdir(path.join(sourceDir, 'docs'));
  await fs.writeFile(path.join(sourceDir, 'README.md'), '# test');

  // Another source directory with no conventions
  sourceDirA = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-source-dir-a-'));
});

after(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.rm(sourceDir, { recursive: true, force: true });
  await fs.rm(sourceDirA, { recursive: true, force: true });
});

// ============================================================
// getConfigPath
// ============================================================

test('getConfigPath: returns XDG_CONFIG_HOME-based path when env var is set', () => {
  const orig = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = '/tmp/xdg-test';
  const result = getConfigPath();
  process.env.XDG_CONFIG_HOME = orig;
  assert.equal(result, '/tmp/xdg-test/gsd-browser/sources.json');
});

test('getConfigPath: falls back to ~/.config when XDG_CONFIG_HOME is unset', () => {
  const orig = process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_CONFIG_HOME;
  const result = getConfigPath();
  process.env.XDG_CONFIG_HOME = orig;
  assert.ok(result.includes('.config/gsd-browser/sources.json'), `expected ~/.config path, got: ${result}`);
});

// ============================================================
// loadConfig
// ============================================================

test('loadConfig: returns { sources: [] } when config file does not exist', async () => {
  const missingPath = path.join(testDir, 'nonexistent', 'sources.json');
  const config = await loadConfig(missingPath);
  assert.deepEqual(config, { sources: [] });
});

test('loadConfig: parses and returns valid JSON config', async () => {
  const data = { sources: [{ name: 'test', path: '/tmp/test', addedAt: '2026-01-01T00:00:00.000Z' }] };
  await fs.writeFile(configPath, JSON.stringify(data), 'utf8');
  const config = await loadConfig(configPath);
  assert.deepEqual(config, data);
});

// ============================================================
// saveConfig
// ============================================================

test('saveConfig: creates directory if needed and writes JSON', async () => {
  const nestedPath = path.join(testDir, 'nested', 'dir', 'sources.json');
  const data = { sources: [] };
  await saveConfig(data, nestedPath);
  const raw = await fs.readFile(nestedPath, 'utf8');
  assert.deepEqual(JSON.parse(raw), data);
});

test('saveConfig / loadConfig: round-trips data correctly', async () => {
  const roundTripPath = path.join(testDir, 'roundtrip.json');
  const data = {
    sources: [
      { name: 'my-project', path: '/tmp/my-project', addedAt: '2026-03-13T10:00:00.000Z' },
    ],
  };
  await saveConfig(data, roundTripPath);
  const loaded = await loadConfig(roundTripPath);
  assert.deepEqual(loaded, data);
});

// ============================================================
// addSource
// ============================================================

test('addSource: stores resolved absolute path, name, and addedAt timestamp', async () => {
  const cleanPath = path.join(testDir, 'add-basic.json');
  const result = await addSource(sourceDir, {}, cleanPath);
  assert.ok(result.ok, `expected ok, got: ${JSON.stringify(result)}`);
  const config = await loadConfig(cleanPath);
  assert.equal(config.sources.length, 1);
  const src = config.sources[0];
  assert.equal(src.path, path.resolve(sourceDir));
  assert.ok(typeof src.name === 'string' && src.name.length > 0, 'should have a name');
  assert.ok(typeof src.addedAt === 'string', 'should have addedAt');
  assert.ok(!isNaN(Date.parse(src.addedAt)), 'addedAt should be a valid ISO date');
});

test('addSource: auto-labels from path.basename when no name given', async () => {
  const cleanPath = path.join(testDir, 'add-autolabel.json');
  const result = await addSource(sourceDir, {}, cleanPath);
  assert.ok(result.ok);
  const config = await loadConfig(cleanPath);
  assert.equal(config.sources[0].name, path.basename(sourceDir));
});

test('addSource: uses provided name option', async () => {
  const cleanPath = path.join(testDir, 'add-named.json');
  const result = await addSource(sourceDir, { name: 'custom-name' }, cleanPath);
  assert.ok(result.ok);
  const config = await loadConfig(cleanPath);
  assert.equal(config.sources[0].name, 'custom-name');
});

test('addSource: rejects duplicate resolved path with ok: false, reason: duplicate', async () => {
  const cleanPath = path.join(testDir, 'add-dup.json');
  await addSource(sourceDir, {}, cleanPath);
  const result = await addSource(sourceDir, {}, cleanPath);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'duplicate');
});

test('addSource: auto-suffixes duplicate name with -2, -3, etc.', async () => {
  const cleanPath = path.join(testDir, 'add-suffix.json');
  // Two different paths but same basename
  const dir1 = await fs.mkdtemp(path.join(os.tmpdir(), 'myproject-'));
  const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'myproject-'));
  try {
    const result1 = await addSource(dir1, { name: 'myproject' }, cleanPath);
    assert.ok(result1.ok);
    const result2 = await addSource(dir2, { name: 'myproject' }, cleanPath);
    assert.ok(result2.ok);
    const config = await loadConfig(cleanPath);
    const names = config.sources.map((s) => s.name);
    assert.ok(names.includes('myproject'), 'first should keep original name');
    assert.ok(names.includes('myproject-2'), 'second should get -2 suffix');
  } finally {
    await fs.rm(dir1, { recursive: true, force: true });
    await fs.rm(dir2, { recursive: true, force: true });
  }
});

test('addSource: with no targetPath argument defaults to current directory', async () => {
  const cleanPath = path.join(testDir, 'add-cwd.json');
  const result = await addSource(undefined, {}, cleanPath);
  assert.ok(result.ok);
  const config = await loadConfig(cleanPath);
  assert.equal(config.sources[0].path, path.resolve('.'));
});

test('addSource: resolves relative path to absolute', async () => {
  const cleanPath = path.join(testDir, 'add-relative.json');
  const result = await addSource('.', {}, cleanPath);
  assert.ok(result.ok);
  const config = await loadConfig(cleanPath);
  assert.equal(config.sources[0].path, path.resolve('.'));
});

// ============================================================
// removeSource
// ============================================================

test('removeSource: removes by name and returns { ok: true, removed: source }', async () => {
  const cleanPath = path.join(testDir, 'remove-by-name.json');
  await addSource(sourceDir, { name: 'to-remove' }, cleanPath);
  const result = await removeSource('to-remove', cleanPath);
  assert.equal(result.ok, true);
  assert.equal(result.removed.name, 'to-remove');
  const config = await loadConfig(cleanPath);
  assert.equal(config.sources.length, 0);
});

test('removeSource: removes by resolved path', async () => {
  const cleanPath = path.join(testDir, 'remove-by-path.json');
  await addSource(sourceDir, { name: 'named-src' }, cleanPath);
  const result = await removeSource(sourceDir, cleanPath);
  assert.equal(result.ok, true);
  const config = await loadConfig(cleanPath);
  assert.equal(config.sources.length, 0);
});

test('removeSource: returns { ok: false, reason: not-found } for unknown target', async () => {
  const cleanPath = path.join(testDir, 'remove-notfound.json');
  await saveConfig({ sources: [] }, cleanPath);
  const result = await removeSource('does-not-exist', cleanPath);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-found');
});

test('removeSource: returns { ok: false, reason: ambiguous, matches } for ambiguous name', async () => {
  const cleanPath = path.join(testDir, 'remove-ambiguous.json');
  // Add two sources manually with the same name (different paths)
  const dir1 = await fs.mkdtemp(path.join(os.tmpdir(), 'ambig-'));
  const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'ambig-'));
  try {
    await saveConfig({
      sources: [
        { name: 'same-name', path: path.resolve(dir1), addedAt: new Date().toISOString() },
        { name: 'same-name', path: path.resolve(dir2), addedAt: new Date().toISOString() },
      ],
    }, cleanPath);
    const result = await removeSource('same-name', cleanPath);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ambiguous');
    assert.ok(Array.isArray(result.matches), 'matches should be an array');
    assert.equal(result.matches.length, 2);
  } finally {
    await fs.rm(dir1, { recursive: true, force: true });
    await fs.rm(dir2, { recursive: true, force: true });
  }
});

// ============================================================
// discoverConventions
// ============================================================

test('discoverConventions: returns array of found convention names', async () => {
  const conventions = await discoverConventions(sourceDir);
  assert.ok(Array.isArray(conventions));
  assert.ok(conventions.includes('.planning'), 'should find .planning');
  assert.ok(conventions.includes('docs'), 'should find docs');
  assert.ok(conventions.includes('README.md'), 'should find README.md');
});

test('discoverConventions: returns empty array when no conventions exist', async () => {
  const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-empty-'));
  try {
    const conventions = await discoverConventions(emptyDir);
    assert.ok(Array.isArray(conventions));
    assert.equal(conventions.length, 0);
  } finally {
    await fs.rm(emptyDir, { recursive: true, force: true });
  }
});

// ============================================================
// enrichSourcesWithConventions
// ============================================================

test('enrichSourcesWithConventions: adds conventions and available fields', async () => {
  const sources = [{ name: 'test', path: sourceDir, addedAt: new Date().toISOString() }];
  const enriched = await enrichSourcesWithConventions(sources);
  assert.equal(enriched.length, 1);
  assert.ok(Array.isArray(enriched[0].conventions), 'should have conventions array');
  assert.equal(typeof enriched[0].available, 'boolean', 'should have available boolean');
  assert.equal(enriched[0].available, true);
});

test('enrichSourcesWithConventions: marks missing source paths as available: false', async () => {
  const sources = [{ name: 'missing', path: '/nonexistent/path/that/does/not/exist', addedAt: new Date().toISOString() }];
  const enriched = await enrichSourcesWithConventions(sources);
  assert.equal(enriched[0].available, false);
});

// ============================================================
// listSources
// ============================================================

test('listSources: returns enriched sources with name, path, available, and conventions', async () => {
  const cleanPath = path.join(testDir, 'list-sources.json');
  await addSource(sourceDir, { name: 'list-test' }, cleanPath);
  const sources = await listSources(cleanPath);
  assert.ok(Array.isArray(sources));
  assert.equal(sources.length, 1);
  const src = sources[0];
  assert.equal(src.name, 'list-test');
  assert.equal(typeof src.path, 'string');
  assert.equal(typeof src.available, 'boolean');
  assert.ok(Array.isArray(src.conventions));
});

test('listSources: returns empty array when config has no sources', async () => {
  const cleanPath = path.join(testDir, 'list-empty.json');
  await saveConfig({ sources: [] }, cleanPath);
  const sources = await listSources(cleanPath);
  assert.deepEqual(sources, []);
});
