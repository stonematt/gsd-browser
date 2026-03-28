'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const THEME_CSS_PATH = path.join(__dirname, '..', 'public', 'styles', 'theme.css');

describe('theme.css smoke tests', () => {
  let cssContent;

  test('theme.css file exists', () => {
    assert.ok(fs.existsSync(THEME_CSS_PATH), 'public/styles/theme.css should exist');
    cssContent = fs.readFileSync(THEME_CSS_PATH, 'utf8');
  });

  test('file contains :root { block', () => {
    if (!cssContent) cssContent = fs.readFileSync(THEME_CSS_PATH, 'utf8');
    assert.ok(cssContent.includes(':root {'), 'theme.css should contain :root { block');
  });

  test('file contains @media (prefers-color-scheme: light) block', () => {
    if (!cssContent) cssContent = fs.readFileSync(THEME_CSS_PATH, 'utf8');
    assert.ok(
      cssContent.includes('@media (prefers-color-scheme: light)'),
      'theme.css should contain @media (prefers-color-scheme: light) block'
    );
  });

  test('file contains all required token names', () => {
    if (!cssContent) cssContent = fs.readFileSync(THEME_CSS_PATH, 'utf8');
    const requiredTokens = [
      '--bg-page',
      '--bg-surface',
      '--text-primary',
      '--text-link',
      '--status-complete',
      '--status-active',
      '--status-pending',
      '--btn-primary-bg',
    ];

    for (const token of requiredTokens) {
      assert.ok(cssContent.includes(token), `theme.css should contain token ${token}`);
    }
  });

  test('file does not contain bare hex values outside of var() token definitions', () => {
    if (!cssContent) cssContent = fs.readFileSync(THEME_CSS_PATH, 'utf8');
    // theme.css should only DEFINE tokens (hex values on the right side of :),
    // not consume them (hex values in property values outside of token defs).
    // We verify by checking that all hex values appear as token definitions (--token: #hex)
    // and not as direct property usages like "color: #hex" or "background: #hex".
    //
    // Strategy: scan non-comment lines for patterns like "property: #hex" where
    // property is NOT a CSS custom property (does not start with --)
    const lines = cssContent.split('\n');
    const violations = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // skip comments and empty lines
      if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
      // skip lines that are token definitions (start with --)
      if (trimmed.startsWith('--')) continue;
      // check if non-token line has a bare hex color value
      if (/:\s*#[0-9a-fA-F]{3,8}/.test(trimmed)) {
        violations.push(trimmed);
      }
    }
    assert.deepEqual(violations, [], `theme.css should not have bare hex values in non-token lines: ${violations.join('; ')}`);
  });
});
