import React, { useEffect, useRef, useState } from 'react';
import { FileUp, Loader2, X, Check, AlertTriangle, Table2, FileText, Braces } from 'lucide-react';
import {
  ColumnMapping,
  buildPlanFromRows,
  csvToRows,
  detectImportKind,
  guessColumnMapping,
  markdownToPlan,
  parseImportedJson
} from '../utils/importers';
import { Plan, AppData } from '../types';

interface ImportModalProps {
  onImportAppData: (data: Partial<AppData>) => void;
  onImportPlans: (plans: Plan[], replaceAll: boolean) => void;
  onClose: () => void;
}

type Parsed =
  | { kind: 'appdata'; data: Partial<AppData>; summary: string }
  | { kind: 'plans'; plans: Plan[]; summary: string }
  | { kind: 'sheet'; rows: string[][]; fileName: string; summary?: undefined };

const colRoleLabels = ['Ignore', 'Title', 'Description', 'Hours'] as const;

/**
 * Multi-format import flow: JSON backups / plans, Markdown outlines,
 * and CSV/Excel sheets with a column-mapping step. Parsing is tolerant —
 * errors are shown verbatim so the user knows exactly what went wrong.
 */
export const ImportModal: React.FC<ImportModalProps> = ({
  onImportAppData,
  onImportPlans,
  onClose
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping>({ titleCol: 0 });
  const [sheetName, setSheetName] = useState('Imported sheet');
  const [done, setDone] = useState('');

  const reset = () => {
    setParsed(null);
    setError('');
    setPasteText('');
    setBusy(false);
  };

  /** Parse pasted text by sniffing content when no extension guides us. */
  const importPasted = async () => {
    const text = pasteText.trim();
    if (!text) return;
    setBusy(true);
    setError('');
    try {
      if (text.startsWith('{') || text.startsWith('[')) {
        applyJson(text);
      } else {
        const plan =
          text.includes('\n') && /^#{1,3}\s/m.test(text)
            ? markdownToPlan(text, 'Pasted plan')
            : null;
        if (plan) {
          setParsed({
            kind: 'plans',
            plans: [plan],
            summary: `${plan.phases.length} phases from markdown`
          });
        } else {
          // Treat as delimiter-less CSV (one column).
          const rows = csvToRows(text);
          setParsed({ kind: 'sheet', rows, fileName: 'pasted text' });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse the pasted content.');
    } finally {
      setBusy(false);
    }
  };

  const applyJson = (text: string) => {
    const out = parseImportedJson(text);
    if (out.kind === 'appdata') {
      setParsed({ kind: 'appdata', data: out.data as Partial<AppData>, summary: 'Full app backup' });
    } else if (out.kind === 'plan') {
      setParsed({
        kind: 'plans',
        plans: [out.plan],
        summary: `1 plan · ${out.plan.phases.length} phases`
      });
    } else {
      setParsed({
        kind: 'plans',
        plans: out.plans,
        summary: `${out.plans.length} plans · ${out.plans.reduce((n, p) => n + p.phases.length, 0)} phases total`
      });
    }
  };

  const onPickFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const kind = detectImportKind(file.name);
      if (kind === 'json') {
        applyJson(await file.text());
      } else if (kind === 'markdown') {
        const plan = markdownToPlan(await file.text(), file.name.replace(/\.[^.]+$/, ''));
        setParsed({
          kind: 'plans',
          plans: [plan],
          summary: `${plan.phases.length} phases · ${plan.phases.reduce((n, p) => n + p.steps.length, 0)} steps`
        });
      } else if (kind === 'csv') {
        const rows = csvToRows(await file.text());
        setParsed({ kind: 'sheet', rows, fileName: file.name });
      } else {
        // Excel — SheetJS loaded only when actually needed.
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], {
          header: 1,
          raw: false,
          defval: ''
        });
        const rows = grid.map((r) => r.map((c) => String(c ?? '').trim()));
        if (rows.length > 0) setParsed({ kind: 'sheet', rows, fileName: file.name });
        else throw new Error('The first sheet is empty.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not read ${file.name}.`);
    } finally {
      setBusy(false);
    }
  };

  /** Default mapping guess: title=col0, description=col1, hours=a column named like hours. */
  // Adopt the auto-detected mapping whenever a new sheet is parsed (the user's
  // manual tweaks persist because this only fires when `parsed` changes).
  useEffect(() => {
    if (parsed?.kind === 'sheet') setMapping(guessColumnMapping(parsed.rows[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  const confirmSheetMapping = (m: ColumnMapping) => {
    if (!parsed || parsed.kind !== 'sheet') return;
    const plan = buildPlanFromRows(sheetName || parsed.fileName.replace(/\.[^.]+$/, ''), parsed.rows, m);
    setParsed({
      kind: 'plans',
      plans: [plan],
      summary: `${plan.phases.length} phases · ${plan.phases.reduce((n, p) => n + p.steps.length, 0)} steps`
    });
  };

  const confirm = (replaceAll: boolean) => {
    if (!parsed) return;
    if (parsed.kind === 'appdata') {
      onImportAppData(parsed.data);
      setDone('Backup restored.');
    } else if (parsed.kind === 'plans') {
      onImportPlans(parsed.plans, replaceAll);
      setDone(
        replaceAll
          ? `Replaced all plans with ${parsed.plans.length} imported.`
          : `Added ${parsed.plans.length} plan${parsed.plans.length === 1 ? '' : 's'}.`
      );
    }
    setParsed(null);
    setTimeout(onClose, 900);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import data"
        className="w-full max-w-md bg-surface border border-line rounded-xl p-5 sm:p-6 relative max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close import"
          className="absolute top-3.5 right-3.5 p-1.5 text-muted hover:text-text rounded-md hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-1">
          <FileUp className="w-5 h-5 text-accent" />
          <h2 className="text-base font-semibold text-text">Import</h2>
        </div>
        <p className="text-xs text-muted mb-4 leading-relaxed">
          JSON backups &amp; plans · Markdown outlines · CSV / Excel sheets.
        </p>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Check className="w-10 h-10 text-success" />
            <p className="text-sm font-medium text-text">{done}</p>
          </div>
        ) : !parsed ? (
          <div className="space-y-3">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full py-6 px-4 rounded-lg border border-dashed border-line-strong bg-raised/50 hover:bg-hover transition-colors cursor-pointer flex flex-col items-center gap-2 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-5 h-5 text-muted animate-spin" />
              ) : (
                <FileUp className="w-5 h-5 text-muted" />
              )}
              <span className="text-sm font-medium text-text">Choose a file… or drop it here</span>
              <span className="text-[11px] text-faint">.json · .md · .csv · .xlsx · .xls</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.md,.markdown,.txt,.csv,.tsv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void onPickFile(f);
              }}
            />

            <details className="group">
              <summary className="text-[11px] text-muted hover:text-text cursor-pointer select-none">
                …or paste JSON / markdown / CSV instead
              </summary>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'# My roadmap\n## Phase 1\n- first step'}
                rows={5}
                className="mt-2 w-full px-2.5 py-2 rounded-md bg-raised border border-line text-xs font-mono text-text focus:outline-none focus:border-accent/60 resize-y"
              />
              <button
                onClick={() => void importPasted()}
                disabled={!pasteText.trim() || busy}
                className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Parse pasted content
              </button>
            </details>

            {error && (
              <p className="flex items-start gap-1.5 text-[11px] text-danger" role="alert">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {error}
              </p>
            )}
          </div>
        ) : parsed.kind === 'sheet' ? (
          /* ---- Column mapping for spreadsheets ---- */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-text font-medium">
              <Table2 className="w-4 h-4 text-accent" />
              Map columns — first row is the header
            </div>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Plan name"
              aria-label="Plan name for imported sheet"
              className="w-full px-2.5 py-2 rounded-md bg-raised border border-line text-xs text-text focus:outline-none focus:border-accent/60"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-line divide-y divide-line">
              {parsed.rows[0].map((headerCell, colIdx) => (
                <div key={colIdx} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-xs text-text truncate font-mono">
                    {headerCell || `(column ${colIdx + 1})`}
                  </span>
                  <select
                    aria-label={`Role for column ${headerCell || colIdx + 1}`}
                    value={
                      mapping.titleCol === colIdx
                        ? '1'
                        : mapping.descriptionCol === colIdx
                          ? '2'
                          : mapping.hoursCol === colIdx
                            ? '3'
                            : '0'
                    }
                    onChange={(e) => {
                      const role = Number(e.target.value);
                      const next: ColumnMapping = { ...mapping };
                      // Clear this column's current role first.
                      if (next.titleCol === colIdx) next.titleCol = -1;
                      if (next.descriptionCol === colIdx) delete next.descriptionCol;
                      if (next.hoursCol === colIdx) delete next.hoursCol;
                      // Assign the new role (moves the role off other columns).
                      if (role === 1) next.titleCol = colIdx;
                      else if (role === 2) next.descriptionCol = colIdx;
                      else if (role === 3) next.hoursCol = colIdx;
                      setMapping(next);
                    }}
                    className="px-1.5 py-1 rounded-md bg-raised border border-line text-[11px] text-text focus:outline-none focus:border-accent/60 cursor-pointer shrink-0"
                  >
                    {colRoleLabels.map((label, i) => (
                      <option key={label} value={i} className="bg-page">
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex-1 px-3 py-2 rounded-md border border-line text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={() => confirmSheetMapping(mapping)}
                disabled={mapping.titleCol < 0}
                className="flex-1 px-3 py-2 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Preview {parsed.rows.length - 1} rows
              </button>
            </div>
          </div>
        ) : (
          /* ---- Preview before applying ---- */
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-line bg-raised/50 space-y-1">
              {parsed.kind === 'appdata' ? (
                <>
                  <p className="flex items-center gap-2 text-xs font-medium text-text">
                    <Braces className="w-4 h-4 text-accent shrink-0" /> Full app backup
                  </p>
                  <p className="text-[11px] text-muted">
                    Restores everything — this replaces your current plans and progress.
                  </p>
                  {(parsed.data.customPlans as Plan[] | undefined)?.length !== undefined && (
                    <p className="text-[11px] text-faint">
                      Contains {(parsed.data.customPlans as Plan[]).length} custom plan(s).
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-xs font-medium text-text">
                    <FileText className="w-4 h-4 text-accent shrink-0" /> {parsed.summary}
                  </p>
                  <ul className="text-[11px] text-muted space-y-0.5 mt-1.5">
                    {parsed.plans.slice(0, 5).map((p) => (
                      <li key={p.id} className="truncate">
                        {p.emoji} {p.name} — {p.phases.length} phases
                      </li>
                    ))}
                    {parsed.plans.length > 5 && (
                      <li className="text-faint">+{parsed.plans.length - 5} more…</li>
                    )}
                  </ul>
                </>
              )}
            </div>

            {error && (
              <p className="text-[11px] text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 gap-2">
              {parsed.kind === 'appdata' ? (
                <button
                  onClick={() => confirm(true)}
                  className="w-full px-3 py-2.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
                >
                  Restore backup
                </button>
              ) : (
                <>
                  <button
                    onClick={() => confirm(false)}
                    className="w-full px-3 py-2.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
                  >
                    Add as new plan{parsed.plans.length === 1 ? '' : 's'}
                  </button>
                  <button
                    onClick={() => confirm(true)}
                    className="w-full px-3 py-2 rounded-md border border-danger/40 text-danger text-xs font-medium hover:bg-danger/5 transition-colors cursor-pointer"
                  >
                    Replace everything with these
                  </button>
                </>
              )}
              <button
                onClick={reset}
                className="w-full px-3 py-2 rounded-md border border-line text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
