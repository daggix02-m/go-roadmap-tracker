import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  Lightbulb,
  Pause,
  Play,
  RotateCcw
} from 'lucide-react';
import { Phase, PlanProgress } from '../types';
import {
  STEP_DURATION_PRESETS,
  STEP_TIMER_DEFAULT_SEC,
  TimerState,
  formatCountdown,
  isRunning,
  remainingSeconds
} from '../utils/timerEngine';

/** Everything PhaseCard needs to render and control the single active step timer. */
export interface StepTimerApi {
  /** The one app-level step timer (null = none). */
  timer: TimerState | null;
  /** Persisted per-step duration overrides from plan progress. */
  durations: Record<string, number>;
  /** key -> 'YYYY-MM-DD' the step was marked done via its countdown. */
  doneDay: Record<string, string>;
  today: string;
  start: (phaseId: number, stepIdx: number) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  setDuration: (phaseId: number, stepIdx: number, sec: number) => void;
  markDoneToday: (phaseId: number, stepIdx: number) => void;
}

interface PhaseCardProps {
  phase: Phase;
  progress: PlanProgress;
  isOpen: boolean;
  isActive: boolean;
  stepTimerApi?: StepTimerApi;
  /** Live epoch-ms clock. Only the card owning the running step timer needs this to tick. */
  nowMs: number;
  onToggleOpen: () => void;
  onToggleStep: (phaseId: number, stepIndex: number) => void;
  onToggleCriteria: (phaseId: number, criteriaIndex: number) => void;
  onCompletePhase: (phaseId: number) => void;
  onSaveNote: (phaseId: number, note: string) => void;
  onSelectConcept: (concept: string) => void;
}

const sectionLabelClass =
  'text-[11px] font-medium uppercase tracking-wider text-faint mb-2 font-mono';

export const PhaseCard: React.FC<PhaseCardProps> = React.memo(function PhaseCard({
  phase,
  progress,
  isOpen,
  isActive,
  stepTimerApi,
  nowMs,
  onToggleOpen,
  onToggleStep,
  onToggleCriteria,
  onCompletePhase,
  onSaveNote,
  onSelectConcept
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [noteContent, setNoteContent] = useState(progress.userNotes[phase.id] || '');
  const [showGateWarning, setShowGateWarning] = useState(false);
  /** key of the step whose duration-preset menu is open (null = closed). */
  const [openDurationKey, setOpenDurationKey] = useState<string | null>(null);

  const isCompleted = progress.completedPhases.includes(phase.id);

  const totalSteps = phase.steps.length;
  const checkedStepsCount = phase.steps.filter((_, idx) =>
    Boolean(progress.stepChecked[`${phase.id}_${idx}`])
  ).length;

  const exitCriteriaCount = phase.exit.length;
  const checkedCriteriaCount = phase.exit.filter((_, idx) =>
    Boolean(progress.criteriaChecked[`${phase.id}_${idx}`])
  ).length;
  // Phases without exit criteria are completable immediately.
  const allExitMet = exitCriteriaCount === 0 || checkedCriteriaCount === exitCriteriaCount;

  const handleCopyCode = () => {
    if (!phase.codeSnippet) return;
    navigator.clipboard.writeText(phase.codeSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCompleteClick = () => {
    if (isCompleted || allExitMet) {
      onCompletePhase(phase.id);
      return;
    }
    setShowGateWarning(true);
    setTimeout(() => setShowGateWarning(false), 4000);
  };

  return (
    <article
      id={`phase-card-${phase.id}`}
      aria-expanded={isOpen}
      className={`rounded-lg border transition-colors ${
        isCompleted
          ? 'bg-surface border-line'
          : isActive
            ? 'bg-surface border-accent/50'
            : 'bg-surface border-line hover:border-line-strong'
      }`}
    >
      {/* Card header */}
      <button
        onClick={onToggleOpen}
        className="w-full p-4 flex items-start justify-between gap-3 text-left cursor-pointer select-none"
        aria-controls={`phase-body-${phase.id}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          {/* Number / status */}
          <div className="shrink-0 mt-0.5">
            {isCompleted ? (
              <div className="w-7 h-7 rounded-md bg-success/15 text-success flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            ) : (
              <div
                className={`h-7 min-w-7 px-1 rounded-md flex items-center justify-center font-mono text-xs ${
                  isActive
                    ? 'bg-accent text-page'
                    : 'border border-line text-muted'
                }`}
              >
                {String(phase.id).padStart(2, '0')}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="font-mono uppercase tracking-wide text-muted">
                Part {phase.section}
              </span>
              {phase.estimatedHours ? (
                <>
                  <span aria-hidden className="text-line-strong">·</span>
                  <span className="text-faint">~{phase.estimatedHours}h</span>
                </>
              ) : null}
              {isActive && (
                <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
                  Up next
                </span>
              )}
              {phase.dense && (
                <span
                  className="px-1.5 py-0.5 rounded bg-danger/10 text-danger font-medium"
                  title="Denser phase — budget extra time"
                >
                  Dense
                </span>
              )}
            </div>
            <h3
              className={`mt-1 text-sm sm:text-[15px] font-semibold leading-snug tracking-tight ${
                isCompleted ? 'text-muted line-through decoration-line' : 'text-text'
              }`}
            >
              {phase.title}
            </h3>
            {phase.shortTitle && (
              <p className="mt-0.5 text-xs text-muted truncate">{phase.shortTitle}</p>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {!isOpen && exitCriteriaCount > 0 && (
            <span className="hidden sm:inline font-mono text-[11px] text-faint">
              {checkedCriteriaCount}/{exitCriteriaCount} exit
            </span>
          )}
          <span className="text-faint">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {/* Expanded body */}
      {isOpen && (
        <div id={`phase-body-${phase.id}`} className="px-4 pb-4 border-t border-line">
          {/* What you'll build */}
          {phase.what && (
            <div className="pt-4">
              <h4 className={sectionLabelClass}>What you'll build</h4>
              <p className="text-sm text-text/90 leading-relaxed">{phase.what}</p>
            </div>
          )}

          {/* Concepts */}
          {phase.concepts && phase.concepts.length > 0 && (
            <div className="mt-4">
              <h4 className={sectionLabelClass}>Concepts</h4>
              <div className="flex flex-wrap gap-1.5">
                {phase.concepts.map((c) => (
                  <button
                    key={c}
                    onClick={() => onSelectConcept(c)}
                    title={`Search for "${c}"`}
                    className="px-2.5 py-1.5 rounded-md border border-line bg-raised text-muted hover:text-text hover:border-line-strong font-mono text-xs transition-colors cursor-pointer"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          {totalSteps > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <h4 className={`${sectionLabelClass} mb-0`}>Steps</h4>
                <span className="font-mono text-[11px] text-faint">
                  {checkedStepsCount}/{totalSteps}
                </span>
              </div>
              <ul className="space-y-1">
                {phase.steps.map((step, idx) => {
                  const key = `${phase.id}_${idx}`;
                  const isDone = Boolean(progress.stepChecked[key]);
                  const doneToday = stepTimerApi ? stepTimerApi.doneDay[key] === stepTimerApi.today : false;
                  const crossedOff = isDone || doneToday;

                  const ownTimer =
                    stepTimerApi?.timer &&
                    stepTimerApi.timer.phaseId === phase.id &&
                    stepTimerApi.timer.stepIdx === idx
                      ? stepTimerApi.timer
                      : null;
                  const ownRemaining = ownTimer ? remainingSeconds(ownTimer, nowMs) : 0;
                  const ownExpired = !!ownTimer && ownRemaining <= 0;
                  const effectiveDuration = stepTimerApi?.durations[key] ?? STEP_TIMER_DEFAULT_SEC;

                  return (
                    <li key={idx}>
                      <div className="flex items-start gap-3 p-2 -mx-2 rounded-md hover:bg-hover transition-colors select-none">
                        <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => onToggleStep(phase.id, idx)}
                            className="mt-0.5 w-4 h-4 rounded cursor-pointer shrink-0"
                          />
                          <span
                            className={`text-sm leading-relaxed ${
                              crossedOff ? 'text-faint line-through' : 'text-text/90'
                            }`}
                          >
                            <span className="font-mono text-faint mr-1.5 select-none">{idx + 1}.</span>
                            {step}
                          </span>
                          {doneToday && !isDone && (
                            <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-success/10 text-success font-mono text-[10px]">
                              done today
                            </span>
                          )}
                        </label>

                        {/* Countdown chip */}
                        {stepTimerApi && !crossedOff && (
                          <div className="relative shrink-0 mt-0.5 flex items-center">
                            {ownTimer ? (
                              ownExpired ? null : ( // expired state renders the prompt below instead
                                <>
                                  <span
                                    className={`font-mono text-xs tabular-nums mr-1 ${
                                      isRunning(ownTimer)
                                        ? 'text-accent'
                                        : 'text-muted'
                                    }`}
                                  >
                                    {formatCountdown(ownRemaining)}
                                  </span>
                                  <button
                                    onClick={isRunning(ownTimer) ? stepTimerApi.pause : stepTimerApi.resume}
                                    aria-label={isRunning(ownTimer) ? 'Pause step timer' : 'Resume step timer'}
                                    className="min-h-9 min-w-9 flex items-center justify-center rounded text-muted hover:text-text hover:bg-raised transition-colors cursor-pointer"
                                  >
                                    {isRunning(ownTimer) ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                  </button>
                                </>
                              )
                            ) : (
                              <>
                                <button
                                  onClick={() => stepTimerApi.start(phase.id, idx)}
                                  title={`Start ${formatCountdown(effectiveDuration)} countdown`}
                                  aria-label={`Start ${formatCountdown(effectiveDuration)} countdown for this step`}
                                  className="flex items-center gap-1 px-2 py-1.5 rounded border border-line font-mono text-[11px] text-faint hover:text-accent hover:border-accent/40 transition-colors cursor-pointer"
                                >
                                  <Play className="w-3 h-3" />
                                  {formatCountdown(effectiveDuration).replace(/:00$/, '')}
                                </button>
                                <button
                                  onClick={() =>
                                    setOpenDurationKey(openDurationKey === key ? null : key)
                                  }
                                  aria-label="Change step duration"
                                  aria-expanded={openDurationKey === key}
                                  aria-haspopup="listbox"
                                  className="min-h-9 min-w-9 flex items-center justify-center rounded text-faint hover:text-text transition-colors cursor-pointer"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                                {openDurationKey === key && (
                                  <div
                                    role="listbox"
                                    aria-label="Step duration presets"
                                    className="absolute right-0 top-full mt-1 z-10 py-1 rounded-md bg-surface border border-line shadow-lg grid grid-cols-3 gap-px w-36"
                                  >
                                    {STEP_DURATION_PRESETS.map((preset) => (
                                      <button
                                        key={preset.sec}
                                        role="option"
                                        aria-selected={effectiveDuration === preset.sec}
                                        onClick={() => {
                                          stepTimerApi.setDuration(phase.id, idx, preset.sec);
                                          setOpenDurationKey(null);
                                        }}
                                        className={`px-2 py-1.5 font-mono text-[11px] transition-colors cursor-pointer ${
                                          effectiveDuration === preset.sec
                                            ? 'bg-accent/15 text-accent'
                                            : 'text-muted hover:text-text hover:bg-hover'
                                        }`}
                                      >
                                        {preset.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Timer expiry prompt */}
                      {ownExpired && stepTimerApi && (
                        <div className="ml-7 mb-1 p-2.5 rounded-md border border-warning/40 bg-warning/5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <CircleAlert className="w-4 h-4 text-warning shrink-0" />
                          <span className="text-xs text-text">
                            Time's up ({formatCountdown(effectiveDuration)}) — did you finish this step?
                          </span>
                          <span className="flex-1" />
                          <button
                            onClick={() => stepTimerApi.markDoneToday(phase.id, idx)}
                            className="px-3 py-2 rounded-md bg-success text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
                          >
                            Yes, mark done
                          </button>
                          <button
                            onClick={() => stepTimerApi.start(phase.id, idx)}
                            title="Restart the countdown for this step"
                            className="min-h-10 min-w-10 flex items-center justify-center rounded-md border border-line text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
                            aria-label="Restart countdown"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={stepTimerApi.cancel}
                            className="px-3 py-2 rounded-md border border-line text-muted hover:text-text hover:bg-hover text-xs font-medium transition-colors cursor-pointer"
                          >
                            Not yet
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Exit criteria — hard gate */}
          {exitCriteriaCount > 0 && (
            <div
              className={`mt-5 p-3.5 rounded-lg border ${
                allExitMet ? 'border-success/40 bg-success/5' : 'border-line bg-raised'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h4 className={`${sectionLabelClass} mb-0`}>Exit criteria</h4>
                <span
                  className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                    allExitMet
                      ? 'text-success bg-success/10'
                      : 'text-warning bg-warning/10'
                  }`}
                >
                  {allExitMet ? `all ${exitCriteriaCount} met` : `${checkedCriteriaCount}/${exitCriteriaCount}`}
                </span>
              </div>
              <p className="text-xs text-muted mb-2.5">
                Hard gate — don't move on until every box is true.
              </p>
              <ul className="space-y-1">
                {phase.exit.map((criteria, idx) => {
                  const isChecked = Boolean(progress.criteriaChecked[`${phase.id}_${idx}`]);
                  return (
                    <li key={idx}>
                      <label className="flex items-start gap-3 p-2 -mx-2 rounded-md cursor-pointer hover:bg-hover transition-colors select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleCriteria(phase.id, idx)}
                          className="mt-0.5 w-4 h-4 rounded cursor-pointer shrink-0"
                        />
                        <span
                          className={`text-sm leading-relaxed ${
                            isChecked ? 'text-faint line-through' : 'text-text/90'
                          }`}
                        >
                          {criteria}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Pro tip */}
          {phase.proTip && (
            <div className="mt-4 flex items-start gap-2.5 text-sm text-muted leading-relaxed">
              <Lightbulb className="w-4 h-4 mt-0.5 text-accent shrink-0" />
              <p>{phase.proTip}</p>
            </div>
          )}

          {/* Code snippet */}
          {phase.codeSnippet && (
            <div className="mt-4 rounded-lg border border-line overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-raised border-b border-line">
                <span className="font-mono text-[11px] text-muted">{phase.codeLanguage || 'Code'}</span>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer font-mono"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3 h-3 text-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 overflow-x-auto bg-page text-xs font-mono text-text/90 leading-relaxed">
                <code>{phase.codeSnippet}</code>
              </pre>
            </div>
          )}

          {/* Notes */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className={`${sectionLabelClass} mb-0`}>Notes</h4>
              <span className="text-[11px] text-faint">Saved automatically</span>
            </div>
            <label htmlFor={`notes-textarea-${phase.id}`} className="sr-only">
              Notes for phase {phase.id}
            </label>
            <textarea
              id={`notes-textarea-${phase.id}`}
              placeholder="Observations, benchmark numbers, snippets…"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onBlur={() => onSaveNote(phase.id, noteContent)}
              rows={2}
              className="w-full p-2.5 bg-page border border-line rounded-md text-sm text-text placeholder:text-faint focus:outline-none focus:border-accent transition-colors resize-y font-mono"
            />
          </div>

          {/* Gate warning */}
          {showGateWarning && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-md border border-danger/40 bg-danger/10 text-sm text-danger flex items-start gap-2"
            >
              <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Mark all {exitCriteriaCount} exit criteria as met before completing this phase.</span>
            </div>
          )}

          {/* Complete button */}
          <button
            id={`complete-phase-btn-${phase.id}`}
            onClick={handleCompleteClick}
            disabled={!isCompleted && !allExitMet}
            className={`mt-4 w-full py-2.5 px-4 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              isCompleted
                ? 'bg-surface border border-line text-muted hover:text-danger hover:border-danger/50'
                : allExitMet
                  ? 'bg-success text-page hover:brightness-110'
                  : 'bg-raised border border-line text-faint cursor-not-allowed'
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Completed — click to undo
              </>
            ) : allExitMet ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Mark phase {phase.id} complete
              </>
            ) : (
              <>Complete all exit criteria to finish ({checkedCriteriaCount}/{exitCriteriaCount})</>
            )}
          </button>
        </div>
      )}
    </article>
  );
});
