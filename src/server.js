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
 * Normalize a phase number by stripping leading zeros from each segment.
 * "01" → "1", "04.5.3" → "4.5.3", "04.5" → "4.5"
 * Used for display and map lookups (ROADMAP keys are always unpadded).
 */
function normalizePhaseNum(numStr) {
  return String(numStr).split('.').map(s => String(parseInt(s, 10))).join('.');
}

/**
 * Parse ROADMAP.md to extract phase dependency information.
 * Looks for "### Phase N: Name" headers followed by "**Depends on**: Phase X, Phase Y".
 *
 * @param {string} content - ROADMAP.md file content
 * @returns {Object} Map of phase numStr to array of dependency numStr values
 */
function parseRoadmapDeps(content) {
  const deps = {};
  const lines = content.split('\n');
  let currentPhaseNum = null;

  for (const line of lines) {
    // Match phase headers: ### Phase 1: Foundation  or  ### Phase 4.5: GSD Dashboard (INSERTED)
    const phaseMatch = line.match(/^###\s+Phase\s+(\d+(?:\.\d+)?)\s*:/);
    if (phaseMatch) {
      currentPhaseNum = phaseMatch[1];
      if (!deps[currentPhaseNum]) deps[currentPhaseNum] = [];
      continue;
    }

    // Match dependency lines: **Depends on**: Phase 1  or  **Depends on**: Phase 2, Phase 3
    if (currentPhaseNum) {
      const depMatch = line.match(/\*\*Depends on\*\*\s*:\s*(.*)/);
      if (depMatch) {
        const depText = depMatch[1].trim();
        if (!/^nothing/i.test(depText)) {
          const phaseRefs = depText.match(/Phase\s+(\d+(?:\.\d+)?)/gi) || [];
          deps[currentPhaseNum] = phaseRefs.map(ref => {
            const m = ref.match(/(\d+(?:\.\d+)?)/);
            return m ? m[1] : null;
          }).filter(Boolean);
        }
      }
    }
  }

  return deps;
}

/**
 * Parse ROADMAP.md for phase names.
 * Returns { "1": "foundation", "2": "rendering", ... }
 */
function parseRoadmapPhaseNames(content) {
  const names = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/^###\s+Phase\s+(\d+(?:\.\d+)*)\s*:\s*(.+)/);
    if (m) {
      names[m[1]] = m[2].replace(/\s*\(INSERTED\)\s*/, '').trim();
    }
  }
  return names;
}

/**
 * Parse ROADMAP.md for phase goal text (the **Goal**: line after each phase heading).
 * Returns { "4": "goal text", "4.5": "goal text", "4.5.1": "goal text", ... }
 */
function parseRoadmapPhaseGoals(content) {
  const goals = {};
  const lines = content.split('\n');
  let currentPhase = null;
  for (const line of lines) {
    const mHeading = line.match(/^###\s+Phase\s+(\d+(?:\.\d+)*)\s*:/);
    if (mHeading) { currentPhase = mHeading[1]; continue; }
    if (currentPhase) {
      const mGoal = line.match(/^\*\*Goal\*\*\s*:?\s*(.+)/);
      if (mGoal) {
        goals[currentPhase] = mGoal[1].replace(/^\*?\*?\s*/, '').trim();
        currentPhase = null;
      }
    }
  }
  return goals;
}

/**
 * Parse PLAN.md YAML frontmatter for wave, depends_on, and requirements fields.
 *
 * @param {string} content - PLAN.md file content
 * @returns {{ wave: number|null, dependsOn: string[], requirements: string[] }}
 */
function parsePlanFrontmatter(content) {
  const result = { wave: null, dependsOn: [], requirements: [] };
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return result;

  const yaml = match[1];
  const waveMatch = yaml.match(/^wave:\s*(\d+)/m);
  if (waveMatch) result.wave = parseInt(waveMatch[1], 10);

  const depsMatch = yaml.match(/^depends_on:\s*\[([^\]]*)\]/m);
  if (depsMatch) {
    const raw = depsMatch[1].trim();
    if (raw) {
      result.dependsOn = raw.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  // Support inline array format: requirements: [DASH-01, DASH-02]
  const reqInlineMatch = yaml.match(/^requirements:\s*\[([^\]]*)\]/m);
  if (reqInlineMatch) {
    const raw = reqInlineMatch[1].trim();
    if (raw) {
      result.requirements = raw.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  } else {
    // Support multi-line YAML list format:
    // requirements:
    //   - DASH-01
    //   - DASH-02
    const reqMultiMatch = yaml.match(/^requirements:\s*\n((?:[ \t]+-[ \t]+\S[^\n]*\n?)+)/m);
    if (reqMultiMatch) {
      result.requirements = reqMultiMatch[1]
        .split('\n')
        .map(line => line.replace(/^[ \t]+-[ \t]+/, '').trim())
        .filter(Boolean);
    }
  }

  return result;
}

/**
 * Compare two phase number strings using string-segmented comparison.
 * Correctly handles depth-2 numbers like '4.5.1', '4.5.2', etc.
 *
 * @param {string|number} a
 * @param {string|number} b
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
function comparePhaseNums(a, b) {
  const partsA = String(a).split('.').map(Number);
  const partsB = String(b).split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Parse a GSD phase directory name like '01-foundation' or '04.5-gsd-dashboard'
 * or depth-2 names like '04.5.1-dashboard-ux-polish'.
 *
 * Note: numStr is the canonical phase identity; num (parseFloat) is kept for
 * backward compatibility but loses precision for depth-2 numbers.
 *
 * @param {string} dirName
 * @returns {{ num: number, numStr: string, slug: string, dir: string }|null}
 */
function parsePhaseDir(dirName) {
  const m = dirName.match(/^(\d+(?:\.\d+)*)-(.+)$/);
  if (!m) return null;
  return {
    num: parseFloat(m[1]),
    numStr: m[1],
    displayNum: normalizePhaseNum(m[1]),
    slug: m[2],
    dir: dirName,
  };
}

// Regex constants for plan file patterns
const PLAN_RE = /\d+-\d+-PLAN\.md$/;
const SUMMARY_RE = /\d+-\d+-SUMMARY\.md$/;

/**
 * Classify phase directory entries into plans, summaries, and verification flag.
 *
 * @param {string[]} entries - File names in a phase directory
 * @returns {{ plans: string[], summaries: string[], hasVerification: boolean }}
 */
function classifyPhaseFiles(entries) {
  return {
    plans: entries.filter(f => PLAN_RE.test(f)),
    summaries: entries.filter(f => SUMMARY_RE.test(f)),
    hasVerification: entries.some(f => f.endsWith('-VERIFICATION.md')),
  };
}

/**
 * Determine phase status from plan/summary counts and verification presence.
 *
 * @param {number} planCount
 * @param {number} completedPlans
 * @param {boolean} hasVerification
 * @returns {'complete'|'in-progress'|'pending'}
 */
function determinePhaseStatus(planCount, completedPlans, hasVerification) {
  if (hasVerification || (planCount > 0 && completedPlans >= planCount)) {
    return 'complete';
  }
  if (planCount > 0) {
    return 'in-progress';
  }
  return 'pending';
}

/**
 * Build plan details (wave/dependsOn) from plan files using a reader function.
 *
 * @param {(filename: string) => Promise<string|null>} readFileFn - Reads a plan file and returns content or null
 * @param {string[]} planFiles - Plan file names
 * @returns {Promise<Array<{ file: string, wave: number|null, dependsOn: string[] }>>}
 */
async function buildPlanDetails(readFileFn, planFiles) {
  return Promise.all(planFiles.map(async (planFile) => {
    const content = await readFileFn(planFile);
    if (content) {
      const fm = parsePlanFrontmatter(content);
      return { file: planFile, wave: fm.wave, dependsOn: fm.dependsOn, requirements: fm.requirements };
    }
    return { file: planFile, wave: null, dependsOn: [], requirements: [] };
  }));
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

  const { plans, summaries, hasVerification } = classifyPhaseFiles(entries);
  const status = determinePhaseStatus(plans.length, summaries.length, hasVerification);
  const planDetails = await buildPlanDetails(
    async (f) => { try { return await fs.readFile(path.join(phaseDirPath, f), 'utf8'); } catch { return null; } },
    plans
  );

  return {
    planCount: plans.length,
    completedPlans: summaries.length,
    status,
    files: entries,
    planDetails,
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

  const parsedDirs = dirs.map(dir => ({ dir, parsed: parsePhaseDir(dir) })).filter(d => d.parsed);
  const phaseResults = await Promise.all(
    parsedDirs.map(async ({ dir, parsed }) => {
      const info = await getPhaseInfo(path.join(phasesDir, dir));
      if (!info) return null;
      const allReqs = new Set((info.planDetails || []).flatMap(p => p.requirements || []));
      return {
        num: parsed.num,
        numStr: parsed.numStr,
        displayNum: parsed.displayNum,
        slug: parsed.slug,
        status: info.status,
        planCount: info.planCount,
        completedPlans: info.completedPlans,
        files: info.files,
        planDetails: info.planDetails || [],
        requirementCount: allReqs.size,
      };
    })
  );
  const phases = phaseResults.filter(Boolean);

  // Sort by string-segmented comparison to preserve depth-2 order (4.5.1, 4.5.2)
  phases.sort((a, b) => comparePhaseNums(a.numStr, b.numStr));
  return phases;
}

/**
 * Build a phase list using abstract reader functions, allowing both filesystem
 * and git-branch paths to share the same logic.
 *
 * @param {{ listDir: (p: string) => Promise<string[]>, readFile: (p: string) => Promise<string|null> }} reader
 * @returns {Promise<Array>}
 */
async function buildPhaseListFromReader(reader) {
  const dirs = await reader.listDir('.planning/phases');
  const parsedDirs = dirs.map(dir => ({ dir, parsed: parsePhaseDir(dir) })).filter(d => d.parsed);
  const phaseResults = await Promise.all(
    parsedDirs.map(async ({ dir, parsed }) => {
      const entries = await reader.listDir(`.planning/phases/${dir}`);
      if (!entries.length) return null;
      const { plans, summaries, hasVerification } = classifyPhaseFiles(entries);
      const status = determinePhaseStatus(plans.length, summaries.length, hasVerification);
      const planDetails = await buildPlanDetails(
        (f) => reader.readFile(`.planning/phases/${dir}/${f}`),
        plans
      );
      const allReqs = new Set((planDetails || []).flatMap(p => p.requirements || []));
      return {
        num: parsed.num,
        numStr: parsed.numStr,
        displayNum: parsed.displayNum,
        slug: parsed.slug,
        status,
        planCount: plans.length,
        completedPlans: summaries.length,
        files: entries,
        planDetails,
        requirementCount: allReqs.size,
      };
    })
  );
  const phases = phaseResults.filter(Boolean);
  phases.sort((a, b) => comparePhaseNums(a.numStr, b.numStr));
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
    { name: 'README.md', path: 'README.md' },
    { name: 'PROJECT.md', path: '.planning/PROJECT.md' },
    { name: 'STATE.md', path: '.planning/STATE.md' },
    { name: 'ROADMAP.md', path: '.planning/ROADMAP.md' },
  ];

  return Promise.all(
    links.map(async (link) => {
      let exists = false;
      try {
        await fs.access(path.join(sourcePath, link.path));
        exists = true;
      } catch { /* file doesn't exist */ }
      return { name: link.name, path: link.path, exists };
    })
  );
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

  // Reusable route options that override CSP to the management (inline-script) policy
  const managementCSP = {
    onSend: async (request, reply, payload) => {
      reply.header('Content-Security-Policy', MANAGEMENT_CSP);
      return payload;
    }
  };

  // GET /api/sources — list all registered sources (fresh from config each time)
  fastify.get('/api/sources', managementCSP, async (request, reply) => {
    const sources = await listSources();
    return reply.send({ sources });
  });

  // POST /api/sources — add a new source
  fastify.post('/api/sources', managementCSP, async (request, reply) => {
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
  fastify.get('/api/sources/:name/files', managementCSP, async (request, reply) => {
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
  fastify.get('/api/sources/:name/tree', managementCSP, async (request, reply) => {
    const sourceName = request.params.name;
    const source = activeSources.find(s => s.name === sourceName);
    if (!source) return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    const tree = await buildTree(source.path);
    return reply.send({ source: { name: source.name, path: source.path }, tree });
  });

  // PATCH /api/sources/:name — update source name or path
  fastify.patch('/api/sources/:name', managementCSP, async (request, reply) => {
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
  fastify.delete('/api/sources/:identifier', managementCSP, async (request, reply) => {
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
  fastify.get('/api/dashboard', managementCSP, async (request, reply) => {
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

      // Parse ROADMAP.md for phase dependencies, names, and goals
      let dependencies = {};
      let phaseNames = {};
      let phaseGoals = {};
      try {
        const roadmapPath = path.join(source.path, '.planning', 'ROADMAP.md');
        const roadmapContent = await fs.readFile(roadmapPath, 'utf8');
        dependencies = parseRoadmapDeps(roadmapContent);
        phaseNames = parseRoadmapPhaseNames(roadmapContent);
        phaseGoals = parseRoadmapPhaseGoals(roadmapContent);
      } catch { /* no ROADMAP.md */ }

      // Attach dependsOn to each phase from the roadmap deps map
      for (const phase of phases) {
        phase.dependsOn = dependencies[phase.numStr] || [];
      }

      // Derive current phase name from phases array
      const activePhase = phases.find(p => p.status === 'in-progress');
      const currentPhaseName = activePhase
        ? 'Phase ' + activePhase.numStr + ': ' + activePhase.slug
        : '';

      projects.push({
        name: source.name,
        path: source.path,
        isGsd: true,
        progress: {
          percent: parseInt(state?.progress?.percent ?? 0),
          completed_phases: parseInt(state?.progress?.completed_phases ?? 0),
          total_phases: parseInt(state?.progress?.total_phases ?? 0),
        },
        currentPhase: currentPhaseName,
        currentFocus: state?.status ?? '',
        lastActivity: state?.last_activity ?? '',
        milestone: state?.milestone ?? '',
        quickLinks,
        phaseStatus: phases,
        dependencies,
        phaseNames,
        phaseGoals,
      });
    }

    return reply.send({ projects, other });
  });

  // GET /api/projects/:name/detail — detailed project info including phases and branches
  fastify.get('/api/projects/:name/detail', managementCSP, async (request, reply) => {
    const sourceName = request.params.name;
    const source = activeSources.find(s => s.name === sourceName);

    if (!source) {
      return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    }

    const branch = request.query.branch;
    let state = null;
    let phases = [];

    // Build a reader abstraction: git-branch or filesystem
    const useBranch = branch && isValidBranchName(branch);
    const reader = useBranch
      ? {
          readFile: (p) => readFileFromBranch(source.path, branch, p),
          listDir: (p) => listDirFromBranch(source.path, branch, p),
        }
      : {
          readFile: (p) => fs.readFile(path.join(source.path, p), 'utf8').catch(() => null),
          listDir: (p) => fs.readdir(path.join(source.path, p)).catch(() => []),
        };

    const stateContent = await reader.readFile('.planning/STATE.md');
    if (stateContent) {
      state = parseStateMd(stateContent);
    }
    phases = await buildPhaseListFromReader(reader);

    // Parse ROADMAP.md for phase dependencies, names, and goals
    let dependencies = {};
    let phaseNames = {};
    let phaseGoals = {};
    const roadmapSrc = await reader.readFile('.planning/ROADMAP.md');
    if (roadmapSrc) {
      dependencies = parseRoadmapDeps(roadmapSrc);
      phaseNames = parseRoadmapPhaseNames(roadmapSrc);
      phaseGoals = parseRoadmapPhaseGoals(roadmapSrc);
      for (const phase of phases) {
        phase.dependsOn = dependencies[phase.numStr] || [];
      }
    }

    // Get branches on-demand (per CONTEXT.md decision — only in detail, not dashboard)
    const branches = await getBranchesWithPlanning(source.path);

    // Build quick links for project-level artifacts
    const quickLinks = useBranch ? [] : await buildQuickLinks(source.path);

    return reply.send({
      source: { name: source.name, path: source.path },
      state,
      phases,
      dependencies,
      phaseNames,
      phaseGoals,
      branch: branch || null,
      branches,
      quickLinks,
    });
  });

  // GET /api/projects/:name/branches — list branches with .planning/STATE.md
  fastify.get('/api/projects/:name/branches', managementCSP, async (request, reply) => {
    const sourceName = request.params.name;
    const source = activeSources.find(s => s.name === sourceName);

    if (!source) {
      return reply.code(404).send({ error: `Source not found: ${sourceName}` });
    }

    const branches = await getBranchesWithPlanning(source.path);
    return reply.send({ branches });
  });

  // GET /sources — serve the management page (explicit route shadows static for this path)
  fastify.get('/sources', managementCSP, async (request, reply) => {
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

    // Strip YAML frontmatter (--- delimited block at start of file)
    content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const bodyHtml = await renderMarkdown(content);
    const isFragment = request.query.fragment === 'true';
    const html = buildPage({ filePath: requestedPath, bodyHtml, fragment: isFragment });
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  // GET / — serve the browse page
  fastify.get('/', managementCSP, async (request, reply) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = await fs.readFile(htmlPath, 'utf8');
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  return fastify;
}

/**
 * Format the startup banner string.
 *
 * @param {string} version - Package version string
 * @param {number} port - Actual listening port
 * @param {Array<{ name: string, conventions?: string[], available?: boolean, _autoRegistered?: boolean }>} sources
 * @returns {string}
 */
function formatBanner(version, port, sources) {
  let out = `gsd-browser v${version} — http://127.0.0.1:${port}\n`;
  for (const src of sources) {
    const conventionStr = src.conventions && src.conventions.length > 0
      ? src.conventions.map(c => c.endsWith('.md') ? c : c + '/').join(', ')
      : 'no conventions';
    const autoTag = src._autoRegistered ? ' (auto-registered)' : '';
    out += `  ${src.name}: ${conventionStr}${autoTag}\n`;
  }
  return out;
}

/**
 * Start the server, bind to 127.0.0.1, print startup message.
 *
 * @param {number} port - Port number (0 = OS assigns random port)
 * @param {Array<{ name: string, path: string, available?: boolean, conventions?: string[] }>} sources
 *   Source array (will be enriched with conventions at startup)
 * @param {object} [options] - Options
 * @param {boolean} [options.open] - Open browser after start
 * @param {string} [options.openUrl] - URL to open (default: root URL)
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
  const pkgVersion = require('../package.json').version;

  process.stdout.write(formatBanner(pkgVersion, actualPort, availableSources));

  if (options.open) {
    const openUrl = options.openUrl || `http://127.0.0.1:${actualPort}`;
    try {
      const open = await import('open');
      await open.default(openUrl);
    } catch (err) {
      // open package unavailable — non-fatal
    }
  }

  process.on('SIGINT', async () => {
    await fastify.close();
    process.exit(0);
  });

  return fastify;
}

module.exports = { start, createServer, formatBanner, parseStateMd, parsePhaseDir, normalizePhaseNum, comparePhaseNums, getPhaseInfo, isValidBranchName, parseRoadmapDeps, parseRoadmapPhaseNames, parseRoadmapPhaseGoals, parsePlanFrontmatter, classifyPhaseFiles, determinePhaseStatus, buildPlanDetails, buildPhaseListFromReader };
