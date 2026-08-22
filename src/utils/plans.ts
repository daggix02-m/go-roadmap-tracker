import { Plan, PlanProgress } from '../types';

/** Short unique id for user-created/forked plans. */
export function generatePlanId(): string {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Deep-copies a plan under a new id, carrying progress so the user continues mid-journey. */
export function forkPlan(
  source: Plan,
  sourceProgress: PlanProgress,
  newId: string
): { plan: Plan; progress: PlanProgress } {
  const copy: Plan = JSON.parse(JSON.stringify(source));
  return {
    plan: {
      ...copy,
      id: newId,
      name: `${source.name} (fork)`,
      builtIn: false
    },
    progress: JSON.parse(JSON.stringify(sourceProgress))
  };
}

const ACCENTS = ['accent', 'success', 'warning', 'danger'] as const;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Validates untrusted plan JSON (imported files). Returns a normalized Plan
 * or null when the required structure is missing. Phase ids are reassigned
 * sequentially — imported plans always start with fresh progress, so ids
 * need no continuity with anything stored.
 */
export function validatePlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const rawPhases = Array.isArray(r.phases) ? r.phases : null;
  if (!name || !rawPhases) return null;

  // Sections: keep valid ones, ensure at least one so every phase has a home.
  let sections: { id: string; title: string }[] = Array.isArray(r.sections)
    ? r.sections
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({
          id: typeof s.id === 'string' ? s.id : '',
          title: typeof s.title === 'string' ? s.title : ''
        }))
        .filter((s) => s.id !== '' && s.title !== '')
    : [];
  if (sections.length === 0) {
    sections = [{ id: 'general', title: 'Phases' }];
  }
  const sectionIds = new Set(sections.map((s) => s.id));

  const phases = rawPhases
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p, index) => {
      const section =
        typeof p.section === 'string' && sectionIds.has(p.section) ? p.section : sections[0].id;
      const docLinks = Array.isArray(p.docLinks)
        ? p.docLinks.filter(
            (l): l is { title: string; url: string } =>
              !!l &&
              typeof l === 'object' &&
              typeof (l as Record<string, unknown>).title === 'string' &&
              typeof (l as Record<string, unknown>).url === 'string'
          )
        : undefined;

      return {
        id: index, // sequential — safe because imported plans start fresh
        section,
        title: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : `Phase ${index}`,
        shortTitle: typeof p.shortTitle === 'string' ? p.shortTitle : undefined,
        dense: typeof p.dense === 'boolean' ? p.dense : undefined,
        what: typeof p.what === 'string' ? p.what : undefined,
        estimatedHours: typeof p.estimatedHours === 'number' ? p.estimatedHours : undefined,
        concepts: asStringArray(p.concepts).length ? asStringArray(p.concepts) : undefined,
        docLinks: docLinks && docLinks.length ? docLinks : undefined,
        steps: asStringArray(p.steps),
        exit: asStringArray(p.exit),
        proTip: typeof p.proTip === 'string' ? p.proTip : undefined,
        codeSnippet: typeof p.codeSnippet === 'string' ? p.codeSnippet : undefined,
        codeLanguage: typeof p.codeLanguage === 'string' ? p.codeLanguage : undefined
      };
    });

  return {
    id: generatePlanId(), // never trust incoming ids — collisions with built-ins would shadow them
    name,
    emoji: typeof r.emoji === 'string' && r.emoji.trim() ? r.emoji.trim() : '📋',
    accent: ACCENTS.includes(r.accent as never) ? (r.accent as Plan['accent']) : 'accent',
    description: typeof r.description === 'string' ? r.description : undefined,
    method: typeof r.method === 'string' ? r.method : undefined,
    principle: Array.isArray(r.principle)
      ? r.principle
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
          .map((s) => ({ step: typeof s.step === 'string' ? s.step : '' }))
          .filter((s) => s.step !== '')
      : undefined,
    cheatsheetId: undefined, // built-in-only feature
    builtIn: false,
    sections,
    phases
  };
}

/** Downloads a shareable plan JSON file. */
export function exportPlanAsJSON(plan: Plan): void {
  const payload = {
    formatVersion: 1,
    type: 'plan',
    exportedAt: new Date().toISOString(),
    plan
  };
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  const slug = plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'plan';
  downloadAnchor.setAttribute('download', `${slug}.plan.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
