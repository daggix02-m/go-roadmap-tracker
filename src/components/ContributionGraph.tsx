import React from 'react';
import { getLocalDateString } from '../utils/storage';

/** How far back the graph reaches. */
const WEEKS = 26;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Intensity buckets in minutes -> CSS class. Index 0 = rest day. */
function levelClass(minutes: number): string {
  if (minutes <= 0) return 'bg-line/40';
  if (minutes < 30) return 'bg-accent/25';
  if (minutes < 60) return 'bg-accent/45';
  if (minutes < 120) return 'bg-accent/70';
  return 'bg-accent';
}

interface ContributionGraphProps {
  /** Minutes studied per local day ('YYYY-MM-DD'). */
  historyMinutes: Record<string, number>;
}

/**
 * GitHub-style study activity grid: one column per week, Mon-Sun rows.
 * Intensity reflects minutes studied that day.
 */
export const ContributionGraph: React.FC<ContributionGraphProps> = ({ historyMinutes }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build WEEKS columns ending with the current (partial) week, Mon-start rows.
  // Day after the last complete slot we render is "today".
  const days: Date[] = [];
  const end = new Date(today);
  // Pad to Saturday of the current week so the last column is complete.
  end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  const totalDays = WEEKS * 7;
  for (let i = totalDays - 1; i >= 0; i--) {
    days.push(new Date(end.getTime() - i * MS_PER_DAY));
  }

  const weeks: Date[][] = [];
  for (let w = 0; w < WEEKS; w++) weeks.push(days.slice(w * 7, w * 7 + 7));

  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, col) => {
    const m = week[0].getMonth();
    if (m !== lastMonth && week.some((d) => d <= today)) {
      monthLabels.push({ col, label: week[0].toLocaleString('en', { month: 'short' }) });
      lastMonth = m;
    }
  });

  const visibleMinutes = days.reduce(
    (sum, d) => sum + (d <= today ? historyMinutes[getLocalDateString(d)] ?? 0 : 0),
    0
  );
  const totalH = Math.floor(visibleMinutes / 60);
  const totalM = visibleMinutes % 60;

  return (
    <section aria-label="Study activity" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight text-text">Study activity</h2>
        <span className="font-mono text-[11px] text-faint">
          {totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`} · last {WEEKS} weeks
        </span>
      </div>

      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="min-w-max px-1">
          {/* Month labels */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
            {Array.from({ length: WEEKS }).map((_, col) => (
              <div key={col} className="text-[10px] font-mono text-faint h-4">
                {monthLabels.find((m) => m.col === col)?.label ?? ''}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {/* Weekday labels */}
            <div
              className="grid grid-rows-7 text-[10px] font-mono text-faint"
              style={{ gridAutoFlow: 'column' }}
              aria-hidden="true"
            >
              <span>Mon</span>
              <span />
              <span>Wed</span>
              <span />
              <span>Fri</span>
              <span />
              <span />
            </div>

            {/* Grid */}
            <div
              className="grid grid-rows-7 grid-flow-col gap-[3px]"
              style={{ gridAutoColumns: 'minmax(0, 1fr)', width: `calc(${WEEKS} * (12px + 3px))` }}
              role="img"
              aria-label={`Contribution grid for the last ${WEEKS} weeks`}
            >
              {days.map((d) => {
                const key = getLocalDateString(d);
                const future = d > today;
                const mins = future ? -1 : historyMinutes[key] ?? 0;
                return (
                  <div
                    key={key}
                    title={
                      future
                        ? undefined
                        : `${d.toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${
                            mins === 0 ? 'no study' : `${mins}m`
                          }`
                    }
                    className={`w-3 h-3 rounded-[3px] ${future ? 'bg-transparent' : levelClass(mins)}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1.5 mt-2 justify-end">
            <span className="text-[10px] font-mono text-faint mr-0.5">Less</span>
            {[0, 15, 45, 90, 150].map((m) => (
              <span key={m} className={`w-3 h-3 rounded-[3px] ${levelClass(m)}`} />
            ))}
            <span className="text-[10px] font-mono text-faint ml-0.5">More</span>
          </div>
        </div>
      </div>
    </section>
  );
};
