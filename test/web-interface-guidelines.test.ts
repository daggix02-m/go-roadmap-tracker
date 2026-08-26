/**
 * Web Interface Guidelines compliance tests.
 *
 * These tests verify source-level compliance with Vercel's Web Interface
 * Guidelines by scanning component source files for anti-patterns.
 *
 * Test categories:
 *  - Accessibility: icon buttons have aria-label, form inputs have labels
 *  - Animation: no transition:all, prefers-reduced-motion handled
 *  - Focus: focus-visible styles defined
 *  - Content: ellipsis not dots, loading states end with …
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const CSS_FILE = join(SRC_DIR, 'index.css');

function readFile(relPath: string): string {
  return readFileSync(join(SRC_DIR, relPath), 'utf-8');
}

function readCss(): string {
  return readFileSync(CSS_FILE, 'utf-8');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAllTsxFiles(): string[] {
  const results: string[] = [];
  const componentsDir = join(SRC_DIR, 'components');
  const entries = readdirSync(componentsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(join(componentsDir, entry.name));
    }
    if (entry.isDirectory()) {
      const subDir = join(componentsDir, entry.name);
      const subEntries = readdirSync(subDir, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile() && sub.name.endsWith('.tsx')) {
          results.push(join(subDir, sub.name));
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Accessibility — Icon buttons must have aria-label
// ---------------------------------------------------------------------------

describe('Accessibility — icon buttons have aria-label', () => {
  // Icon-only buttons (no visible text children) need aria-label.
  // We scan for <button> elements that contain only icon components
  // (lucide-react icons like <Timer>, <BarChart3>, etc.) without text.

  const COMPONENTS_WITH_ICON_BUTTONS = [
    'components/Header.tsx',
    'components/MobileBottomBar.tsx',
    'components/ActiveTimerBar.tsx',
    'components/DailyFocusBar.tsx',
    'components/StudyTimerModal.tsx',
    'components/StatsModal.tsx',
    'components/SettingsModal.tsx',
    'components/PlanSwitcher.tsx',
    'components/AccountButton.tsx',
    'components/InstallGuideModal.tsx',
    'components/GoCheatsheetModal.tsx',
    'components/AuthModal.tsx',
  ];

  for (const relPath of COMPONENTS_WITH_ICON_BUTTONS) {
    test(`${relPath} — icon buttons have aria-label`, () => {
      const src = readFile(relPath);

      // Find all <button> tags that have only an icon component as child
      // (no text content between tags). Pattern: <button ...> <Icon /> </button>
      // with no text between the icon and closing tag.
      const iconOnlyButtonPattern =
        /<button[^>]*>\s*<(?:[A-Z]\w+)[^/]*\/>\s*<\/button>/g;

      const matches = src.match(iconOnlyButtonPattern) || [];

      for (const match of matches) {
        // Each icon-only button must have aria-label
        assert.ok(
          /aria-label\s*=/.test(match),
          `Icon-only button missing aria-label in ${relPath}:\n${match.trim()}`
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Accessibility — Form inputs have labels
// ---------------------------------------------------------------------------

describe('Accessibility — form inputs have labels', () => {
  // Every <input> and <textarea> should have either:
  //  - An associated <label htmlFor={id}>
  //  - An aria-label attribute
  //  - An aria-labelledby attribute
  //  - Be inside a <label> element

  const COMPONENTS_WITH_INPUTS = [
    'components/FilterBar.tsx',
    'components/SettingsModal.tsx',
    'components/AuthModal.tsx',
    'components/PhaseCard.tsx',
    'components/ImportModal.tsx',
    'components/PlanEditorModal.tsx',
  ];

  for (const relPath of COMPONENTS_WITH_INPUTS) {
    test(`${relPath} — inputs have labels or aria-label`, () => {
      const src = readFile(relPath);

      // Find all <input> elements using a line-by-line scan for better multiline support
      const lines = src.split('\n');
      let inInput = false;
      let inputBlock = '';
      const inputs: string[] = [];

      for (const line of lines) {
        if (line.includes('<input') && !inInput) {
          inInput = true;
          inputBlock = line;
          if (line.includes('/>') || line.includes('</input>')) {
            inputs.push(inputBlock);
            inInput = false;
            inputBlock = '';
          }
        } else if (inInput) {
          inputBlock += '\n' + line;
          if (line.includes('/>') || line.includes('</input>')) {
            inputs.push(inputBlock);
            inInput = false;
            inputBlock = '';
          }
        }
      }

      // Filter out hidden and file inputs
      const visibleInputs = inputs.filter(
        (i) => !/type\s*=\s*["'](?:hidden|file)["']/.test(i)
      );

      for (const input of visibleInputs) {
        const hasAriaLabel = /aria-label\s*=/.test(input);
        const hasAriaLabelledby = /aria-labelledby\s*=/.test(input);

        // Check for id= (handles both quoted strings and template literals)
        const idMatch = /id\s*=\s*(?:["']([^"']+)["']|{`([^`]+)`})/.exec(input);

        // Check if there's a <label htmlFor={id}> in the file
        let hasLabel = false;
        if (idMatch) {
          const idValue = idMatch[1] || idMatch[2];
          // Match htmlFor with quoted strings or template literals
          const labelPattern = new RegExp(
            `<label[^>]*htmlFor\\s*=\\s*(?:["'][^"']*${escapeRegExp(idValue)}[^"']*["']|{` + '`' + `[^` + '`' + `]*${escapeRegExp(idValue)}[^` + '`' + `]*` + '`' + `})[^>]*>`
          );
          hasLabel = labelPattern.test(src);
        }

        // Check if input is inside a <label> element (wrapping pattern)
        const inputIdx = src.indexOf(input);
        if (inputIdx >= 0) {
          const precedingLabel = src.lastIndexOf('<label', inputIdx);
          const precedingLabelClose = src.lastIndexOf('</label>', inputIdx);
          if (precedingLabel > precedingLabelClose) {
            hasLabel = true;
          }
        }

        assert.ok(
          hasAriaLabel || hasAriaLabelledby || hasLabel,
          `Input missing label/aria-label in ${relPath}:\n${input.slice(0, 120)}`
        );
      }

      // Also check <textarea> elements using multiline scanning
      let inTextarea = false;
      let textareaBlock = '';
      const textareas: string[] = [];

      for (const line of lines) {
        if (line.includes('<textarea') && !inTextarea) {
          inTextarea = true;
          textareaBlock = line;
          // Check if textarea closes on same line (self-closing or has closing tag)
          if (line.includes('/>') || line.includes('</textarea>')) {
            textareas.push(textareaBlock);
            inTextarea = false;
            textareaBlock = '';
          }
        } else if (inTextarea) {
          textareaBlock += '\n' + line;
          if (line.includes('/>') || line.includes('</textarea>')) {
            textareas.push(textareaBlock);
            inTextarea = false;
            textareaBlock = '';
          }
        }
      }

      for (const textarea of textareas) {
        const hasAriaLabel = /aria-label\s*=/.test(textarea);

        // Check for id= (handles both quoted strings and template literals)
        const idMatch = /id\s*=\s*(?:["']([^"']+)["']|{`([^`]+)`})/.exec(textarea);

        let hasLabel = false;
        if (idMatch) {
          const idValue = idMatch[1] || idMatch[2];
          const labelPattern = new RegExp(
            `<label[^>]*htmlFor\\s*=\\s*(?:["'][^"']*${escapeRegExp(idValue)}[^"']*["']|{` + '`' + `[^` + '`' + `]*${escapeRegExp(idValue)}[^` + '`' + `]*` + '`' + `})[^>]*>`
          );
          hasLabel = labelPattern.test(src);
        }

        // Check if textarea is inside a <label> element
        const textareaIdx = src.indexOf(textarea);
        if (textareaIdx >= 0) {
          const precedingLabel = src.lastIndexOf('<label', textareaIdx);
          const precedingLabelClose = src.lastIndexOf('</label>', textareaIdx);
          if (precedingLabel > precedingLabelClose) {
            hasLabel = true;
          }
        }

        assert.ok(
          hasAriaLabel || hasLabel,
          `Textarea missing label/aria-label in ${relPath}:\n${textarea.slice(0, 120)}`
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Animation — no transition: all
// ---------------------------------------------------------------------------

describe('Animation — no transition: all', () => {
  test('CSS file does not contain transition: all', () => {
    const css = readCss();
    const hasTransitionAll = /transition\s*:\s*all/.test(css);
    assert.ok(!hasTransitionAll, 'CSS contains transition: all — specify properties explicitly');
  });

  test('TSX files do not use transition-all Tailwind class', () => {
    const files = getAllTsxFiles();
    const violations: string[] = [];

    for (const filePath of files) {
      const src = readFileSync(filePath, 'utf-8');
      const relPath = filePath.replace(SRC_DIR + '/', '');

      // Match transition-all as a standalone Tailwind class
      // (not transition-all-*, which might be valid)
      const pattern = /\btransition-all\b(?!\w)/g;
      let match;
      while ((match = pattern.exec(src)) !== null) {
        violations.push(`${relPath} uses transition-all`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found transition-all usage:\n${violations.join('\n')}`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Focus — focus-visible styles defined
// ---------------------------------------------------------------------------

describe('Focus — focus-visible styles defined', () => {
  test('CSS has :focus-visible rule', () => {
    const css = readCss();
    assert.ok(
      /:focus-visible\s*\{/.test(css),
      'CSS missing :focus-visible rule'
    );
  });

  test(':focus-visible rule provides visible focus indicator', () => {
    const css = readCss();
    // Extract the :focus-visible block
    const match = /:focus-visible\s*\{([^}]+)\}/.exec(css);
    assert.ok(match, 'Could not find :focus-visible rule');
    if (match) {
      const body = match[1];
      // Should have outline or ring or box-shadow
      assert.ok(
        /outline|ring|box-shadow/.test(body),
        ':focus-visible rule should set outline, ring, or box-shadow'
      );
      // Should NOT just be outline: none without replacement
      assert.ok(
        !/outline\s*:\s*none(?!.*(?:ring|box-shadow))/.test(body),
        ':focus-visible should not set outline:none without replacement'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Content — ellipsis not dots, loading ends with …
// ---------------------------------------------------------------------------

describe('Content — typography conventions', () => {
  test('source files use … not ... for ellipsis', () => {
    const files = getAllTsxFiles();
    const violations: string[] = [];

    for (const filePath of files) {
      const src = readFileSync(filePath, 'utf-8');
      const relPath = filePath.replace(SRC_DIR + '/', '');

      // Find ... that is NOT inside a code block or string
      // (simplified: just check for literal "..." in JSX text content)
      // Exclude: TypeScript spread (...rest), string literals with ...
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip lines that are comments or contain spread operators
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        // Check for "..." in JSX text (not in strings or spread)
        if (/\.\.\.(?!\.)/.test(line) && !/['"`].*\.\.\..*['"`]/.test(line)) {
          // Check if it's in a JSX text context (not in props)
          if (/>[^<]*\.\.\.[^<]*</.test(line) || />\s*\.\.\.\s*</.test(line)) {
            violations.push(`${relPath}:${i + 1} — use … not ...`);
          }
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found literal ... in JSX text:\n${violations.join('\n')}`
    );
  });

  test('loading states end with …', () => {
    const files = getAllTsxFiles();
    const warnings: string[] = [];

    for (const filePath of files) {
      const src = readFileSync(filePath, 'utf-8');
      const relPath = filePath.replace(SRC_DIR + '/', '');

      // Find loading-related text that doesn't end with …
      const loadingPattern = /['"`](Loading|Saving|Syncing|Importing|Exporting|Setting up|Signing in|Creating account|Updating|Restoring|Parsing|Processing)['"``]/gi;
      let match;
      while ((match = loadingPattern.exec(src)) !== null) {
        const text = match[0];
        // Check if the next character is …
        const afterQuote = src[match.index + match.length];
        if (afterQuote !== '…' && afterQuote !== '\u2026') {
          // Check if it's followed by a closing quote or template literal end
          const context = src.slice(match.index, match.index + match.length + 5);
          if (!/\.{3}|…|\u2026/.test(context)) {
            warnings.push(`${relPath}: "${match[1]}" should end with …`);
          }
        }
      }
    }

    // These are warnings, not hard failures
    if (warnings.length > 0) {
      console.warn(`[WIG] Loading state text should end with …:\n${warnings.join('\n')}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Dark mode — color-scheme meta
// ---------------------------------------------------------------------------

describe('Dark mode — color-scheme meta', () => {
  test('index.html has color-scheme meta tag', () => {
    const html = readFileSync(
      join(import.meta.dirname, '..', 'index.html'),
      'utf-8'
    );
    assert.ok(
      /meta[^>]*name\s*=\s*["']color-scheme["']/.test(html),
      'index.html missing <meta name="color-scheme">'
    );
  });

  test('index.html has theme-color meta tag', () => {
    const html = readFileSync(
      join(import.meta.dirname, '..', 'index.html'),
      'utf-8'
    );
    assert.ok(
      /meta[^>]*name\s*=\s*["']theme-color["']/.test(html),
      'index.html missing <meta name="theme-color">'
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Safe areas & layout
// ---------------------------------------------------------------------------

describe('Safe areas & layout', () => {
  test('CSS handles safe-area-inset for notch devices', () => {
    const css = readCss();
    assert.ok(
      /safe-area-inset/.test(css),
      'CSS missing env(safe-area-inset-*) for notch support'
    );
  });

  test('modals have overscroll-behavior: contain', () => {
    const css = readCss();
    assert.ok(
      /overscroll-behavior\s*:\s*contain/.test(css),
      'CSS missing overscroll-behavior: contain for modals'
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Touch — tap highlight
// ---------------------------------------------------------------------------

describe('Touch — tap highlight', () => {
  test('CSS sets -webkit-tap-highlight-color', () => {
    const css = readCss();
    assert.ok(
      /-webkit-tap-highlight-color/.test(css),
      'CSS missing -webkit-tap-highlight-color'
    );
  });
});
