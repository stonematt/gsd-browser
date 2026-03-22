'use strict';

/**
 * renderer.js — Markdown rendering pipeline
 *
 * Exports: initRenderer(), renderMarkdown(source), buildPage({ filePath, bodyHtml })
 *
 * Note: Sets globalThis.window and globalThis.document for Mermaid/svgdom.
 * This is an intentional side effect required for server-side Mermaid rendering.
 */

let highlighter = null;
let md = null;
let mermaidModule = null;
let mermaidAvailable = false;
let diagramCounter = 0;

const SUPPORTED_LANGS = [
  'javascript', 'typescript', 'python', 'bash', 'shell', 'json', 'yaml',
  'toml', 'markdown', 'html', 'css', 'rust', 'go', 'java', 'sql', 'diff',
  'xml', 'c', 'cpp', 'ruby', 'php', 'swift', 'kotlin', 'dockerfile',
  'graphql', 'plaintext', 'text',
];

/**
 * initRenderer() — async, call once at startup.
 * Initializes Shiki highlighter, Mermaid, and the markdown-it instance.
 * Degrades gracefully if Shiki or Mermaid fail to initialize.
 */
async function initRenderer() {
  // Initialize Shiki (ESM-only — must use dynamic import)
  try {
    const { createHighlighter } = await import('shiki');
    highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: SUPPORTED_LANGS,
    });
  } catch (err) {
    console.warn('[renderer] Shiki init failed — code blocks will use plain escaping:', err.message);
    highlighter = null;
  }

  // Initialize Mermaid via svgdom DOM polyfill
  try {
    const { createHTMLWindow } = await import('svgdom');
    const mermaid = (await import('mermaid')).default;

    const win = createHTMLWindow();
    globalThis.window = win;
    globalThis.document = win.document;

    mermaid.initialize({
      startOnLoad: false,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      securityLevel: 'strict',
      theme: 'dark',
    });

    mermaidModule = mermaid;
    mermaidAvailable = true;
  } catch (err) {
    console.warn('[renderer] Mermaid init failed — mermaid blocks will fall back to code:', err.message);
    mermaidModule = null;
    mermaidAvailable = false;
  }

  // Build markdown-it instance (after Shiki is ready so highlight callback is sync)
  const MarkdownIt = require('markdown-it');
  const taskLists = require('markdown-it-task-lists');
  const footnote = require('markdown-it-footnote');

  md = new MarkdownIt({
    html: false,       // security — no raw HTML passthrough
    linkify: true,
    typographer: false,
    highlight(code, lang) {
      if (!highlighter) return '';
      const loadedLangs = highlighter.getLoadedLanguages();
      const validLang = lang && loadedLangs.includes(lang) ? lang : 'text';
      try {
        return highlighter.codeToHtml(code, { lang: validLang, theme: 'github-dark' });
      } catch {
        return '';
      }
    },
  });

  md.use(taskLists, { enabled: true });
  md.use(footnote);
}

/**
 * renderMermaidDiagram(source) — render a single Mermaid diagram to SVG.
 * Returns { svg, error } — svg is the SVG string or null on failure.
 */
async function renderMermaidDiagram(source) {
  if (!mermaidAvailable || !mermaidModule) {
    return { svg: null, error: 'Mermaid not available' };
  }
  try {
    const id = `mermaid-${++diagramCounter}`;
    const { svg } = await mermaidModule.render(id, source.trim());
    return { svg, error: null };
  } catch (err) {
    return { svg: null, error: err.message || String(err) };
  }
}

/**
 * escapeHtml(str) — escape HTML special characters.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * renderMarkdown(source) — async, converts GFM markdown to HTML body string.
 * Implements two-pass strategy:
 *   Pass 1: Extract mermaid blocks and render to SVG async.
 *   Pass 2: Override md fence renderer to inject SVGs, call md.render().
 * Returns HTML wrapped in <div class="markdown-body">.
 */
async function renderMarkdown(source) {
  if (!md) {
    throw new Error('renderer not initialized — call initRenderer() first');
  }

  // Pass 1: find all ```mermaid blocks and render async
  const mermaidPattern = /^```mermaid\n([\s\S]*?)^```/gm;
  const svgCache = new Map();
  let diagramIndex = 0;

  for (const match of source.matchAll(mermaidPattern)) {
    const diagramSource = match[1];
    const key = diagramSource; // use raw source as cache key
    if (!svgCache.has(key)) {
      const result = await renderMermaidDiagram(diagramSource);
      svgCache.set(key, result);
    }
    diagramIndex++;
  }

  // Pass 2: override fence renderer to inject SVGs, then call md.render()
  const defaultFence = md.renderer.rules.fence
    ? md.renderer.rules.fence.bind(md.renderer)
    : function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
      };

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const lang = (token.info || '').trim().split(/\s+/)[0];

    if (lang === 'mermaid') {
      const diagramSource = token.content;
      const cached = svgCache.get(diagramSource);

      if (cached && cached.svg) {
        return `<div class="mermaid-diagram">${cached.svg}</div>\n`;
      }

      // Fallback: show source as code block with error
      const errorMsg = cached ? cached.error : 'Mermaid not available';
      const escapedSource = escapeHtml(diagramSource);
      const errorHtml = `<p class="mermaid-error">Diagram render error: ${escapeHtml(errorMsg || 'unknown error')}</p>`;
      return `<pre><code>${escapedSource}</code></pre>\n${errorHtml}\n`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };

  const bodyHtml = md.render(source);
  return `<div class="markdown-body">${bodyHtml}</div>`;
}

/**
 * buildPage({ filePath, bodyHtml, fragment }) — sync, wraps bodyHtml in a complete HTML page,
 * or returns just the bodyHtml fragment when fragment=true.
 *
 * @param {object} opts
 * @param {string} opts.filePath - The file path for the page title/breadcrumb
 * @param {string} opts.bodyHtml - The rendered markdown body (already wrapped in <div class="markdown-body">)
 * @param {boolean} [opts.fragment=false] - If true, return only bodyHtml without full page boilerplate
 */
function buildPage({ filePath, bodyHtml, fragment = false }) {
  if (fragment) {
    return bodyHtml;
  }
  const escapedPath = escapeHtml(filePath);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedPath}</title>
  <link rel="stylesheet" href="/styles/markdown.css">
</head>
<body>
  <header class="breadcrumb">
    <a href="/" style="color:#58a6ff;text-decoration:none">&larr; Home</a>
    <span style="color:#8b949e;margin:0 6px">/</span>
    <code>${escapedPath}</code>
  </header>
  <main class="markdown-body">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

module.exports = { initRenderer, renderMarkdown, buildPage };
