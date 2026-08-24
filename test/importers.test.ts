import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseImportedJson,
  markdownToPlan,
  csvToRows,
  rowsToPhases,
  buildPlanFromRows,
  detectImportKind,
  guessColumnMapping
} from '../src/utils/importers';

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

describe('parseImportedJson — tolerant format detection', () => {
  it('recognizes a full v2 app backup', () => {
    const backup = {
      version: 2,
      activePlanId: 'go-roadmap',
      customPlans: [] as unknown[],
      settings: { dailyReminderEnabled: false, dailyReminderTime: '09:00', timeFormat: '12h' },
      global: {
        streak: 1,
        lastActiveDate: null as string | null,
        historyDates: [] as unknown[],
        totalStudyMinutes: 0,
        historyMinutes: {}
      },
      progressByPlan: {}
    };
    const out = parseImportedJson(JSON.stringify(backup));
    assert.equal(out.kind, 'appdata');
    if (out.kind === 'appdata') assert.equal(out.data.version, 2);
  });

  it('recognizes a single plan object', () => {
    const plan = { id: 'x', name: 'My Plan', emoji: '📌', accent: 'accent', sections: [] as unknown[], phases: [] as unknown[] };
    const out = parseImportedJson(JSON.stringify(plan));
    assert.equal(out.kind, 'plan');
    if (out.kind === 'plan') assert.equal(out.plan.name, 'My Plan');
  });

  it('unwraps a { plan: {...} } wrapper', () => {
    const wrapped = { plan: { id: 'y', name: 'Wrapped', emoji: '🎯', accent: 'accent', sections: [] as unknown[], phases: [] as unknown[] } };
    const out = parseImportedJson(JSON.stringify(wrapped));
    assert.equal(out.kind, 'plan');
    if (out.kind === 'plan') assert.equal(out.plan.name, 'Wrapped');
  });

  it('accepts an array of plans', () => {
    const plans = [
      { id: 'a', name: 'A', emoji: '🅰️', accent: 'accent', sections: [] as unknown[], phases: [] as unknown[] },
      { id: 'b', name: 'B', emoji: '🅱️', accent: 'accent', sections: [] as unknown[], phases: [] as unknown[] }
    ];
    const out = parseImportedJson(JSON.stringify(plans));
    assert.equal(out.kind, 'plans');
    if (out.kind === 'plans') assert.equal(out.plans.length, 2);
  });

  it('rejects garbage with a clear error', () => {
    assert.throws(() => parseImportedJson('{not json at all'), /Invalid JSON/);
    assert.throws(() => parseImportedJson('{"hello": "world"}'), /No plan data/);
  });
});

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

describe('markdownToPlan', () => {
  const md = [
    '# Rust Roadmap',
    '',
    'A plan for learning Rust.', // ignored prose
    '',
    '## Getting Started',
    '',
    '- Install rustup',
    '- [ ] Write hello world',
    '',
    '## Ownership',
    '',
    'Read the book chapter 4.',
    '',
    '- Understand borrowing',
    '',
    '### Advanced Ownership',
    '',
    '- Lifetimes'
  ].join('\n');

  it('uses the H1 as the plan name', () => {
    const plan = markdownToPlan(md);
    assert.equal(plan.name, 'Rust Roadmap');
  });

  it('turns H2/H3 headings into sequential phases', () => {
    const plan = markdownToPlan(md);
    assert.equal(plan.phases.length, 3);
    assert.equal(plan.phases[0].title, 'Getting Started');
    assert.equal(plan.phases[2].title, 'Advanced Ownership');
    assert.deepEqual(plan.phases.map((p) => p.id), [0, 1, 2]);
  });

  it('collects list items under each heading as steps', () => {
    const plan = markdownToPlan(md);
    assert.deepEqual(plan.phases[0].steps, ['Install rustup', 'Write hello world']);
    assert.deepEqual(plan.phases[1].steps, ['Understand borrowing']);
    assert.deepEqual(plan.phases[2].steps, ['Lifetimes']);
  });

  it('strips markdown checkboxes from step text', () => {
    const plan = markdownToPlan(md);
    assert.equal(plan.phases[0].steps[1], 'Write hello world');
  });

  it('falls back to the provided name when there is no H1', () => {
    const plan = markdownToPlan('## Only phases\n- do things', 'Pasted plan');
    assert.equal(plan.name, 'Pasted plan');
    assert.equal(plan.phases.length, 1);
  });

  it('produces an importable plan shape (id/emoji/accent/sections)', () => {
    const plan = markdownToPlan('# T\n## P1\n- x');
    assert.ok(plan.id.startsWith('imported-'));
    assert.ok(plan.emoji.length > 0);
    assert.ok(Array.isArray(plan.sections));
  });
});

// ---------------------------------------------------------------------------
// CSV / spreadsheet rows
// ---------------------------------------------------------------------------

describe('csvToRows', () => {
  it('splits on newlines and commas', () => {
    const rows = csvToRows('title,days\nSetup,3\nDeploy,5');
    assert.deepEqual(rows, [
      ['title', 'days'],
      ['Setup', '3'],
      ['Deploy', '5']
    ]);
  });

  it('honors double-quoted fields containing commas and escaped quotes', () => {
    const rows = csvToRows('title,notes\n"Phase 1, basics","say ""hi"""\nB,2');
    assert.deepEqual(rows[1], ['Phase 1, basics', 'say "hi"']);
  });
});

describe('rowsToPhases + buildPlanFromRows', () => {
  const headerRows = [
    ['title', 'description', 'hours'],
    ['Setup', 'Install tooling', '4'],
    ['API', 'Build endpoints', '12']
  ];

  it('maps chosen columns into phase title/steps/hours', () => {
    const phases = rowsToPhases(headerRows, { titleCol: 0, descriptionCol: 1, hoursCol: 2 });
    assert.equal(phases.length, 2);
    assert.equal(phases[0].title, 'Setup');
    assert.deepEqual(phases[0].steps, ['Install tooling']);
    assert.equal(phases[0].estimatedHours, 4);
    assert.equal(phases[1].title, 'API');
    assert.equal(phases[1].estimatedHours, 12);
  });

  it('skips empty rows and rows without a title', () => {
    const rows = [['t'], ['Real'], [''], [undefined as unknown as string]];
    const phases = rowsToPhases(rows, { titleCol: 0 });
    assert.equal(phases.length, 1);
  });

  it('parses hours loosely ("~4h", "4-6", "12")', () => {
    const phases = rowsToPhaces();
    function rowsToPhaces() {
      return rowsToPhases(
        [
          ['t', 'h'],
          ['A', '~4h'],
          ['B', '4-6'],
          ['C', '12']
        ],
        { titleCol: 0, hoursCol: 1 }
      );
    }
    assert.equal(phases[0].estimatedHours, 4);
    assert.equal(phases[1].estimatedHours, 5); // midpoint of a range
    assert.equal(phases[2].estimatedHours, 12);
  });

  it('builds a complete importable plan from rows', () => {
    const plan = buildPlanFromRows('Excel Course', headerRows, { titleCol: 0, descriptionCol: 1 });
    assert.equal(plan.name, 'Excel Course');
    assert.equal(plan.phases.length, 2);
    assert.ok(plan.id.startsWith('imported-'));
    assert.equal(plan.builtIn, undefined);
  });
});

describe('detectImportKind', () => {
  it('routes by file extension', () => {
    assert.equal(detectImportKind('backup.json'), 'json');
    assert.equal(detectImportKind('roadmap.md'), 'markdown');
    assert.equal(detectImportKind('roadmap.markdown'), 'markdown');
    assert.equal(detectImportKind('tasks.csv'), 'csv');
    assert.equal(detectImportKind('tasks.xlsx'), 'sheet');
    assert.equal(detectImportKind('tasks.XLS'), 'sheet');
  });
});

describe('guessColumnMapping (UI column auto-detection)', () => {
  it('maps title + hours + description from typical headers', () => {
    const m = guessColumnMapping(['phase', 'hours', 'notes']);
    assert.equal(m.titleCol, 0);
    assert.equal(m.hoursCol, 1);
    assert.equal(m.descriptionCol, 2);
  });

  it('prefers phase/title/name headers for the title over col 0', () => {
    const m = guessColumnMapping(['extra', 'title', 'description']);
    assert.equal(m.titleCol, 1);
    assert.equal(m.descriptionCol, 2);
  });

  it('never maps the same column twice', () => {
    const m = guessColumnMapping(['task time', 'task notes']); // both regexes collide
    const used = [m.titleCol, m.descriptionCol, m.hoursCol].filter((x) => x !== undefined && x >= 0);
    assert.equal(new Set(used).size, used.length, 'columns must be unique');
  });

  it('returns bare mapping for single-column sheets', () => {
    const m = guessColumnMapping(['step']);
    assert.equal(m.titleCol, 0);
    assert.equal(m.descriptionCol, undefined);
    assert.equal(m.hoursCol, undefined);
  });
});

describe('rowsToPhases with unset titleCol (-1)', () => {
  it('produces zero phases instead of garbage when no title is mapped', () => {
    const rows = csvToRows('a,b\n1,2\n3,4');
    const phases = rowsToPhases(rows, { titleCol: -1, descriptionCol: 1 });
    assert.deepEqual(phases, []);
  });
});
