import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Download,
  Plus,
  Trash2,
  X
} from 'lucide-react';
import { AccentColor, Phase, Plan } from '../types';
import { exportPlanAsJSON } from '../utils/plans';

interface PlanEditorModalProps {
  /** Plan being edited, or null when creating a new one. */
  plan: Plan | null;
  onClose: () => void;
  onSave: (plan: Plan) => void;
}

interface PhaseDraft {
  id: number;
  section: string;
  title: string;
  what: string;
  estimatedHours: string;
  concepts: string;
  steps: string;
  exit: string;
  proTip: string;
}

const ACCENT_OPTIONS: { value: AccentColor; label: string; swatch: string }[] = [
  { value: 'accent', label: 'Blue', swatch: 'bg-accent' },
  { value: 'success', label: 'Green', swatch: 'bg-success' },
  { value: 'warning', label: 'Amber', swatch: 'bg-warning' },
  { value: 'danger', label: 'Red', swatch: 'bg-danger' }
];

const inputClass =
  'w-full px-2.5 py-1.5 bg-page border border-line rounded-md text-sm text-text placeholder:text-faint focus:outline-none focus:border-accent transition-colors';
const labelClass = 'block font-mono text-[10px] uppercase tracking-wider text-faint mb-1';

function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function fromLines(lines: string[]): string {
  return lines.join('\n');
}

function draftPhase(p: Phase): PhaseDraft {
  return {
    id: p.id,
    section: p.section,
    title: p.title,
    what: p.what ?? '',
    estimatedHours: p.estimatedHours != null ? String(p.estimatedHours) : '',
    concepts: (p.concepts ?? []).join(', '),
    steps: fromLines(p.steps),
    exit: fromLines(p.exit),
    proTip: p.proTip ?? ''
  };
}

function blankPhase(id: number, section: string): PhaseDraft {
  return {
    id,
    section,
    title: `Phase ${id}`,
    what: '',
    estimatedHours: '',
    concepts: '',
    steps: '',
    exit: '',
    proTip: ''
  };
}

function commitPhase(d: PhaseDraft): Phase {
  const hours = parseFloat(d.estimatedHours);
  const concepts = d.concepts
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return {
    id: d.id,
    section: d.section,
    title: d.title.trim() || `Phase ${d.id}`,
    ...(d.what.trim() ? { what: d.what.trim() } : {}),
    ...(Number.isFinite(hours) ? { estimatedHours: hours } : {}),
    ...(concepts.length ? { concepts } : {}),
    steps: toLines(d.steps),
    exit: toLines(d.exit),
    ...(d.proTip.trim() ? { proTip: d.proTip.trim() } : {})
  };
}

export const PlanEditorModal: React.FC<PlanEditorModalProps> = ({ plan, onClose, onSave }) => {
  const isNew = plan === null;

  const [name, setName] = useState(plan?.name ?? '');
  const [emoji, setEmoji] = useState(plan?.emoji ?? '📋');
  const [accent, setAccent] = useState<AccentColor>(plan?.accent ?? 'accent');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [sections, setSections] = useState<{ id: string; title: string }[]>(
    plan?.sections?.length ? plan.sections.map((s) => ({ ...s })) : [{ id: 'general', title: 'Phases' }]
  );
  const [phaseDrafts, setPhaseDrafts] = useState<PhaseDraft[]>(
    plan?.phases?.length ? plan.phases.map(draftPhase) : []
  );
  const [openPhaseId, setOpenPhaseId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextPhaseId = useMemo(
    () => (phaseDrafts.length ? Math.max(...phaseDrafts.map((d) => d.id)) + 1 : 0),
    [phaseDrafts]
  );

  // --- mutations -----------------------------------------------------------

  const addSection = () => {
    setSections((prev) => [...prev, { id: `sec-${Date.now().toString(36)}`, title: '' }]);
  };

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const movePhase = (index: number, dir: -1 | 1) => {
    setPhaseDrafts((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addPhase = () => {
    const sectionId = sections[0]?.id ?? 'general';
    const fresh = blankPhase(nextPhaseId, sectionId);
    setPhaseDrafts((prev) => [...prev, fresh]);
    setOpenPhaseId(fresh.id);
  };

  const updatePhaseDraft = (id: number, patch: Partial<PhaseDraft>) => {
    setPhaseDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removePhase = (id: number) => {
    setPhaseDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  // --- save ----------------------------------------------------------------

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give your plan a name.');
      return;
    }
    const cleanSections = sections
      .map((s, i) => ({ id: s.id, title: s.title.trim() || `Section ${i + 1}` }));
    const fallbackSection = cleanSections[0]?.id ?? 'general';

    const phases = phaseDrafts.map((d) =>
      commitPhase({ ...d, section: cleanSections.some((s) => s.id === d.section) ? d.section : fallbackSection })
    );

    const saved: Plan = {
      ...(plan ?? {}),
      id: plan?.id ?? `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      emoji: emoji.trim() || '📋',
      accent,
      ...(description.trim() ? { description: description.trim() } : {}),
      cheatsheetId: undefined,
      builtIn: false,
      sections: cleanSections.length ? cleanSections : [{ id: 'general', title: 'Phases' }],
      phases
    };
    onSave(saved);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'Create plan' : 'Edit plan'}
        className="w-full max-w-lg bg-surface border border-line rounded-xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-line px-5 py-3.5 flex items-center justify-between gap-2 z-10">
          <h2 className="text-base font-semibold text-text">
            {isNew ? 'New plan' : 'Edit plan'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close editor"
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Plan details */}
          <section className="space-y-3">
            <div className="flex gap-2">
              <div className="w-16 shrink-0">
                <label className={labelClass} htmlFor="plan-emoji">Icon</label>
                <input
                  id="plan-emoji"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                  className={`${inputClass} text-center`}
                  aria-label="Plan emoji"
                />
              </div>
              <div className="flex-1">
                <label className={labelClass} htmlFor="plan-name">Plan name</label>
                <input
                  id="plan-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rust Basics, Marathon Prep"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <span className={labelClass}>Accent</span>
              <div className="flex items-center gap-1.5" role="group" aria-label="Accent color">
                {ACCENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAccent(opt.value)}
                    aria-pressed={accent === opt.value}
                    title={opt.label}
                    className={`w-7 h-7 rounded-md ${opt.swatch} transition-all cursor-pointer ${
                      accent === opt.value
                        ? 'ring-2 ring-offset-2 ring-offset-surface ring-text/60'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="plan-desc">Short description</label>
              <input
                id="plan-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Shown under the title in the header"
                className={inputClass}
              />
            </div>
          </section>

          {/* Sections */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-faint">Sections</h3>
              <button
                onClick={addSection}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-line text-[11px] font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {sections.map((section, i) => (
                <div key={section.id} className="flex items-center gap-1.5">
                  <input
                    value={section.title}
                    onChange={(e) =>
                      setSections((prev) =>
                        prev.map((s, idx) => (idx === i ? { ...s, title: e.target.value } : s))
                      )
                    }
                    placeholder={`Section ${i + 1}`}
                    className={inputClass}
                    aria-label={`Section ${i + 1} name`}
                  />
                  <button
                    onClick={() => removeSection(i)}
                    disabled={sections.length <= 1}
                    aria-label={`Remove section ${i + 1}`}
                    className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Phases */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-faint">
                Phases <span className="text-line-strong">({phaseDrafts.length})</span>
              </h3>
              <button
                onClick={addPhase}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-line text-[11px] font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add phase
              </button>
            </div>

            {phaseDrafts.length === 0 && (
              <p className="text-xs text-muted p-3 rounded-lg bg-raised border border-line">
                No phases yet. Add your first phase to start tracking progress.
              </p>
            )}

            <div className="space-y-1.5">
              {phaseDrafts.map((draft, index) => {
                const isOpen = openPhaseId === draft.id;
                return (
                  <div
                    key={draft.id}
                    className="rounded-lg border border-line bg-raised overflow-hidden"
                  >
                    {/* Row header */}
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <button
                        onClick={() => setOpenPhaseId(isOpen ? null : draft.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                        aria-expanded={isOpen}
                      >
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-faint shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-faint shrink-0" />
                        )}
                        <span className="font-mono text-[10px] text-faint shrink-0">
                          {String(draft.id).padStart(2, '0')}
                        </span>
                        <span className="text-xs font-medium text-text truncate">
                          {draft.title || `Phase ${draft.id}`}
                        </span>
                      </button>
                      <div className="flex items-center shrink-0">
                        <button
                          onClick={() => movePhase(index, -1)}
                          disabled={index === 0}
                          aria-label="Move up"
                          className="p-1 text-muted hover:text-text rounded transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => movePhase(index, 1)}
                          disabled={index === phaseDrafts.length - 1}
                          aria-label="Move down"
                          className="p-1 text-muted hover:text-text rounded transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removePhase(draft.id)}
                          aria-label="Delete phase"
                          className="p-1 text-muted hover:text-danger rounded transition-colors cursor-pointer ml-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Phase fields */}
                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-line">
                        <div className="grid grid-cols-[1fr_auto] gap-2 pt-2">
                          <div>
                            <label className={labelClass}>Title</label>
                            <input
                              value={draft.title}
                              onChange={(e) => updatePhaseDraft(draft.id, { title: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                          <div className="w-28">
                            <label className={labelClass}>Hours</label>
                            <input
                              value={draft.estimatedHours}
                              onChange={(e) =>
                                updatePhaseDraft(draft.id, { estimatedHours: e.target.value })
                              }
                              inputMode="decimal"
                              placeholder="—"
                              className={inputClass}
                            />
                          </div>
                        </div>

                        <div>
                          <label className={labelClass}>Section</label>
                          <select
                            value={
                              sections.some((s) => s.id === draft.section)
                                ? draft.section
                                : (sections[0]?.id ?? '')
                            }
                            onChange={(e) => updatePhaseDraft(draft.id, { section: e.target.value })}
                            className={`${inputClass} cursor-pointer`}
                          >
                            {sections.map((s, i) => (
                              <option key={s.id} value={s.id} className="bg-page">
                                {s.title || `Section ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={labelClass}>Description</label>
                          <textarea
                            value={draft.what}
                            onChange={(e) => updatePhaseDraft(draft.id, { what: e.target.value })}
                            rows={2}
                            placeholder="What this phase is about…"
                            className={`${inputClass} resize-y`}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Concepts (comma-separated)</label>
                          <input
                            value={draft.concepts}
                            onChange={(e) => updatePhaseDraft(draft.id, { concepts: e.target.value })}
                            placeholder="arrays, loops, errors"
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Steps (one per line)</label>
                          <textarea
                            value={draft.steps}
                            onChange={(e) => updatePhaseDraft(draft.id, { steps: e.target.value })}
                            rows={3}
                            placeholder={'First step\nSecond step'}
                            className={`${inputClass} resize-y font-mono text-xs`}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>
                            Exit criteria — one per line (empty = no gate)
                          </label>
                          <textarea
                            value={draft.exit}
                            onChange={(e) => updatePhaseDraft(draft.id, { exit: e.target.value })}
                            rows={3}
                            placeholder={'Can do X without docs\nBuilt Y end to end'}
                            className={`${inputClass} resize-y font-mono text-xs`}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Pro tip (optional)</label>
                          <input
                            value={draft.proTip}
                            onChange={(e) => updatePhaseDraft(draft.id, { proTip: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface border-t border-line px-5 py-3 flex items-center gap-2">
          {error && <p className="text-xs text-danger flex-1">{error}</p>}
          <span className="flex-1" />
          {!isNew && (
            <button
              onClick={() => plan && exportPlanAsJSON(plan)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line hover:border-line-strong hover:bg-hover text-muted hover:text-text text-xs font-medium transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-line text-muted hover:text-text hover:bg-hover text-xs font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-md bg-success text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
          >
            Save plan
          </button>
        </div>
      </div>
    </div>
  );
}
