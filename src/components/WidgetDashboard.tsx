import React from 'react';
import { ArrowUpRight, Flame, Timer } from 'lucide-react';
import { AccentColor, Phase } from '../types';
import { formatStudyMinutes, ProgressSummary } from '../data/progress';

interface WidgetDashboardProps {
  accent: AccentColor;
  progress: ProgressSummary;
  streak: number;
  activePhase: Phase | null;
  totalStudyMinutes: number;
  onJumpToActive: () => void;
}

const RING_TEXT_CLASS: Record<AccentColor, string> = {
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger'
};

const RING_SIZE = 64;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const WidgetDashboard: React.FC<WidgetDashboardProps> = ({
  accent,
  progress,
  streak,
  activePhase,
  totalStudyMinutes,
  onJumpToActive
}) => {
  const ringColorClass = RING_TEXT_CLASS[accent];
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress.overallPercent / 100);
  const isComplete =
    progress.totalPhases > 0 && progress.completedPhases >= progress.totalPhases;

  return (
    <section aria-label="Progress overview" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {/* Progress ring */}
      <div className="p-3 rounded-lg bg-raised border border-line flex items-center gap-3 sm:flex-col sm:items-center sm:justify-center sm:text-center">
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          role="img"
          aria-label={`${progress.overallPercent}% complete`}
          className={ringColorClass}
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            className="stroke-line"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            className="transition-all duration-500 ease-out"
          />
          <text
            x="50%"
            y="52%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-current font-mono"
            style={{ fontSize: 15 }}
          >
            {progress.overallPercent}
          </text>
        </svg>
        <div className="min-w-0 sm:mt-1">
          <div className="font-mono text-xs text-text">
            {progress.completedPhases}/{progress.totalPhases}
          </div>
          <div className="text-[10px] text-muted">phases done</div>
        </div>
      </div>

      {/* Streak */}
      <div className="p-3 rounded-lg bg-raised border border-line flex flex-col justify-center">
        <div className="flex items-center gap-1.5 text-warning">
          <Flame className="w-4 h-4" />
          <span className="font-mono text-xl leading-none">{streak}</span>
        </div>
        <div className="text-[10px] text-muted mt-1.5">day streak</div>
      </div>

      {/* Study time */}
      <div className="p-3 rounded-lg bg-raised border border-line flex flex-col justify-center">
        <div className="flex items-center gap-1.5 text-text">
          <Timer className="w-4 h-4 text-muted" />
          <span className="font-mono text-base leading-none truncate">
            {formatStudyMinutes(totalStudyMinutes)}
          </span>
        </div>
        <div className="text-[10px] text-muted mt-1.5">focus time</div>
      </div>

      {/* Next up — spans two columns */}
      <button
        onClick={onJumpToActive}
        disabled={!activePhase || isComplete}
        className="col-span-2 p-3 rounded-lg bg-raised border border-line text-left transition-colors cursor-pointer hover:border-line-strong disabled:cursor-default group"
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint shrink-0">
            {isComplete ? 'All done' : 'Up next'}
          </span>
          {!isComplete && (
            <ArrowUpRight className="w-3.5 h-3.5 text-faint group-hover:text-accent transition-colors shrink-0" />
          )}
        </div>
        <div className="mt-1 text-xs sm:text-sm font-medium text-text truncate">
          {activePhase && !isComplete
            ? `${String(activePhase.id).padStart(2, '0')} · ${activePhase.shortTitle ?? activePhase.title}`
            : 'Plan complete 🎉'}
        </div>
      </button>
    </section>
  );
};
