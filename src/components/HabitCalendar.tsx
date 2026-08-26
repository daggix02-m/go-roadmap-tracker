import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HabitCompletions, HabitDayStatus, CalendarDay } from '../types';
import { getCalendarDays, getDayStatus } from '../utils/habits';

interface HabitCalendarProps {
  completions: HabitCompletions;
  onSelectDate?: (date: string) => void;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Monthly calendar showing habit completion status for each day.
 * Color-coded: green for completed, red for missed, gray for future.
 */
export const HabitCalendar: React.FC<HabitCalendarProps> = ({
  completions,
  onSelectDate,
}) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const days = useMemo(
    () => getCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const daysWithStatus = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        status: getDayStatus(completions, day.date),
      })),
    [days, completions]
  );

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  const getStatusColor = (status: HabitDayStatus): string => {
    switch (status) {
      case 'completed':
        return 'bg-success text-white';
      case 'missed':
        return 'bg-danger/80 text-white';
      case 'today':
        return 'bg-accent text-white ring-2 ring-accent/40';
      case 'future':
        return 'bg-raised text-faint';
      default:
        return 'bg-raised text-faint';
    }
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-text">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
          <button
            onClick={goToToday}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-raised text-faint hover:text-text transition-colors cursor-pointer"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            className="p-1 rounded hover:bg-hover transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-faint" />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-1 rounded hover:bg-hover transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-faint" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-center text-[10px] font-mono text-faint py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {daysWithStatus.map((day) => (
          <button
            key={day.date}
            onClick={() => onSelectDate?.(day.date)}
            className={`
              aspect-square rounded-md flex items-center justify-center text-xs font-medium
              transition-colors cursor-pointer
              ${day.isCurrentMonth ? getStatusColor(day.status) : 'bg-transparent text-faint/30'}
              ${day.isToday ? 'ring-2 ring-accent/40' : ''}
              hover:opacity-80
            `}
            aria-label={`${day.date}: ${day.status}`}
          >
            {new Date(day.date).getDate()}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-faint">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-success" />
          <span>Done</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-danger/80" />
          <span>Missed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
          <span>Today</span>
        </div>
      </div>
    </div>
  );
};
