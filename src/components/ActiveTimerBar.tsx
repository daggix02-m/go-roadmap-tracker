import React from 'react';
import { Pause, Play, Square, Maximize2, Timer } from 'lucide-react';
import { TimerState, formatCountdown, isRunning, remainingSeconds } from '../utils/timerEngine';

interface ActiveTimerBarProps {
  timer: TimerState;
  nowMs: number;
  phaseLabel: string;
  onOpenModal: () => void;
  onToggleRun: () => void;
  onStop: () => void;
}

/**
 * Compact strip pinned below the header while a focus or step timer is
 * active and the timer modal is closed. Keeps the countdown visible
 * anywhere in the app — the whole point of the background timer.
 *
 * Tapping the countdown display toggles pause/resume. A small expand
 * button opens the full timer modal.
 */
export const ActiveTimerBar: React.FC<ActiveTimerBarProps> = ({
  timer,
  nowMs,
  phaseLabel,
  onOpenModal,
  onToggleRun,
  onStop
}) => {
  const remaining = remainingSeconds(timer, nowMs);
  const running = isRunning(timer);
  const expired = remaining <= 0;
  const kindPrefix =
    timer.kind === 'step'
      ? `Step ${(timer.stepIdx ?? 0) + 1} · `
      : timer.variant === 'break'
        ? 'Break · '
        : 'Focus · ';

  return (
    <div className="bg-surface/95 backdrop-blur-md border-b border-line">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2">
        {/* Countdown display — tap to pause/resume */}
        <button
          onClick={expired ? undefined : onToggleRun}
          disabled={expired}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group disabled:cursor-default"
          aria-label={running ? 'Pause timer' : expired ? 'Timer finished' : 'Resume timer'}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            {running && !expired && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                expired ? 'bg-warning' : running ? 'bg-accent' : 'bg-muted'
              }`}
            />
          </span>

          <Timer className={`w-4 h-4 shrink-0 ${expired ? 'text-warning' : 'text-accent'}`} />

          <span
            className={`font-mono text-base tabular-nums tracking-tight ${
              expired ? 'text-warning' : 'text-text'
            }`}
          >
            {formatCountdown(remaining)}
          </span>

          <span className="text-xs text-muted truncate group-hover:text-text transition-colors">
            {expired
              ? timer.kind === 'step'
                ? "Time's up — tap to review"
                : 'Session finished — tap to review'
              : `${kindPrefix}${phaseLabel}`}
          </span>
        </button>

        {/* Expand — open the full timer modal */}
        <button
          onClick={onOpenModal}
          aria-label="Open timer details"
          className="min-h-9 min-w-9 flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer shrink-0"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onStop}
          aria-label="Stop timer"
          title={expired ? 'Dismiss' : 'Stop and reset'}
          className="min-h-9 min-w-9 flex items-center justify-center rounded-md text-faint hover:text-danger hover:bg-hover transition-colors cursor-pointer shrink-0"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
