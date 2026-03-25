'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');

/**
 * Returns the XDG-compliant path to the sources config file.
 * Uses $XDG_CONFIG_HOME if set, otherwise falls back to ~/.config.
 *
 * @returns {string} Absolute path to sources.json
 */
function getConfigPath() {
  const xdgBase = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgBase, 'gsd-browser', 'sources.json');
}

/**
 * Load the sources config from disk.
 * Returns { sources: [] } if the file does not exist (not an error).
 *
 * @param {string} [configPath] - Override path (default: getConfigPath())
 * @returns {Promise<{ sources: Array }>}
 */
async function loadConfig(configPath) {
  const filePath = configPath || getConfigPath();
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { sources: [] };
    }
    throw err;
  }
}

/**
 * Save the sources config to disk atomically (write .tmp then rename).
 * Creates parent directories as needed.
 * The .tmp file is written in the same directory as the config to avoid
 * cross-device rename errors.
 *
 * @param {{ sources: Array }} config - Config object to persist
 * @param {string} [configPath] - Override path (default: getConfigPath())
 * @returns {Promise<void>}
 */
async function saveConfig(config, configPath) {
  const filePath = configPath || getConfigPath();
  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await fsPromises.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8');
  await fsPromises.rename(tmpPath, filePath);
}

/**
 * Discover documentation conventions in a source directory.
 * Checks for: .planning/, docs/, README.md
 * Uses statSync to distinguish ENOENT from EACCES.
 *
 * @param {string} sourcePath - Absolute path to the source directory
 * @returns {Promise<string[]>} Array of found convention names
 */
async function discoverConventions(sourcePath) {
  const candidates = ['.planning', 'docs', 'README.md'];
  const found = [];
  for (const name of candidates) {
    const fullPath = path.join(sourcePath, name);
    try {
      fs.statSync(fullPath);
      found.push(name);
    } catch (err) {
      // ENOENT means not present — skip. Any other error (EACCES) also skips.
    }
  }
  return found;
}

/**
 * Enrich an array of source objects with `conventions` and `available` fields.
 * A source is available if its path exists on disk.
 *
 * @param {Array<{ name: string, path: string, addedAt: string }>} sources
 * @returns {Promise<Array>} Enriched sources
 */
async function enrichSourcesWithConventions(sources) {
  return Promise.all(
    sources.map(async (src) => {
      let available = false;
      let conventions = [];
      try {
        fs.statSync(src.path);
        available = true;
        conventions = await discoverConventions(src.path);
      } catch (err) {
        // Path does not exist or is inaccessible
      }
      return { ...src, available, conventions };
    })
  );
}

/**
 * Add a source to the registry.
 * - Resolves targetPath to absolute (defaults to '.' → cwd if omitted).
 * - Rejects duplicates by resolved path.
 * - Auto-labels from path.basename when no name is provided.
 * - Auto-suffixes duplicate names with -2, -3, etc.
 *
 * @param {string} [targetPath] - Path to add (default: '.')
 * @param {{ name?: string }} [opts] - Options
 * @param {string} [configPath] - Override config path
 * @returns {Promise<{ ok: boolean, source?: object, reason?: string }>}
 */
async function addSource(targetPath, opts, configPath) {
  const resolvedPath = path.resolve(targetPath || '.');
  const options = opts || {};

  const config = await loadConfig(configPath);

  // Reject duplicate resolved paths
  const existingPaths = config.sources.map((s) => s.path);
  if (existingPaths.includes(resolvedPath)) {
    return { ok: false, reason: 'duplicate' };
  }

  // Determine name
  const baseName = path.basename(resolvedPath);
  let name = options.name || baseName;

  // Auto-suffix if name already taken
  const existingNames = new Set(config.sources.map((s) => s.name));
  if (existingNames.has(name)) {
    let suffix = 2;
    while (existingNames.has(`${name}-${suffix}`)) {
      suffix++;
    }
    name = `${name}-${suffix}`;
  }

  const source = {
    name,
    path: resolvedPath,
    addedAt: new Date().toISOString(),
  };

  config.sources.push(source);
  await saveConfig(config, configPath);

  return { ok: true, source };
}

/**
 * Remove a source from the registry by name or resolved path.
 * - If target matches a resolved path exactly, removes that source.
 * - If target matches a name uniquely, removes that source.
 * - If multiple sources share the same name, returns ambiguous.
 * - If nothing matches, returns not-found.
 *
 * @param {string} nameOrPath - Name or path of the source to remove
 * @param {string} [configPath] - Override config path
 * @returns {Promise<{ ok: boolean, removed?: object, reason?: string, matches?: Array }>}
 */
async function removeSource(nameOrPath, configPath) {
  const config = await loadConfig(configPath);
  const resolvedTarget = path.resolve(nameOrPath);

  // Try matching by resolved path first
  const byPath = config.sources.filter((s) => s.path === resolvedTarget);
  if (byPath.length === 1) {
    const removed = byPath[0];
    config.sources = config.sources.filter((s) => s.path !== resolvedTarget);
    await saveConfig(config, configPath);
    return { ok: true, removed };
  }

  // Try matching by name
  const byName = config.sources.filter((s) => s.name === nameOrPath);
  if (byName.length === 1) {
    const removed = byName[0];
    config.sources = config.sources.filter((s) => s !== removed);
    await saveConfig(config, configPath);
    return { ok: true, removed };
  }

  if (byName.length > 1) {
    return { ok: false, reason: 'ambiguous', matches: byName };
  }

  return { ok: false, reason: 'not-found' };
}

/**
 * List all registered sources, enriched with availability and convention data.
 *
 * @param {string} [configPath] - Override config path
 * @returns {Promise<Array>} Enriched source objects
 */
async function listSources(configPath) {
  const config = await loadConfig(configPath);
  return enrichSourcesWithConventions(config.sources);
}

module.exports = {
  getConfigPath,
  loadConfig,
  saveConfig,
  addSource,
  removeSource,
  listSources,
  discoverConventions,
  enrichSourcesWithConventions,
};
