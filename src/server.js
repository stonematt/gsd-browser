'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const Fastify = require('fastify');
const mime = require('mime-types');
const { isPathAllowed, readFileIfAllowed } = require('./filesystem.js');
const { initRenderer, renderMarkdown, buildPage } = require('./renderer.js');
const { enrichSourcesWithConventions, addSource, removeSource, listSources, loadConfig, saveConfig } = require('./sources.js');

const execFileAsync = promisify(execFile);

// CSP header value — defined as a named constant for easy Phase 4 update
// Phase 4: change script-src 'none' to script-src 'self' when adding frontend JS
const CSP_HEADER = "default-src 'self'; script-src 'none'; object-src 'none'";

// Relaxed CSP for the /sources management page — allows inline script execution
const MANAGEMENT_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'";

// Directories treated as "convention" directories (sorted first, flagged with convention: true)
const CONVENTION_DIRS = new Set(['.planning', 'docs']);

// ============================================================
// Phase 4.5: GSD Dashboard helper functions
// ============================================================

/**
 * Parse GSD STATE.md frontmatter.
 * Returns null if no frontmatter found.
 * Handles two-level YAML nesting (top-level keys + indented sub-keys like progress:).
 *
 * @param {string} content - File content
 * @returns {object|null}
 */
function parseStateMd(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const lines = yaml.split('\n');
  const result = {};
  let currentKey = null;

  for (const line of lines) {
    if (line.match(/^\s+/)) {
      // Indented sub-key
      const m = line.match(/^\s+(\w+):\s*(.+)/);
      if (m && currentKey) {
        if (typeof result[currentKey] !== 'object') result[currentKey] = {};
        result[currentKey][m[1]] = m[2].trim();
      }
    } else {
      const m = line.match(/^(\w[\w_]*):\s*(.*)/);
      if (m) {
        currentKey = m[1];
        const val = m[2].replace(/^["']|["']$/g, '');
        result[currentKey] = val || {};
      }
    }
  }
  return result;
}

/**
 * Parse a GSD phase directory name like '01-foundation' or '04.5-gsd-dashboard'.
 *
 * @param {string} dirName
 * @returns {{ num: number, numStr: string, slug: string, dir: string }|null}
 */
function parsePhaseDir(dirName) {
  const m = dirName.match(/^(\d+(?:\.\d+)?)-(.+)$/);
  if (!m) return null;
  return {
    num: parseFloat(m[1]),
    numStr: m[1],
    slug: m[2],
    dir: dirName,
  };
}

/**
 * Get phase status info by scanning a phase directory for PLAN.md, SUMMARY.md, VERIFICATION.md files.
 *
 * @param {string} phaseDirPath - Absolute path to a phase directory
 * @returns {Promise<{ planCount: number, completedPlans: number, status: string, files: string[] }|null>}
 */
async function getPhaseInfo(phaseDirPath) {
  let entries;
  try {
    entries = await fs.readdir(phaseDirPath);
  } catch {
    return null;
  }

  const plans = entries.filter(f => /\d+-\d+-PLAN\.md$/.test(f));
  const summaries = entries.filter(f => /\d+-\d+-SUMMARY\.md$/.test(f));
  const hasVerification = entries.some(f => f.endsWith('-VERIFICATION.md'));

  let status;
  if (hasVerification || (plans.length > 0 && summaries.length >= plans.length)) {
    status = 'complete';
  } else if (plans.length > 0) {
    status = 'in-progress';
  } else {
    status = 'pending';
  }

  return {
    planCount: plans.length,
    completedPlans: summaries.length,
    status,
    files: entries,
  };
}

/**
 * Validate a git branch name — reject anything with shell metacharacters.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isValidBranchName(name) {
  if (!name) return false;
  return /^[a-zA-Z0-9._\-/]+$/.test(name);
}

/**
 * List git branches that have a .planning/STATE.md file.
 * Returns [] for non-git directories or on any failure.
 *
 * @param {string} repoPath - Absolute path to git repository
 * @returns {Promise<string[]>}
 */
async function getBranchesWithPlanning(repoPath) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'branch', '--format=%(refname:short)']);
    const branches = stdout.split('\n').filter(Boolean);
    const withPlanning = [];
    for (const branch of branches) {
      try {
        await execFileAsync('git', ['-C', repoPath, 'cat-file', '-e', `${branch}:.planning/STATE.md`]);
        withPlanning.push(branch);
      } catch { /* not found on this branch */ }
    }
    return withPlanning;
  } catch {
    return []; // Not a repo or git unavailable
  }
}

/**
 * Read a file from a specific git branch.
 *
 * @param {string} repoPath
 * @param {string} branch
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function readFileFromBranch(repoPath, branch, filePath) {
  if (!isValidBranchName(branch)) return null;
  try {
    const { stdout } = await execFileAsync(
      'git', ['-C', repoPath, 'show', `${branch}:${filePath}`],
      { maxBuffer: 1024 * 1024 }
    );
    return stdout;
  } catch {
    return null;
  }
}

/**
 * List directory entries from a specific git branch.
 *
 * @param {string} repoPath
 * @param {string} branch
 * @param {string} dirPath
 * @returns {Promise<string[]>}
 */
async function listDirFromBranch(repoPath, branch, dirPath) {
  if (!isValidBranchName(branch)) return [];
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'ls-tree', '--name-only', `${branch}:${dirPath}`]);
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Build a list of phase objects from a source's .planning/phases/ directory.
 * Sorted by numeric phase number.
 *
 * @param {string} sourcePath
 * @returns {Promise<Array>}
 */
async function buildPhaseList(sourcePath) {
  const phasesDir = path.join(sourcePath, '.planning', 'phases');
  let dirs;
  try {
    dirs = await fs.readdir(phasesDir);
  } catch {
    return [];
  }

  const phases = [];
  for (const dir of dirs) {
    const parsed = parsePhaseDir(dir);
    if (!parsed) continue;
    const info = await getPhaseInfo(path.join(phasesDir, dir));
    if (!info) continue;
    phases.push({
      num: parsed.num,
      numStr: parsed.numStr,
      slug: parsed.slug,
      status: info.status,
      planCount: info.planCount,
      completedPlans: info.completedPlans,
    });
  }

  // Sort by numeric phase number (handles 04.5 correctly)
  phases.sort((a, b) => a.num - b.num);
  return phases;
}

/**
 * Build quick-links array for a source's key planning files.
 * Checks file existence so client can conditionally show links.
 *
 * @param {string} sourcePath
 * @returns {Promise<Array<{ name: string, path: string, exists: boolean }>>}
 */
async function buildQuickLinks(sourcePath) {
  const links = [
    { name: 'PROJECT.md', path: '.planning/PROJECT.md' },
    { name: 'STATE.md', path: '.planning/STATE.md' },
    { name: 'ROADMAP.md', path: '.planning/ROADMAP.md' },
  ];

  const result = [];
  for (const link of links) {
    let exists = false;
    try {
      await fs.access(path.join(sourcePath, link.path));
      exists = true;
    } catch { /* file doesn't exist */ }
    result.push({ name: link.name, path: link.path, exists });
  }
  return result;
}

/**
 * buildTree(dirPath, relBase) — recursively build a JSON tree of .md files.
 *
 * Rules:
 * - Only .md files are included; non-.md files are ignored
 * - Directories with no .md descendants at any depth are omitted
 * - Directories named in CONVENTION_DIRS get convention: true flag
 * - Convention dirs are sorted before non-convention dirs; within each group, sorted alphabetically
 * - File paths are relative to dirPath (the source root)
 *
 * @param {string} dirPath - Absolute path to scan
 * @param {string} [relBase=''] - Relative base path (for building node path values)
 * @returns {Promise<Array>} - Array of tree nodes
 */
async function buildTree(dirPath, relBase = '') {
  let entries;
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return [];
  }

  const nodes = [];

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry);
    const relPath = relBase ? `${relBase}/${entry}` : entry;

    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Skip node_modules entirely
      if (entry === 'node_modules') continue;
      const children = await buildTree(absPath, relPath);
      // Omit directories that have no .md descendants at any depth
      if (children.length === 0) continue;
      const isConvention = CONVENTION_DIRS.has(entry);
      nodes.push({
        name: entry,
        type: 'dir',
        convention: isConvention,
        children,
      });
    } else if (entry.endsWith('.md')) {
      nodes.push({
        name: entry,
        type: 'file',
        path: relPath,
      });
    }
  }

  // Sort: convention dirs first, then non-convention dirs, then files — each group alphabetically
  nodes.sort((a, b) => {
    const aIsConventionDir = a.type === 'dir' && a.convention === true;
    const bIsConventionDir = b.type === 'dir' && b.convention === true;
    const aIsDir = a.type === 'dir';
    const bIsDir = b.type === 'dir';

    if (aIsConventionDir !== bIsConventionDir) {
      return aIsConventionDir ? -1 : 1;
    }
    if (aIsDir !== bIsDir) {
      return aIsDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

/**
 * Find which source contains the requested path (for path traversal check and routing).
 * Iterates sources in order; returns the first matching source or null.
 *
 * @param {string} requestedPath
 * @param {Array<{ name: string, path: string, available: boolean, conventions: string[] }>} sources
 * @returns {Promise<object|null>}
 */
async function findSourceForPath(requestedPath, sources) {
  for (const source of sources) {
    const allowed = await isPathAllowed(requestedPath, source.path);
    if (allowed) return source;
  }
  return null;
}

/**
 * Create a Fastify server instance with security hooks and file serving routes.
 *
 * @param {Array<{ name: string, path: string, available: boolean, conventions: string[] }>} sources
 *   Array of available source objects (only available sources should be passed)
 * @returns {import('fastify').FastifyInstance}
 */
function createServer(sources) {
  // Mutable reference to live sources — updated by add/remove API calls so that
  // /file and /render always reflect current state without a server restart.
  let activeSources = sources;

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

  // GET /api/sources — list all registered sources (fresh from config each time)
  fastify.get('/api/sources', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sources = await listSources();
    return reply.send({ sources });
  });

  // POST /api/sources — add a new source
  fastify.post('/api/sources', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const body = request.body || {};
    const targetPath = body.path;
    const name = body.name;

    if (!targetPath) {
      return reply.code(400).send({ error: 'Missing required field: path' });
    }

    const result = await addSource(targetPath, name ? { name } : {});

    if (result.ok) {
      // Refresh activeSources from config so new source is served immediately
      const enriched = await listSources();
      activeSources = enriched.filter(s => s.available);
      return reply.code(201).send({ source: result.source });
    }

    if (result.reason === 'duplicate') {
      return reply.code(409).send({ error: result.message || 'Source path already registered' });
    }

    return reply.code(400).send({ error: result.message || 'Failed to add source' });
  });

  // GET /api/sources/:name/files — list markdown files in a source, grouped by priority
  fastify.get('/api/sources/:name/files', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sourceName = request.params.name;
    const sources = await listSources();
    const source = sources.find(s => s.name === sourceName);

    if (!source) {
      return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    }

    if (!source.available) {
      return reply.code(404).send({ error: `Source unavailable: ${sourceName}` });
    }

    const files = { readme: [], planning: [], docs: [], other: [] };

    // Helper: build file entry
    const entry = (name, absPath) => ({ name, path: absPath });

    // Check for root README.md (case-insensitive match)
    try {
      const rootEntries = await fs.readdir(source.path);
      for (const name of rootEntries) {
        if (name.toLowerCase() === 'readme.md') {
          files.readme.push(entry(name, path.join(source.path, name)));
        }
      }
    } catch { /* skip if unreadable */ }

    // Check .planning/*.md
    try {
      const planningDir = path.join(source.path, '.planning');
      const planningEntries = await fs.readdir(planningDir);
      for (const name of planningEntries) {
        if (name.endsWith('.md')) {
          files.planning.push(entry(name, path.join(planningDir, name)));
        }
      }
    } catch { /* skip if missing */ }

    // Check docs/*.md
    try {
      const docsDir = path.join(source.path, 'docs');
      const docsEntries = await fs.readdir(docsDir);
      for (const name of docsEntries) {
        if (name.endsWith('.md')) {
          files.docs.push(entry(name, path.join(docsDir, name)));
        }
      }
    } catch { /* skip if missing */ }

    // Other *.md in root (excluding README.md already captured)
    try {
      const rootEntries = await fs.readdir(source.path);
      const readmeNames = new Set(files.readme.map(f => f.name));
      for (const name of rootEntries) {
        if (name.endsWith('.md') && !readmeNames.has(name)) {
          files.other.push(entry(name, path.join(source.path, name)));
        }
      }
    } catch { /* skip if unreadable */ }

    return reply.send({
      source: { name: source.name, path: source.path },
      files
    });
  });

  // GET /api/sources/:name/tree — return a recursive JSON tree of .md files for a source
  fastify.get('/api/sources/:name/tree', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sourceName = request.params.name;
    const source = activeSources.find(s => s.name === sourceName);
    if (!source) return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    const tree = await buildTree(source.path);
    return reply.send({ source: { name: source.name, path: source.path }, tree });
  });

  // PATCH /api/sources/:name — update source name or path
  fastify.patch('/api/sources/:name', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sourceName = request.params.name;
    const { name: newName, path: newPath } = request.body || {};

    if (!newName && !newPath) {
      return reply.code(400).send({ error: 'Provide name or path to update' });
    }

    const config = await loadConfig();
    const sourceIdx = config.sources.findIndex(s => s.name === sourceName);

    if (sourceIdx === -1) {
      return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    }

    const source = config.sources[sourceIdx];

    if (newName) {
      const nameExists = config.sources.some((s, i) => i !== sourceIdx && s.name === newName);
      if (nameExists) {
        return reply.code(409).send({ error: `Name already taken: ${newName}` });
      }
      source.name = newName;
    }

    if (newPath) {
      const resolvedPath = path.resolve(newPath);
      const pathExists = config.sources.some((s, i) => i !== sourceIdx && s.path === resolvedPath);
      if (pathExists) {
        return reply.code(409).send({ error: 'Path already registered' });
      }
      source.path = resolvedPath;
    }

    config.sources[sourceIdx] = source;
    await saveConfig(config);

    const enriched = await enrichSourcesWithConventions([source]);
    return reply.send({ source: enriched[0] });
  });

  // DELETE /api/sources/:identifier — remove a source by name or path
  fastify.delete('/api/sources/:identifier', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const identifier = request.params.identifier;
    const result = await removeSource(identifier);

    if (result.ok) {
      // Refresh activeSources from config so removed source stops being served
      const enriched = await listSources();
      activeSources = enriched.filter(s => s.available);
      return reply.code(200).send({ removed: result.removed });
    }

    if (result.reason === 'not-found') {
      return reply.code(404).send({ error: result.message || `Source not found: ${identifier}` });
    }

    if (result.reason === 'ambiguous') {
      return reply.code(409).send({ error: result.message || 'Ambiguous identifier', matches: result.matches });
    }

    return reply.code(400).send({ error: result.message || 'Failed to remove source' });
  });

  // ============================================================
  // Phase 4.5: GSD Dashboard API endpoints
  // ============================================================

  // GET /api/dashboard — aggregate GSD project data for all registered sources
  fastify.get('/api/dashboard', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    // Use activeSources (closure) for consistency with tree/file endpoints.
    // activeSources is refreshed on add/remove via POST/DELETE /api/sources.
    const allSources = activeSources;
    const projects = [];
    const other = [];

    for (const source of allSources) {
      if (!source.available) continue;

      // Check for GSD artifact — presence of .planning/STATE.md
      const statePath = path.join(source.path, '.planning', 'STATE.md');
      let stateContent = null;
      try {
        stateContent = await fs.readFile(statePath, 'utf8');
      } catch { /* not a GSD project */ }

      if (!stateContent) {
        other.push({ name: source.name, path: source.path });
        continue;
      }

      const state = parseStateMd(stateContent);
      const phases = await buildPhaseList(source.path);
      const quickLinks = await buildQuickLinks(source.path);

      projects.push({
        name: source.name,
        path: source.path,
        isGsd: true,
        progress: {
          percent: parseInt(state && state.progress && state.progress.percent ? state.progress.percent : 0),
          completed_phases: parseInt(state && state.progress && state.progress.completed_phases ? state.progress.completed_phases : 0),
          total_phases: parseInt(state && state.progress && state.progress.total_phases ? state.progress.total_phases : 0),
        },
        currentFocus: (state && state.status) ? state.status : '',
        lastActivity: (state && state.last_activity) ? state.last_activity : '',
        milestone: (state && state.milestone) ? state.milestone : '',
        quickLinks,
        phaseStatus: phases,
      });
    }

    return reply.send({ projects, other });
  });

  // GET /api/projects/:name/detail — detailed project info including phases and branches
  fastify.get('/api/projects/:name/detail', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sourceName = request.params.name;
    const source = activeSources.find(s => s.name === sourceName);

    if (!source) {
      return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    }

    const branch = request.query.branch;
    let state = null;
    let phases = [];

    if (branch && isValidBranchName(branch)) {
      // Read from the specified branch via git
      const stateContent = await readFileFromBranch(source.path, branch, '.planning/STATE.md');
      if (stateContent) {
        state = parseStateMd(stateContent);
      }
      // List phase dirs from the branch
      const phaseDirEntries = await listDirFromBranch(source.path, branch, '.planning/phases');
      for (const dir of phaseDirEntries) {
        const parsed = parsePhaseDir(dir);
        if (!parsed) continue;
        // Count plan/summary files from git ls-tree
        const phaseFiles = await listDirFromBranch(source.path, branch, `.planning/phases/${dir}`);
        const planCount = phaseFiles.filter(f => /\d+-\d+-PLAN\.md$/.test(f)).length;
        const completedPlans = phaseFiles.filter(f => /\d+-\d+-SUMMARY\.md$/.test(f)).length;
        const hasVerification = phaseFiles.some(f => f.endsWith('-VERIFICATION.md'));
        let status;
        if (hasVerification || (planCount > 0 && completedPlans >= planCount)) {
          status = 'complete';
        } else if (planCount > 0) {
          status = 'in-progress';
        } else {
          status = 'pending';
        }
        phases.push({ num: parsed.num, numStr: parsed.numStr, slug: parsed.slug, status, planCount, completedPlans });
      }
      phases.sort((a, b) => a.num - b.num);
    } else {
      // Read from filesystem directly
      const statePath = path.join(source.path, '.planning', 'STATE.md');
      try {
        const stateContent = await fs.readFile(statePath, 'utf8');
        state = parseStateMd(stateContent);
      } catch { /* no STATE.md */ }
      phases = await buildPhaseList(source.path);
    }

    // Get branches on-demand (per CONTEXT.md decision — only in detail, not dashboard)
    const branches = await getBranchesWithPlanning(source.path);

    return reply.send({
      source: { name: source.name, path: source.path },
      state,
      phases,
      branch: branch || null,
      branches,
    });
  });

  // GET /api/projects/:name/branches — list branches with .planning/STATE.md
  fastify.get('/api/projects/:name/branches', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const sourceName = request.params.name;
    const source = activeSources.find(s => s.name === sourceName);

    if (!source) {
      return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    }

    const branches = await getBranchesWithPlanning(source.path);
    return reply.send({ branches });
  });

  // GET /sources — serve the management page (explicit route shadows static for this path)
  fastify.get('/sources', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'sources.html');
    const html = await fs.readFile(htmlPath, 'utf8');
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
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

    const matchedSource = await findSourceForPath(requestedPath, activeSources);

    if (!matchedSource) {
      return reply.code(403).send({
        error: 'Access denied: path is outside the registered root',
        status: 403,
        requested: requestedPath,
        allowed: activeSources.map(s => s.path)
      });
    }

    // Path is allowed — resolve it to check if it's a file or directory
    const resolvedPath = path.resolve(matchedSource.path, requestedPath);

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
    // Strategy:
    //   1. Check that the path, if it existed, would be within at least ONE source root.
    //      If it's outside ALL roots → 403 (traversal).
    //   2. Among the allowed roots, try to read the file from each.
    //      First source that returns content wins.
    //      If none have the file → 404.

    // Step 1: Compute which sources the path is geometrically within (no existence check)
    const allowedSources = [];
    for (const source of activeSources) {
      let realBase;
      try {
        realBase = await fs.realpath(path.resolve(source.path));
      } catch {
        realBase = path.resolve(source.path);
      }
      const resolvedPath = path.resolve(realBase, requestedPath);
      const isWithinRoot = resolvedPath === realBase || resolvedPath.startsWith(realBase + path.sep);
      if (isWithinRoot) {
        allowedSources.push(source);
      }
    }

    if (allowedSources.length === 0) {
      return reply.code(403).send({
        error: 'Access denied: path is outside the registered root',
        status: 403,
        requested: requestedPath,
        allowed: activeSources.map(s => s.path)
      });
    }

    // Step 2: Find the first source where the file actually exists
    let content = null;
    for (const source of allowedSources) {
      content = await readFileIfAllowed(requestedPath, source.path);
      if (content !== null) break;
    }

    if (content === null) {
      return reply.code(404).send({
        error: 'File not found',
        status: 404,
        requested: requestedPath
      });
    }

    const bodyHtml = await renderMarkdown(content);
    const isFragment = request.query.fragment === 'true';
    const html = buildPage({ filePath: requestedPath, bodyHtml, fragment: isFragment });
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  // GET / — serve the browse page
  fastify.get('/', {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  }, async (request, reply) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = await fs.readFile(htmlPath, 'utf8');
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  return fastify;
}

/**
 * Start the server, bind to 127.0.0.1, print startup message.
 *
 * @param {number} port - Port number (0 = OS assigns random port)
 * @param {Array<{ name: string, path: string, available?: boolean, conventions?: string[] }>} sources
 *   Source array (will be enriched with conventions at startup)
 * @param {object} [options] - Options
 * @param {boolean} [options.open] - Open browser after start
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function start(port, sources, options = {}) {
  // Re-scan conventions at startup (fresh-from-disk philosophy)
  const enriched = await enrichSourcesWithConventions(sources);
  const availableSources = enriched.filter(s => s.available);

  const fastify = createServer(availableSources);

  // Initialize Shiki + Mermaid before accepting requests
  await initRenderer();

  await fastify.listen({ port, host: '127.0.0.1' });

  const actualPort = fastify.server.address().port;

  if (availableSources.length === 1) {
    process.stdout.write(`gsd-browser serving ${availableSources[0].path} at http://127.0.0.1:${actualPort}\n`);
  } else {
    process.stdout.write(`gsd-browser serving ${availableSources.length} sources at http://127.0.0.1:${actualPort}\n`);
    for (const src of availableSources) {
      process.stdout.write(`  ${src.name}: ${src.path}\n`);
    }
  }

  if (options.open) {
    try {
      const open = await import('open');
      await open.default(`http://127.0.0.1:${actualPort}`);
    } catch (err) {
      // open package may not be installed — that's fine
    }
  }

  process.on('SIGINT', async () => {
    await fastify.close();
    process.exit(0);
  });

  return fastify;
}

module.exports = { start, createServer, parseStateMd, parsePhaseDir, getPhaseInfo, isValidBranchName };
