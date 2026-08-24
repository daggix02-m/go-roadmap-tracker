/**
 * importers — tolerant multi-format plan/data import.
 *
 * Supported sources:
 * • JSON   — full app backup (v2 AppData), a single Plan, { plan: {...} },
 *            or an array of Plans
 * • Markdown — H1 = plan name, H2/H3 = phases, list items = steps
 * • CSV / Excel (via SheetJS at the UI layer) — rows mapped to phases with
 *   a user-chosen column mapping; the first row is treated as headers
 */
import { Plan, Phase } from '../types';

// ---------------------------------------------------------------------------
// Kind detection
// ---------------------------------------------------------------------------

export type ImportKind = 'json' | 'markdown' | 'csv' | 'sheet';

/** Route a file to its parser by extension. */
export function detectImportKind(filename: string): ImportKind {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') return 'markdown';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  return 'sheet'; // xlsx / xls and anything else SheetJS can open
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export type ParsedJson =
  | { kind: 'appdata'; data: Record<string, unknown> }
  | { kind: 'plan'; plan: Plan }
  | { kind: 'plans'; plans: Plan[] };

function looksLikePlan(o: unknown): o is Plan {
  return (
    !!o &&
    typeof o === 'object' &&
    typeof (o as Plan).name === 'string' &&
    Array.isArray((o as Plan).phases)
  );
}

/**
 * Best-effort identification of the JSON flavor. Throws with an actionable
 * message when nothing recognizable is found — the caller surfaces it verbatim.
 */
export function parseImportedJson(text: string): ParsedJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  // Full app backup first — it also contains plans nested inside customPlans.
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as { customPlans?: unknown }).customPlans) &&
    typeof (parsed as { version?: unknown }).version === 'number'
  ) {
    return { kind: 'appdata', data: parsed as Record<string, unknown> };
  }
  if (Array.isArray(parsed)) {
    const plans = parsed.filter(looksLikePlan);
    if (plans.length > 0) return { kind: 'plans', plans };
  } else {
    const wrapper = (parsed as { plan?: unknown })?.plan;
    if (looksLikePlan(wrapper)) return { kind: 'plan', plan: wrapper };
    if (looksLikePlan(parsed)) return { kind: 'plan', plan: parsed as Plan };
  }
  throw new Error('No plan data found in this JSON file.');
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const IMPORT_ID_PREFIX = 'imported-';

function newImportedId(): string {
  return `${IMPORT_ID_PREFIX}${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Strip checkbox markers and list bullets from a raw line. */
function cleanStepText(line: string): string {
  return line
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\[[ xX]\]\s*/, '')
    .trim();
}

function isListItem(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line);
}

/**
 * Convert a markdown outline into a plan:
 * `# Name` → plan name · `##`/`###` headings → sequential phases ·
 * `- item` lines under a heading → that phase's steps. Prose between
 * headings is ignored.
 */
export function markdownToPlan(markdown: string, fallbackName = 'Imported plan'): Plan {
  const lines = markdown.split(/\r?\n/);

  let name = '';
  const phases: Phase[] = [];
  let current: Phase | null = null;

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^#{2,3}\s+(.+)$/);
    if (h1 && !name && phases.length === 0) {
      name = h1[1].trim();
      continue;
    }
    if (h2) {
      current = {
        id: phases.length,
        section: '',
        title: h2[1].trim(),
        steps: [],
        exit: []
      };
      phases.push(current);
      continue;
    }
    if (current && isListItem(line)) {
      const step = cleanStepText(line);
      if (step) current.steps.push(step);
    }
  }

  return {
    id: newImportedId(),
    name: name || fallbackName,
    emoji: '📥',
    accent: 'accent',
    sections: [],
    phases,
    lastModifiedAt: Date.now()
  };
}

// ---------------------------------------------------------------------------
// CSV / spreadsheet rows
// ---------------------------------------------------------------------------

/**
 * RFC-4180-style CSV parsing: double quotes escape fields (commas/newlines
 * inside quotes are preserved, "" is a literal quote). Returns a grid of
 * trimmed cells.
 */
export function csvToRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

export interface ColumnMapping {
  /** Column index holding the phase title (required; -1 = none mapped). */
  titleCol: number;
  /** Column appended to the phase as its single step (optional). */
  descriptionCol?: number;
  /** Column parsed into estimatedHours (optional; ranges use the midpoint). */
  hoursCol?: number;
}

/**
 * Guess a column mapping from a CSV/sheet header row. Each column is used at
 * most once; unknown headers leave the role unmapped.
 */
export function guessColumnMapping(header: string[]): ColumnMapping {
  const cols = header.map((h) => h.toLowerCase());
  const used = new Set<number>();
  const m: ColumnMapping = { titleCol: -1 };

  const find = (re: RegExp): number => {
    const idx = cols.findIndex((h, i) => !used.has(i) && re.test(h));
    if (idx >= 0) used.add(idx);
    return idx;
  };

  // Title first: explicit phase/title/name/task beats "first column".
  m.titleCol = find(/phase|title|name|task/) ?? -1;
  if (m.titleCol === -1 && header.length > 0) {
    m.titleCol = 0;
    used.add(0);
  }

  const descIdx = find(/desc|note|detail|what|step|action/);
  if (descIdx > 0 || (descIdx === 0 && m.titleCol !== 0)) m.descriptionCol = descIdx;

  const hoursIdx = find(/hour|time|dur|est/);
  if (hoursIdx >= 0 && hoursIdx !== m.titleCol) m.hoursCol = hoursIdx;

  return m;
}

/** Parse "~4h", "4-6", "3.5", "12" into hours; undefined when unparseable. */
function parseHours(raw: string): number | undefined {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)?\s*(\d+(?:\.\d+)?)?/i);
  if (!m) return undefined;
  const lo = parseFloat(m[1]);
  if (!Number.isFinite(lo)) return undefined;
  if (m[2] !== undefined) {
    const hi = parseFloat(m[2]);
    if (Number.isFinite(hi)) return Math.round(((lo + hi) / 2) * 10) / 10;
  }
  return lo;
}

/**
 * Map a spreadsheet grid onto phases. The FIRST ROW IS ALWAYS THE HEADER —
 * the UI says so explicitly. Empty rows and rows without a title are skipped.
 */
export function rowsToPhases(
  rows: string[][],
  mapping: ColumnMapping
): Phase[] {
  const phases: Phase[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = (row[mapping.titleCol] ?? '').trim();
    if (!title) continue;
    const phase: Phase = {
      id: phases.length,
      section: '',
      title,
      steps: [],
      exit: []
    };
    if (mapping.descriptionCol !== undefined) {
      const desc = (row[mapping.descriptionCol] ?? '').trim();
      if (desc) phase.steps.push(desc);
    }
    if (mapping.hoursCol !== undefined) {
      const hours = parseHours((row[mapping.hoursCol] ?? '').trim());
      if (hours !== undefined) phase.estimatedHours = hours;
    }
    phases.push(phase);
  }
  return phases;
}

/** Build a complete importable plan from mapped spreadsheet rows. */
export function buildPlanFromRows(
  name: string,
  rows: string[][],
  mapping: ColumnMapping
): Plan {
  return {
    id: newImportedId(),
    name: name || 'Imported sheet',
    emoji: '📥',
    accent: 'accent',
    sections: [],
    phases: rowsToPhases(rows, mapping),
    lastModifiedAt: Date.now()
  };
}
