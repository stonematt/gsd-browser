'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

let root;
let evilDir;

before(async () => {
  // Create a temp directory as the root
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-test-'));

  // Create test files
  await fs.writeFile(path.join(root, 'valid.txt'), 'hello world');
  await fs.mkdir(path.join(root, 'subdir'));
  await fs.writeFile(path.join(root, 'subdir', 'nested.txt'), 'nested content');

  // Create a symlink inside root pointing outside root
  await fs.symlink(os.tmpdir(), path.join(root, 'link-outside'));

  // Create a sibling "evil" directory for prefix collision test
  evilDir = root + '-evil';
  await fs.mkdir(evilDir, { recursive: true });
  await fs.writeFile(path.join(evilDir, 'secret.txt'), 'secret content');
});

after(async () => {
  // Clean up temp directories
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(evilDir, { recursive: true, force: true });
});

const { isPathAllowed, readFileIfAllowed } = require('../src/filesystem');

describe('isPathAllowed', () => {
  test('../ traversal returns false', async () => {
    const result = await isPathAllowed('../../../etc/passwd', root);
    assert.strictEqual(result, false);
  });

  test('nested ../ traversal returns false', async () => {
    const result = await isPathAllowed('subdir/../../../etc/passwd', root);
    assert.strictEqual(result, false);
  });

  test('valid file in root returns true', async () => {
    const result = await isPathAllowed('valid.txt', root);
    assert.strictEqual(result, true);
  });

  test('valid nested file returns true', async () => {
    const result = await isPathAllowed('subdir/nested.txt', root);
    assert.strictEqual(result, true);
  });

  test('symlink pointing outside root returns false', async () => {
    const result = await isPathAllowed('link-outside', root);
    assert.strictEqual(result, false);
  });

  test('prefix collision path returns false', async () => {
    // /tmp/gsd-test-XXXX-evil/secret.txt should NOT be allowed when root is /tmp/gsd-test-XXXX
    const relativePath = path.join('..', path.basename(evilDir), 'secret.txt');
    const result = await isPathAllowed(relativePath, root);
    assert.strictEqual(result, false);
  });

  test('nonexistent file returns false', async () => {
    const result = await isPathAllowed('nonexistent.txt', root);
    assert.strictEqual(result, false);
  });

  test('root directory itself returns true', async () => {
    const result = await isPathAllowed('.', root);
    assert.strictEqual(result, true);
  });
});

describe('readFileIfAllowed', () => {
  test('disallowed path returns null', async () => {
    const result = await readFileIfAllowed('../../../etc/passwd', root);
    assert.strictEqual(result, null);
  });

  test('allowed path returns file content', async () => {
    const result = await readFileIfAllowed('valid.txt', root);
    assert.strictEqual(result, 'hello world');
  });
});
