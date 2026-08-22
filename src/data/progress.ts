import { UserState } from '../types';
import { ROADMAP_DATA } from './roadmapData';

export interface PartProgress {
  part: 'A' | 'B' | 'C' | 'D';
  name: string;
  completed: number;
  total: number;
  percent: number;
}

export interface ProgressSummary {
  totalPhases: number;
  completedPhases: number;
  overallPercent: number;
  totalSteps: number;
  checkedSteps: number;
  totalCriteria: number;
  checkedCriteria: number;
  parts: PartProgress[];
}

const PART_NAMES: Record<PartProgress['part'], string> = {
  A: 'Part A — Core Go Foundations',
  B: 'Part B — Build TaskFlow',
  C: 'Part C — Production Engineering',
  D: 'Part D — API & Advanced Backend'
};

export function getProgressSummary(state: UserState): ProgressSummary {
  const totalPhases = ROADMAP_DATA.length;
  const completedPhases = state.completedPhases.length;

  let totalSteps = 0;
  let totalCriteria = 0;
  for (const phase of ROADMAP_DATA) {
    totalSteps += phase.steps.length;
    totalCriteria += phase.exit.length;
  }

  const checkedSteps = Object.values(state.stepChecked).filter(Boolean).length;
  const checkedCriteria = Object.values(state.criteriaChecked).filter(Boolean).length;

  const parts = (['A', 'B', 'C', 'D'] as const).map((part): PartProgress => {
    const phases = ROADMAP_DATA.filter((p) => p.part === part);
    const completed = phases.filter((p) => state.completedPhases.includes(p.id)).length;
    return {
      part,
      name: PART_NAMES[part],
      completed,
      total: phases.length,
      percent: phases.length ? Math.round((completed / phases.length) * 100) : 0
    };
  });

  return {
    totalPhases,
    completedPhases,
    overallPercent: Math.round((completedPhases / totalPhases) * 100),
    totalSteps,
    checkedSteps,
    totalCriteria,
    checkedCriteria,
    parts
  };
}

/** Last N days of activity as [dateString, active] pairs, oldest first. */
export function getActivityHistory(state: UserState, days = 14): { date: string; active: boolean }[] {
  const result: { date: string; active: boolean }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    result.push({ date: dateStr, active: state.historyDates.includes(dateStr) });
  }
  return result;
}

export function formatStudyMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}
