import { AppData, Phase, Plan, PlanProgress } from '../../types';
import { emptyPlanProgress } from '../../utils/storage';
import { GO_PLAN } from './go';

export const BUILT_IN_PLANS: Plan[] = [GO_PLAN];

export const FALLBACK_PLAN: Plan = GO_PLAN;

/** All plans available to the user: built-ins first, then custom plans. */
export function getAllPlans(data: Pick<AppData, 'customPlans'>): Plan[] {
  return [...BUILT_IN_PLANS, ...data.customPlans.filter((p) => !p.deleted)];
}

export function findPlan(data: Pick<AppData, 'customPlans'>, planId: string): Plan | undefined {
  return getAllPlans(data).find((p) => p.id === planId);
}

/**
 * Deletes a custom plan by leaving a sync tombstone (`deleted: true`) in
 * place — mergePlans treats a tombstone as authoritative, so stale copies on
 * other devices or in the cloud can never resurrect the plan. Progress is
 * dropped and an active plan falls back to the first built-in. Returns null
 * when there is nothing to delete (built-ins are immutable source constants).
 */
export function deleteCustomPlan(
  data: AppData,
  planId: string,
  now: number = Date.now()
): AppData | null {
  const target = data.customPlans.find((p) => p.id === planId);
  if (!target || target.builtIn) return null;

  const nextProgress = { ...data.progressByPlan };
  delete nextProgress[planId];

  return {
    ...data,
    customPlans: data.customPlans.map((p) =>
      p.id === planId ? { ...p, deleted: true, lastModifiedAt: now } : p
    ),
    progressByPlan: nextProgress,
    activePlanId:
      data.activePlanId === planId ? BUILT_IN_PLANS[0].id : data.activePlanId,
    activePlanUpdatedAt:
      data.activePlanId === planId ? now : data.activePlanUpdatedAt
  };
}

/** Resolves the active plan, falling back to the built-in Go roadmap. */
export function getActivePlan(data: AppData): Plan {
  return findPlan(data, data.activePlanId) ?? FALLBACK_PLAN;
}

/** Progress for a plan — always returns a usable object, creating a default if missing. */
export function getPlanProgress(data: AppData, planId: string): PlanProgress {
  return data.progressByPlan[planId] ?? emptyPlanProgress();
}

/** Lowest-numbered incomplete phase; falls back to the last phase when everything is done. */
export function getActivePhase(plan: Plan, progress: PlanProgress): Phase {
  const next = plan.phases.find((p) => !progress.completedPhases.includes(p.id));
  return next ?? plan.phases[plan.phases.length - 1];
}

/** "Part A — Foundations" -> "Part A" for compact filter chips. */
export function shortenSectionTitle(title: string): string {
  const dash = title.indexOf('—');
  const short = dash > 0 ? title.slice(0, dash).trim() : title.trim();
  return short || title;
}
