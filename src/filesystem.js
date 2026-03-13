'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

/**
 * Check if a requested path is within the registered root directory.
 * Protects against:
 *   - ../ directory traversal
 *   - symlink bypass (resolves real paths on both base and target)
 *   - prefix collision (/tmp/root vs /tmp/root-evil)
 *   - nonexistent paths (realpath throws → returns false)
 *
 * @param {string} requestedPath - Relative or absolute path to check
 * @param {string} registeredRoot - The allowed root directory
 * @returns {Promise<boolean>}
 */
async function isPathAllowed(requestedPath, registeredRoot) {
  try {
    const realBase = await fs.realpath(path.resolve(registeredRoot));
    const resolved = path.resolve(registeredRoot, requestedPath);
    const realTarget = await fs.realpath(resolved);
    // Root directory itself is valid; subdirectories must start with realBase + sep
    // The path.sep suffix prevents prefix collision attacks
    return realTarget === realBase || realTarget.startsWith(realBase + path.sep);
  } catch (err) {
    // realpath throws ENOENT for nonexistent paths, EACCES for permission errors
    // Any error means not allowed
    return false;
  }
}

/**
 * Read a file only if its path is within the registered root.
 *
 * @param {string} requestedPath - Relative or absolute path to read
 * @param {string} registeredRoot - The allowed root directory
 * @returns {Promise<string|null>} File content as UTF-8 string, or null if disallowed
 */
async function readFileIfAllowed(requestedPath, registeredRoot) {
  const allowed = await isPathAllowed(requestedPath, registeredRoot);
  if (!allowed) return null;
  const resolved = path.resolve(registeredRoot, requestedPath);
  const realTarget = await fs.realpath(resolved);
  return fs.readFile(realTarget, 'utf8');
}

module.exports = { isPathAllowed, readFileIfAllowed };
