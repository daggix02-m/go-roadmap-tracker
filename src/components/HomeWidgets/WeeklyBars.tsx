import React from 'react';
import { getLocalDateString } from '../../utils/storage';
import { WidgetData, accentVar } from './shared';

const DAYS = 28;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily minutes for the last four weeks as quiet vertical bars, with a dashed
 * line marking the daily goal.
 */
export const WeeklyBars: React.FC<WidgetData> = ({ historyMinutes, dailyFocusGoal }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: Date[] = Array.from({ length: DAYS }, (_, i) =>
    new Date(today.getTime() - (DAYS - 1 - i) * MS_PER_DAY)
  );
  const mins = days.map((d) => historyMinutes[getLocalDateString(d)] ?? 0);
  const goal = dailyFocusGoal && dailyFocusGoal > 0 ? dailyFocusGoal : 60;
  const scale = Math.max(goal * 1.25, ...mins, 30);

  const weekTicks = [0, 7, 14, 21].map((offset) => ({
    offset,
    label: days[offset].toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }));

  return (
    <div>
      <div className="relative h-24 flex items-end gap-[3px]" role="img" aria-label={`Daily study minutes, last ${DAYS} days`}>
        {/* Goal line */}
        <div
          className="absolute inset-x-0 border-t border-dashed pointer-events-none"
          style={{ bottom: `${(goal / scale) * 100}%`, borderColor: accentVar('accent') }}
          title={`Daily goal — ${goal}m`}
        />
        {mins.map((m, i) => (
          <div key={i} className="flex-1 h-full flex items-end" title={`${days[i].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${m}m`}>
            <div
              className="w-full rounded-t-[2px] transition-[height] duration-300"
              style={{
                height: `${Math.max(m > 0 ? 4 : 1.5, (m / scale) * 100)}%`,
                backgroundColor:
                  m >= goal ? accentVar('accent') : m > 0 ? accentVar('accent') : 'var(--t-line)'
              }}
            />
          </div>
        ))}
      </div>

      <div className="relative h-4 mt-1.5">
        {weekTicks.map((t) => (
          <span
            key={t.offset}
            className="absolute text-[10px] font-mono text-faint"
            style={{ left: `${(t.offset / DAYS) * 100}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      <p className="text-[11px] text-faint mt-1.5">
        Dashed line — your <span className="font-mono">{goal}m</span> daily goal
      </p>
    </div>
  );
};
