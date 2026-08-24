import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check } from 'lucide-react';
import { HomeWidgetId } from '../../types';
import { WidgetData } from './shared';
import { ContributionGrid } from './ContributionGrid';
import { StreakCalendar } from './StreakCalendar';
import { WeeklyBars } from './WeeklyBars';
import { GoalRing } from './GoalRing';
import { StatTiles } from './StatTiles';

export const WIDGET_META: Record<HomeWidgetId, { label: string; blurb: string }> = {
  contribution: { label: 'Activity grid', blurb: 'GitHub-style 26-week heatmap' },
  calendar: { label: 'Streak calendar', blurb: 'This month at a glance' },
  bars: { label: 'Daily minutes', blurb: 'Last 4 weeks vs your goal' },
  ring: { label: 'Goal ring', blurb: "Today's progress toward target" },
  tiles: { label: 'Stat tiles', blurb: 'Streak, week, all-time, phases' }
};

export const WIDGET_ORDER: HomeWidgetId[] = ['contribution', 'calendar', 'bars', 'ring', 'tiles'];

interface HomeWidgetCardProps {
  widget: HomeWidgetId;
  data: WidgetData;
  onChangeWidget: (id: HomeWidgetId) => void;
}

/**
 * The home-page activity card. Renders the selected widget and carries the
 * swap control so users can discover alternatives in place.
 */
export const HomeWidgetCard: React.FC<HomeWidgetCardProps> = ({ widget, data, onChangeWidget }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const Body =
    widget === 'calendar'
      ? StreakCalendar
      : widget === 'bars'
        ? WeeklyBars
        : widget === 'ring'
          ? GoalRing
          : widget === 'tiles'
            ? StatTiles
            : ContributionGrid;

  return (
    <section
      aria-label="Study activity"
      className="home-widget-slot rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight text-text">
          {WIDGET_META[widget].label}
        </h2>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Change activity widget"
            aria-expanded={menuOpen}
            title="Change this widget"
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-mono text-faint hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">swap</span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Widget options"
              className="absolute right-0 top-full mt-1 z-40 w-60 bg-raised border border-line rounded-lg shadow-lg py-1 animate-fade-in"
            >
              {WIDGET_ORDER.map((id) => (
                <button
                  key={id}
                  role="menuitemradio"
                  aria-checked={id === widget}
                  onClick={() => {
                    onChangeWidget(id);
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-left cursor-pointer transition-colors ${
                    id === widget ? 'bg-hover' : 'hover:bg-hover'
                  }`}
                >
                  <span className="mt-0.5 w-3.5 shrink-0">
                    {id === widget && <Check className="w-3.5 h-3.5 text-accent" />}
                  </span>
                  <span>
                    <span className="block text-xs font-medium text-text">{WIDGET_META[id].label}</span>
                    <span className="block text-[11px] text-muted">{WIDGET_META[id].blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Body {...data} />
    </section>
  );
};
