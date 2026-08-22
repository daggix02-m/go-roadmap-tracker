import { GlobalActivity, Plan, PlanProgress } from '../types';

export interface PartProgress {
  id: string;
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

export function getProgressSummary(plan: Plan, progress: PlanProgress): ProgressSummary {
  const totalPhases = plan.phases.length;
  const completedPhases = progress.completedPhases.length;

  let totalSteps = 0;
  let totalCriteria = 0;
  for (const phase of plan.phases) {
    totalSteps += phase.steps.length;
    totalCriteria += phase.exit.length;
  }

  const checkedSteps = Object.values(progress.stepChecked).filter(Boolean).length;
  const checkedCriteria = Object.values(progress.criteriaChecked).filter(Boolean).length;

  // Sections that have no phases are omitted so empty custom plans stay clean.
  const parts = plan.sections
    .map((section): PartProgress => {
      const phases = plan.phases.filter((p) => p.section === section.id);
      const completed = phases.filter((p) => progress.completedPhases.includes(p.id)).length;
      return {
        id: section.id,
        name: section.title,
        completed,
        total: phases.length,
        percent: phases.length ? Math.round((completed / phases.length) * 100) : 0
      };
    })
    .filter((part) => part.total > 0);

  return {
    totalPhases,
    completedPhases,
    overallPercent: totalPhases ? Math.round((completedPhases / totalPhases) * 100) : 0,
    totalSteps,
    checkedSteps,
    totalCriteria,
    checkedCriteria,
    parts
  };
}

/** Last N days of activity as [dateString, active] pairs, oldest first. */
export function getActivityHistory(
  global: GlobalActivity,
  days = 14
): { date: string; active: boolean }[] {
  const result: { date: string; active: boolean }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    result.push({ date: dateStr, active: global.historyDates.includes(dateStr) });
  }
  return result;
}

export function formatStudyMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}
