import React from 'react';
import { Search, X } from 'lucide-react';
import { FilterState, Plan, SectionFilter } from '../types';
import { shortenSectionTitle } from '../data/plans';

interface FilterBarProps {
  plan: Plan;
  filter: FilterState;
  onFilterChange: (newFilter: FilterState) => void;
  completedCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({ plan, filter, onFilterChange, completedCount }) => {
  const totalCount = plan.phases.length;
  const denseCount = plan.phases.filter((p) => p.dense).length;

  const sectionFilters: { key: SectionFilter; label: string; count: number }[] = [
    ...plan.sections
      .map((section) => ({
        key: `section:${section.id}` as SectionFilter,
        label: shortenSectionTitle(section.title),
        count: plan.phases.filter((p) => p.section === section.id).length
      }))
      .filter((f) => f.count > 0)
  ];

  const filters: { key: SectionFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All phases', count: totalCount },
    ...(denseCount > 0
      ? [{ key: 'DENSE' as SectionFilter, label: 'Dense', count: denseCount }]
      : []),
    ...sectionFilters,
    { key: 'INCOMPLETE', label: 'In progress', count: totalCount - completedCount },
    { key: 'COMPLETED', label: 'Completed', count: completedCount }
  ];

  return (
    <div className="px-4 pt-4 pb-1 max-w-3xl mx-auto flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-faint">
          <Search className="w-4 h-4" />
        </div>
        <input
          id="roadmap-search-input"
          type="text"
          inputMode="search"
          placeholder="Search phases, concepts, steps…"
          value={filter.searchQuery}
          onChange={(e) => onFilterChange({ ...filter, searchQuery: e.target.value })}
          className="w-full pl-9 pr-9 py-2 bg-surface border border-line rounded-md text-sm text-text placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
        />
        {filter.searchQuery && (
          <button
            onClick={() => onFilterChange({ ...filter, searchQuery: '' })}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-text cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div
        role="tablist"
        aria-label="Filter phases"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
      >
        {filters.map((f) => {
          const isActive = filter.section === f.key;
          return (
            <button
              key={f.key}
              id={`filter-pill-${f.key}`}
              onClick={() => onFilterChange({ ...filter, section: f.key })}
              aria-pressed={isActive}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md whitespace-nowrap text-xs font-medium transition-colors cursor-pointer select-none ${
                isActive
                  ? 'bg-text text-page'
                  : 'bg-surface text-muted hover:text-text hover:bg-hover border border-line'
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`font-mono text-[10px] ${isActive ? 'text-page/60' : 'text-faint'}`}
              >
                {f.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
