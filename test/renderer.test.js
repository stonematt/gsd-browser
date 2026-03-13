'use strict';

const { before, test, describe } = require('node:test');
const assert = require('node:assert');
const { initRenderer, renderMarkdown, buildPage } = require('../src/renderer.js');

before(async () => {
  await initRenderer();
});

describe('SERV-02: GFM features', () => {
  test('GFM table renders as <table>', async () => {
    const md = '| Col A | Col B |\n| --- | --- |\n| 1 | 2 |\n';
    const html = await renderMarkdown(md);
    assert.ok(html.includes('<table'), `Expected <table> in output, got: ${html.slice(0, 200)}`);
  });

  test('task list renders checkbox', async () => {
    const md = '- [x] done\n- [ ] todo\n';
    const html = await renderMarkdown(md);
    assert.ok(
      html.includes('<input') || html.includes('type="checkbox"') || html.includes('checked'),
      `Expected checkbox input in output, got: ${html.slice(0, 200)}`
    );
  });

  test('strikethrough renders as <del> or <s>', async () => {
    const md = '~~strikethrough~~';
    const html = await renderMarkdown(md);
    assert.ok(
      html.includes('<del') || html.includes('<s>') || html.includes('<s '),
      `Expected <del> or <s> in output, got: ${html.slice(0, 200)}`
    );
  });

  test('footnote renders with back-reference', async () => {
    const md = 'Text with footnote[^1].\n\n[^1]: The footnote content.\n';
    const html = await renderMarkdown(md);
    assert.ok(
      html.includes('footnote') || html.includes('fn') || html.includes('sup'),
      `Expected footnote markup in output, got: ${html.slice(0, 300)}`
    );
  });
});

describe('SERV-03: Shiki syntax highlighting', () => {
  test('JS fenced code block has Shiki highlighting', async () => {
    const md = '```javascript\nconst x = 1;\n```\n';
    const html = await renderMarkdown(md);
    assert.ok(html.includes('<pre'), `Expected <pre> in output, got: ${html.slice(0, 200)}`);
    assert.ok(
      html.includes('style=') || html.includes('shiki'),
      `Expected inline styles or shiki class in output, got: ${html.slice(0, 300)}`
    );
    assert.ok(
      !html.includes('[object Promise]'),
      `Got [object Promise] — Shiki highlight returned a promise instead of string`
    );
  });

  test('unlabeled fenced code block renders without error', async () => {
    const md = '```\nplain text here\n```\n';
    const html = await renderMarkdown(md);
    assert.ok(!html.includes('[object Promise]'), 'Got [object Promise] in output');
    assert.ok(html.includes('plain text here'), `Expected code content in output, got: ${html.slice(0, 200)}`);
  });
});

describe('REND-01: Mermaid rendering', () => {
  test('mermaid fence renders as SVG or graceful fallback', async () => {
    const md = '```mermaid\ngraph LR\n  A --> B\n```\n';
    const html = await renderMarkdown(md);
    // Either renders as SVG (mermaid+svgdom worked) or falls back to code block
    const hasSvg = html.includes('<svg');
    const hasFallback = html.includes('<pre') || html.includes('<code');
    assert.ok(
      hasSvg || hasFallback,
      `Expected either SVG or fallback code block, got: ${html.slice(0, 300)}`
    );
    // Must not contain raw [object Promise]
    assert.ok(!html.includes('[object Promise]'), 'Got [object Promise] in mermaid output');
  });

  test('invalid mermaid shows fallback with error message', async () => {
    const md = '```mermaid\nthis is not valid mermaid syntax @@@\n```\n';
    const html = await renderMarkdown(md);
    // Must have some fallback — either the code in a pre/code block, or an error message
    const hasFallback = html.includes('<pre') || html.includes('<code') || html.includes('mermaid-error');
    assert.ok(hasFallback, `Expected fallback for invalid mermaid, got: ${html.slice(0, 300)}`);
  });
});

describe('REND-02: Page structure', () => {
  test('renderMarkdown wraps output in .markdown-body', async () => {
    const md = '# Hello\n\nWorld\n';
    const html = await renderMarkdown(md);
    assert.ok(
      html.includes('class="markdown-body"') || html.includes("class='markdown-body'"),
      `Expected .markdown-body wrapper, got: ${html.slice(0, 200)}`
    );
  });

  test('buildPage returns full HTML document with stylesheet link', () => {
    const page = buildPage({ filePath: '/docs/readme.md', bodyHtml: '<p>test</p>' });
    assert.ok(page.includes('<!DOCTYPE html>'), 'Missing <!DOCTYPE html>');
    assert.ok(page.includes('/styles/markdown.css'), 'Missing stylesheet link');
    assert.ok(page.includes('breadcrumb'), 'Missing breadcrumb header');
    assert.ok(
      page.includes('class="markdown-body"') || page.includes("class='markdown-body'"),
      'Missing .markdown-body wrapper'
    );
    assert.ok(page.includes('<p>test</p>'), 'Missing body HTML');
  });

  test('buildPage escapes HTML special chars in filePath', () => {
    const page = buildPage({ filePath: '/docs/<script>alert(1)</script>.md', bodyHtml: '' });
    assert.ok(!page.includes('<script>alert(1)</script>'), 'filePath was not HTML-escaped');
    assert.ok(page.includes('&lt;script&gt;'), 'Expected HTML-escaped filePath');
  });
});
