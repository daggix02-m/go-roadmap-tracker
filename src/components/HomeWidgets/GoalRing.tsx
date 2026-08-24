import React from 'react';
import { Flame } from 'lucide-react';
import { getLocalDateString } from '../../utils/storage';
import { WidgetData, accentVar } from './shared';

const RADIUS = 52;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * Progress ring toward today's focus goal, with the streak underneath.
 */
export const GoalRing: React.FC<WidgetData> = ({ historyMinutes, dailyFocusGoal, streak }) => {
  const goal = dailyFocusGoal && dailyFocusGoal > 0 ? dailyFocusGoal : 60;
  const todayMin = historyMinutes[getLocalDateString()] ?? 0;
  const pct = Math.min(1, todayMin / goal);
  const reached = todayMin >= goal;

  return (
    <div className="flex items-center gap-5">
      <div className="relative w-[7.25rem] h-[7.25rem] shrink-0" role="img" aria-label={`${todayMin} of ${goal} daily goal minutes`}>
        <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
          <circle cx="64" cy="64" r={RADIUS} fill="none" stroke="var(--t-raised)" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke={accentVar(reached ? 'success' : 'accent')}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 500ms ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-semibold text-text leading-none">
            {todayMin}
            <span className="text-faint text-xs">/{goal}m</span>
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-faint mt-1">
            {reached ? 'Goal reached' : 'Today'}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Flame className="w-4 h-4 shrink-0" style={{ color: accentVar('warning') }} aria-hidden="true" />
          <span className="text-sm text-text">
            <span className="font-mono font-semibold">{streak}</span>
            <span className="text-muted">-day streak</span>
          </span>
        </div>
        {!dailyFocusGoal && (
          <p className="text-[11px] text-faint mt-2 leading-relaxed">
            Using a 60m default — set your own in Settings → Preferences.
          </p>
        )}
      </div>
    </div>
  );
};
