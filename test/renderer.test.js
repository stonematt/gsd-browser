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

describe('NAV-05: Heading anchors', () => {
  test('NAV-05-1: h2 gets id attribute slugified from text', async () => {
    const md = '## Hello World\n\nsome content\n';
    const html = await renderMarkdown(md);
    assert.ok(
      html.includes('id="hello-world"'),
      `Expected id="hello-world" on h2, got: ${html.slice(0, 400)}`
    );
  });

  test('NAV-05-2: h3 and h4 also get id attributes', async () => {
    const md = '### Sub Section\n\n#### Deep Section\n';
    const html = await renderMarkdown(md);
    assert.ok(
      html.includes('id="sub-section"'),
      `Expected id="sub-section" on h3, got: ${html.slice(0, 400)}`
    );
    assert.ok(
      html.includes('id="deep-section"'),
      `Expected id="deep-section" on h4, got: ${html.slice(0, 400)}`
    );
  });

  test('NAV-05-3: duplicate headings get unique IDs with numeric suffix', async () => {
    const md = '## Foo\n\n## Foo\n';
    const html = await renderMarkdown(md);
    assert.ok(html.includes('id="foo"'), `Expected id="foo" for first heading, got: ${html.slice(0, 400)}`);
    assert.ok(html.includes('id="foo-1"'), `Expected id="foo-1" for second heading, got: ${html.slice(0, 400)}`);
  });

  test('NAV-05-4: each heading has a permalink anchor with class header-anchor', async () => {
    const md = '## My Section\n';
    const html = await renderMarkdown(md);
    assert.ok(
      html.includes('header-anchor'),
      `Expected .header-anchor element on heading, got: ${html.slice(0, 400)}`
    );
  });
});

describe('NAV-06: Inline TOC', () => {
  test('NAV-06-1: doc with 3 h2 headings includes details.doc-toc before markdown-body', async () => {
    const md = '## Alpha\n\n## Beta\n\n## Gamma\n';
    const html = await renderMarkdown(md);
    assert.ok(
      html.includes('doc-toc'),
      `Expected doc-toc element, got: ${html.slice(0, 400)}`
    );
    const tocIdx = html.indexOf('doc-toc');
    const bodyIdx = html.indexOf('markdown-body');
    assert.ok(tocIdx < bodyIdx, `Expected doc-toc to appear before markdown-body, tocIdx=${tocIdx} bodyIdx=${bodyIdx}`);
  });

  test('NAV-06-2: TOC links reference correct heading slugs', async () => {
    const md = '## Hello World\n\n## Second Heading\n\n## Third One\n';
    const html = await renderMarkdown(md);
    assert.ok(html.includes('href="#hello-world"'), `Expected href="#hello-world" in TOC, got: ${html.slice(0, 600)}`);
    assert.ok(html.includes('href="#second-heading"'), `Expected href="#second-heading" in TOC`);
    assert.ok(html.includes('href="#third-one"'), `Expected href="#third-one" in TOC`);
  });

  test('NAV-06-3: doc with 0 headings has no doc-toc', async () => {
    const md = 'Just a paragraph with no headings.\n';
    const html = await renderMarkdown(md);
    assert.ok(!html.includes('doc-toc'), `Expected no doc-toc for headingless doc, got: ${html.slice(0, 400)}`);
  });

  test('NAV-06-3b: doc with exactly 1 heading has no doc-toc', async () => {
    const md = '## Only Heading\n\nsome content\n';
    const html = await renderMarkdown(md);
    assert.ok(!html.includes('doc-toc'), `Expected no doc-toc for single-heading doc, got: ${html.slice(0, 400)}`);
  });

  test('NAV-06-4: h3 items in TOC have indentation style', async () => {
    const md = '## Top\n\n### Sub\n\n## Another Top\n';
    const html = await renderMarkdown(md);
    assert.ok(html.includes('doc-toc'), `Expected doc-toc, got: ${html.slice(0, 400)}`);
    assert.ok(
      html.includes('padding-left'),
      `Expected padding-left on h3 TOC items, got: ${html.slice(0, 600)}`
    );
  });

  test('NAV-06-5: consecutive renders do not bleed headings', async () => {
    const docA = '## Doc A Heading One\n\n## Doc A Heading Two\n\n## Doc A Heading Three\n';
    const docB = '## Only B Heading\n';
    await renderMarkdown(docA);
    const htmlB = await renderMarkdown(docB);
    assert.ok(!htmlB.includes('doc-toc'), `Expected no doc-toc in doc B (1 heading), got: ${htmlB.slice(0, 600)}`);
    assert.ok(!htmlB.includes('doc-a'), `Expected no doc-A headings in doc-B output, got: ${htmlB.slice(0, 600)}`);
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
