import React from 'react';
import { Flame } from 'lucide-react';
import { getLocalDateString } from '../../utils/storage';
import { WidgetData, levelClass, accentVar } from './shared';

/**
 * Current-month streak calendar: one cell per day colored by study minutes,
 * today outlined, and the live streak count beside a flame.
 */
export const StreakCalendar: React.FC<WidgetData> = ({ historyMinutes, streak }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Month matrix, Monday-first.
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, (): Date | null => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i): Date => new Date(today.getFullYear(), today.getMonth(), i + 1)
    )
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 max-w-[19rem]" role="img" aria-label="This month's study calendar">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-[10px] font-mono text-faint text-center pb-1" aria-hidden="true">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`pad-${i}`} />;
          const key = getLocalDateString(d);
          const mins = d > today ? -1 : historyMinutes[key] ?? 0;
          const isToday = d.getTime() === today.getTime();
          return (
            <div
              key={key}
              title={`${d.toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${
                mins <= 0 ? 'no study' : `${mins}m`
              }`}
              className={`aspect-square rounded-[5px] ${
                mins < 0 ? 'bg-transparent' : mins === 0 ? 'bg-raised' : levelClass(mins)
              } ${isToday ? 'ring-2 ring-offset-1 ring-offset-[var(--t-surface)]' : ''}`}
              style={isToday ? ({ '--tw-ring-color': accentVar('accent') } as React.CSSProperties) : undefined}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-line">
        <Flame className="w-3.5 h-3.5" style={{ color: accentVar('warning') }} aria-hidden="true" />
        <span className="text-xs text-muted">
          <span className="font-mono text-text">{streak}</span>-day streak
        </span>
      </div>
    </div>
  );
};
