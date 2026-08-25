import React from 'react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { Phase } from '../types';
import {
  TimerState,
  formatCountdown,
  isRunning,
  remainingSeconds
} from '../utils/timerEngine';
import { useScrollLock } from '../utils/scrollLock';

interface StudyTimerModalProps {
  activePhase: Phase;
  /** Live focus timer owned by App; null = nothing selected yet. */
  timer: TimerState | null;
  nowMs: number;
  onSelectPreset: (durationSec: number, variant: 'study' | 'break') => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onClose: () => void;
}

const FOCUS_PRESETS: { sec: number; label: string }[] = [
  { sec: 15 * 60, label: '15m' },
  { sec: 60 * 60, label: '1h' },
  { sec: 90 * 60, label: '1h30m' },
  { sec: 120 * 60, label: '2h' },
  { sec: 150 * 60, label: '2h30m' },
  { sec: 180 * 60, label: '3h' }
];

const BREAK_PRESET = { sec: 15 * 60, label: '15m break' };

/**
 * Controlled view over the App-owned focus timer. All ticking lives in App
 * (single interval), so closing this modal never stops the countdown.
 */
export const StudyTimerModal: React.FC<StudyTimerModalProps> = ({
  activePhase,
  timer,
  nowMs,
  onSelectPreset,
  onStart,
  onPause,
  onReset,
  onClose
}) => {
  useScrollLock(true);
  const remaining = timer ? remainingSeconds(timer, nowMs) : 0;
  const running = timer ? isRunning(timer) : false;
  const variant = timer?.variant ?? 'study';
  const expired = !!timer && remaining <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Focus timer"
        className="w-full max-w-sm bg-surface border border-line rounded-xl p-5 sm:p-6 relative flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close timer"
          className="absolute top-3.5 right-3.5 p-1.5 text-muted hover:text-text rounded-md hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-semibold text-text">Focus timer</h2>
        <p className="text-xs text-muted mt-0.5 mb-5 max-w-[16rem] truncate">
          Phase {activePhase.id} · {activePhase.shortTitle ?? activePhase.title}
        </p>

        {/* Presets */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap justify-center">
          {FOCUS_PRESETS.map((p) => {
            const active = variant === 'study' && timer?.durationSec === p.sec;
            return (
              <button
                key={p.label}
                onClick={() => onSelectPreset(p.sec, 'study')}
                aria-pressed={active}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-accent text-page'
                    : 'border border-line text-muted hover:text-text hover:bg-hover'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mb-6">
          <button
            onClick={() => onSelectPreset(BREAK_PRESET.sec, 'break')}
            aria-pressed={variant === 'break'}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              variant === 'break'
                ? 'bg-success text-page'
                : 'border border-line text-muted hover:text-text hover:bg-hover'
            }`}
          >
            {BREAK_PRESET.label}
          </button>
        </div>

        {/* Time display — tap to pause/resume */}
        <button
          onClick={running ? onPause : expired ? undefined : onStart}
          disabled={expired}
          className="w-full aspect-square max-w-[13rem] rounded-full border border-line flex flex-col items-center justify-center mb-6 bg-page cursor-pointer transition-colors hover:border-accent/40 disabled:cursor-default"
          aria-label={running ? 'Pause timer' : expired ? 'Timer finished' : 'Resume timer'}
        >
          <span
            className={`font-mono text-5xl tracking-tight tabular-nums ${
              expired ? 'text-success' : running ? 'text-text' : 'text-text/80'
            }`}
          >
            {formatCountdown(remaining)}
          </span>
          <span className="mt-2 font-mono text-[11px] uppercase tracking-wider text-faint">
            {expired
              ? 'Done'
              : variant === 'study'
                ? running
                  ? 'Focusing'
                  : 'Paused'
                : running
                  ? 'On break'
                  : 'Break · paused'}
          </span>
        </button>

        {/* Controls */}
        <div className="flex items-center gap-2 w-full max-w-xs justify-center">
          <button
            onClick={running ? onPause : onStart}
            disabled={!timer || expired}
            title={expired ? 'Pick a preset to start again' : undefined}
            className={`flex-1 py-2.5 px-4 rounded-md font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              running
                ? 'border border-line text-text hover:bg-hover'
                : 'bg-text text-page hover:opacity-85'
            }`}
          >
            {running ? (
              <>
                <Pause className="w-4 h-4" /> Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Resume
              </>
            )}
          </button>

          <button
            onClick={onReset}
            aria-label="Reset timer"
            className="p-2.5 rounded-md border border-line text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-4 text-xs text-muted">
          Keeps counting with the app closed — completed time counts toward today's streak.
        </p>
      </div>
    </div>
  );
};
