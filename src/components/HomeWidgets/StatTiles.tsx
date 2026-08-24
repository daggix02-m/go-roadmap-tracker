import React from 'react';
import { CheckCircle2, Clock3, Flame, CalendarRange } from 'lucide-react';
import { getLocalDateString } from '../../utils/storage';
import { WidgetData, accentVar } from './shared';

function last7DaysMinutes(historyMinutes: Record<string, number>): number {
  const now = new Date();
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    sum += historyMinutes[getLocalDateString(d)] ?? 0;
  }
  return sum;
}

/**
 * Four compact stat tiles: streak, this week, total hours, phases done.
 */
export const StatTiles: React.FC<WidgetData> = ({
  historyMinutes,
  streak,
  totalStudyMinutes,
  completedPhases,
  totalPhases
}) => {
  const weekMin = last7DaysMinutes(historyMinutes);
  const totalH = Math.floor(totalStudyMinutes / 60);

  const tiles = [
    {
      icon: <Flame className="w-4 h-4" style={{ color: accentVar('warning') }} aria-hidden="true" />,
      label: 'Streak',
      value: `${streak}d`
    },
    {
      icon: <CalendarRange className="w-4 h-4 text-muted" aria-hidden="true" />,
      label: 'This week',
      value: `${Math.floor(weekMin / 60)}h ${weekMin % 60}m`
    },
    {
      icon: <Clock3 className="w-4 h-4 text-muted" aria-hidden="true" />,
      label: 'All time',
      value: `${totalH}h ${totalStudyMinutes % 60}m`
    },
    {
      icon: <CheckCircle2 className="w-4 h-4" style={{ color: accentVar('success') }} aria-hidden="true" />,
      label: 'Phases',
      value: `${completedPhases}/${totalPhases}`
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg bg-raised/60 border border-line px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-faint">
            {t.icon}
            <span className="text-[10px] font-mono uppercase tracking-wider">{t.label}</span>
          </div>
          <div className="mt-1.5 font-mono text-sm font-semibold text-text tabular-nums">{t.value}</div>
        </div>
      ))}
    </div>
  );
};
