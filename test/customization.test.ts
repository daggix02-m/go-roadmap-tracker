/**
 * Unit tests for the customization suite:
 *  - appearance settings (theme / layout / home widget) survive normalization
 *  - daily quests: state helpers, XP economy, level curve
 *  - quest merge rules (union by id, true-wins completions, xp max)
 *  - demo showcase plan seeding (fresh installs get it; deletions stick)
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAppData,
  defaultAppData,
  emptyQuestState,
  levelFromXp,
  xpForLevel,
  toggleQuestCompletion,
  syncMinuteQuests,
  isDayQuestEligible,
  clearQuestDay,
  QUEST_RULES_VERSION
} from '../src/utils/storage';
import { threeWayMerge } from '../src/utils/merge';
import {
  AppData,
  AppSettings,
  GlobalActivity,
  PlanProgress,
  Quest,
  QuestState
} from '../src/types';
import { DEMO_PLAN_ID } from '../src/data/plans/demo';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => void store.set(k, v),
    removeItem: (k: string): void => void store.delete(k)
  };
});

const baseSettings: AppSettings = {
  dailyReminderEnabled: false,
  dailyReminderTime: '09:00',
  timeFormat: '12h'
};

const emptyProgress: PlanProgress = {
  completedPhases: [],
  criteriaChecked: {},
  stepChecked: {},
  userNotes: {},
  lastStudiedPhaseId: null,
  stepDurations: {},
  stepDoneDay: {}
};

function global(overrides: Partial<GlobalActivity> = {}): GlobalActivity {
  return {
    streak: 0,
    lastActiveDate: null,
    historyDates: [],
    totalStudyMinutes: 0,
    historyMinutes: {},
    ...overrides
  };
}

function app(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 2,
    activePlanId: 'go-roadmap',
    activePlanUpdatedAt: 1000,
    customPlans: [],
    settings: { ...baseSettings },
    global: global(),
    progressByPlan: {},
    lastModifiedAt: 1000,
    ...overrides
  };
}

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'q1',
    title: 'Review yesterday',
    enabled: true,
    createdAt: 100,
    ...overrides
  };
}

function quests(overrides: Partial<QuestState> = {}): QuestState {
  return { items: [], completions: {}, xp: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// Appearance settings — normalization
// ---------------------------------------------------------------------------

describe('normalizeAppData: appearance settings', () => {
  test('valid theme, layout and home widget values are preserved', () => {
    const out = normalizeAppData({
      version: 2,
      settings: { ...baseSettings, theme: 'nord', layout: 'focus', homeWidget: 'ring' }
    });
    assert.equal(out.settings.theme, 'nord');
    assert.equal(out.settings.layout, 'focus');
    assert.equal(out.settings.homeWidget, 'ring');
  });

  test('invalid theme / layout / widget values are dropped (fall back to defaults)', () => {
    const out = normalizeAppData({
      version: 2,
      settings: {
        ...baseSettings,
        theme: 'solar-flare' as AppSettings['theme'],
        layout: 'grid-chaos' as AppSettings['layout'],
        homeWidget: 'crypto-prices' as AppSettings['homeWidget']
      }
    });
    assert.equal(out.settings.theme, undefined);
    assert.equal(out.settings.layout, undefined);
    assert.equal(out.settings.homeWidget, undefined);
  });

  test('absent appearance keys stay absent (sync-echo safe)', () => {
    const out = normalizeAppData({ version: 2, settings: { ...baseSettings } });
    assert.equal('theme' in out.settings, false);
    assert.equal('layout' in out.settings, false);
    assert.equal('homeWidget' in out.settings, false);
  });

  test('appearance settings survive a localStorage round-trip', () => {
    const data = app({
      settings: { ...baseSettings, theme: 'dracula', homeWidget: 'tiles' }
    });
    store.set('plan_tracker_v2', JSON.stringify({ ...data, lastModifiedAt: Date.now() }));
    const loaded = normalizeAppData(JSON.parse(store.get('plan_tracker_v2')!));
    assert.equal(loaded.settings.theme, 'dracula');
    assert.equal(loaded.settings.homeWidget, 'tiles');
  });
});

// ---------------------------------------------------------------------------
// Daily quests — XP economy & helpers
// ---------------------------------------------------------------------------

describe('quest XP & levels', () => {
  test('level 1 starts at zero xp', () => {
    assert.equal(levelFromXp(0), 1);
    assert.equal(levelFromXp(99), 1);
  });

  test('level thresholds follow the published curve (quadratic)', () => {
    assert.equal(levelFromXp(100), 2);
    assert.equal(levelFromXp(400), 3);
    assert.equal(xpForLevel(1), 0);
    assert.equal(xpForLevel(2), 100);
    assert.equal(xpForLevel(3), 400);
  });

  test('xpForLevel is the exact inverse of levelFromXp at boundaries', () => {
    for (const lvl of [1, 2, 5, 10]) {
      assert.equal(levelFromXp(xpForLevel(lvl)), lvl);
    }
  });

  test('negative or garbage xp clamps to level 1', () => {
    assert.equal(levelFromXp(-50), 1);
  });
});

describe('toggleQuestCompletion', () => {
  test('checking a quest records today and awards +10 xp', () => {
    const state = quests({ items: [quest(), quest({ id: 'q2' })] });
    const out = toggleQuestCompletion(state, 'q1', '2026-08-24', { enabledQuestCount: 2 });
    assert.equal(out.completions['q1']['2026-08-24'], true);
    assert.equal(out.xp, 10, 'no bonus yet — q2 is still open');
  });

  test('unchecking removes the completion and refunds exactly the awarded xp', () => {
    const state = quests({
      items: [quest()],
      completions: { q1: { '2026-08-24': true } },
      xp: 10
    });
    const out = toggleQuestCompletion(state, 'q1', '2026-08-24', { enabledQuestCount: 1 });
    assert.equal(out.completions['q1']?.['2026-08-24'], undefined);
    assert.equal(out.xp, 0);
  });

  test('all-done bonus (+25) is awarded when the last enabled quest is checked', () => {
    const state = quests({
      items: [quest({ id: 'a' }), quest({ id: 'b' })],
      completions: { a: { '2026-08-24': true } },
      xp: 10
    });
    const out = toggleQuestCompletion(state, 'b', '2026-08-24', { enabledQuestCount: 2 });
    assert.equal(out.xp, 10 + 10 + 25, '+10 for b plus the +25 all-done bonus');
  });

  test('bonus is not double-awarded when an already-complete set is re-checked elsewhere', () => {
    // Both done (bonus granted). User unchecks and rechecks 'b': xp must net back
    // to the original total, bonus included exactly once.
    const full = quests({
      items: [quest({ id: 'a' }), quest({ id: 'b' })],
      completions: { a: { d: true }, b: { d: true } },
      xp: 45
    });
    const unchecked = toggleQuestCompletion(full, 'b', 'd', { enabledQuestCount: 2 });
    const rechecked = toggleQuestCompletion(unchecked, 'b', 'd', { enabledQuestCount: 2 });
    assert.equal(rechecked.xp, 45, 'uncheck+recheck nets zero');
  });

  test('disabled quests do not block the all-done bonus', () => {
    const state = quests({
      items: [quest({ id: 'a' }), quest({ id: 'off', enabled: false })],
      xp: 0
    });
    const out = toggleQuestCompletion(state, 'a', 'd', { enabledQuestCount: 1 });
    assert.equal(out.xp, 35, '+10 for the quest plus +25 bonus — the disabled quest is ignored');
  });

  test('other days and other quests are untouched by a toggle', () => {
    const state = quests({
      items: [quest({ id: 'a' }), quest({ id: 'b' })],
      completions: { a: { '2026-08-23': true } },
      xp: 35
    });
    const out = toggleQuestCompletion(state, 'b', '2026-08-24', { enabledQuestCount: 2 });
    assert.equal(out.completions.a['2026-08-23'], true, 'yesterday intact');
    assert.equal(out.completions.b['2026-08-24'], true);
    assert.equal(out.items.length, 2);
  });

  test('xp never goes negative after unchecks', () => {
    const state = quests({
      items: [quest()],
      completions: { q1: { d: true } },
      xp: 3 // corrupted/legacy low balance
    });
    const out = toggleQuestCompletion(state, 'q1', 'd', { enabledQuestCount: 1 });
    assert.equal(out.xp, 0, 'floored at zero, not -7');
  });
});

describe('emptyQuestState', () => {
  test('returns a usable blank slate', () => {
    const s = emptyQuestState();
    assert.deepEqual(s.items, []);
    assert.deepEqual(s.completions, {});
    assert.equal(s.xp, 0);
  });
});

describe('syncMinuteQuests', () => {
  test('auto-completes a minutes quest once enough focus time is logged today', () => {
    const state = quests({
      items: [quest({ id: 'm', targetMinutes: 30 }), quest({ id: 'c' })]
    });
    const out = syncMinuteQuests(state, 30, '2026-08-24', { enabledQuestCount: 2 });
    assert.equal(out.completions.m?.['2026-08-24'], true, '30 logged minutes meets a 30m target');
    assert.equal(out.completions.c?.['2026-08-24'], undefined, 'check quest untouched');
    assert.equal(out.xp, 10);
  });

  test('completing the last open quest via minutes pays the all-done bonus too', () => {
    const state = quests({
      items: [quest({ id: 'm', targetMinutes: 20 }), quest({ id: 'c' })],
      completions: { c: { d: true } },
      xp: 10
    });
    const out = syncMinuteQuests(state, 25, 'd', { enabledQuestCount: 2 });
    assert.equal(out.completions.m.d, true);
    assert.equal(out.xp, 45, '+10 plus +25 bonus');
  });

  test('is idempotent — syncing twice never double-pays', () => {
    const state = quests({ items: [quest({ id: 'm', targetMinutes: 15 })] });
    const once = syncMinuteQuests(state, 40, 'd', { enabledQuestCount: 1 });
    const twice = syncMinuteQuests(once, 40, 'd', { enabledQuestCount: 1 });
    assert.equal(twice.xp, 35, 'xp identical after a second sync');
  });

  test('below-target or disabled minute quests are ignored', () => {
    const state = quests({
      items: [quest({ id: 'm', targetMinutes: 60 }), quest({ id: 'off', targetMinutes: 5, enabled: false })]
    });
    const out = syncMinuteQuests(state, 45, 'd', { enabledQuestCount: 1 });
    assert.equal(out.completions.m?.d, undefined);
    assert.equal(out.completions.off?.d, undefined);
    assert.equal(out.xp, 0);
  });

  test('manual check quests without a target are never auto-marked', () => {
    const state = quests({ items: [quest()] });
    const out = syncMinuteQuests(state, 999, 'd', { enabledQuestCount: 1 });
    assert.equal(out.completions.q1?.d, undefined);
  });
});

// ---------------------------------------------------------------------------
// Quest merge rules — cross-device guarantees
// ---------------------------------------------------------------------------

describe('merge: daily quests', () => {
  test('quests created on different devices are unioned by id — nothing is lost', () => {
    const base = app();
    const local = app({ quests: quests({ items: [quest({ id: 'a', createdAt: 100 })] }) });
    const remote = app({ quests: quests({ items: [quest({ id: 'b', createdAt: 200 })] }) });
    const { merged, conflicts } = threeWayMerge(base, local, remote);
    const ids = merged.quests!.items.map((q) => q.id).sort();
    assert.deepEqual(ids, ['a', 'b']);
    assert.equal(conflicts.length, 0);
  });

  test('same-day check on one device survives an unchecked twin on the other (true-wins)', () => {
    const base = app();
    const local = app({
      quests: quests({
        items: [quest({ id: 'a' })],
        completions: { a: { '2026-08-24': true } },
        xp: 10
      })
    });
    const remote = app({ quests: quests({ items: [quest({ id: 'a' })], completions: {}, xp: 0 }) });
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.quests!.completions.a['2026-08-24'], true);
    assert.equal(merged.quests!.xp, 10, 'higher xp wins');
  });

  test('xp is best-of-both (max)', () => {
    const base = app();
    const local = app({ quests: quests({ xp: 30 }) });
    const remote = app({ quests: quests({ xp: 75 }) });
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.quests!.xp, 75);
  });

  test('quest edited on one device (newer updatedAt) wins over stale copy', () => {
    const base = app({
      quests: quests({ items: [quest({ id: 'a', title: 'Original', updatedAt: 100 })] })
    });
    const local = app({
      quests: quests({ items: [quest({ id: 'a', title: 'Renamed here', updatedAt: 300 })] })
    });
    const remote = app({
      quests: quests({ items: [quest({ id: 'a', title: 'Original', updatedAt: 100 })] })
    });
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.quests!.items[0].title, 'Renamed here');
  });

  test('missing quests on one side degrades gracefully — the populated side wins', () => {
    const base = app();
    const local = app({ quests: quests({ items: [quest({ id: 'a' })], xp: 20 }) });
    const remote = app(); // old client / fresh account: no quests key at all
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.quests!.items.length, 1);
    assert.equal(merged.quests!.xp, 20);
  });

  test('merging two devices without any quests leaves no quests residue', () => {
    const base = app();
    const { merged } = threeWayMerge(base, app(), app());
    assert.equal(merged.quests, undefined);
  });
});

// ---------------------------------------------------------------------------
// XP gate — a day only earns XP when it is both active (streak kept) and a
// full roadmap phase was completed that day.
// ---------------------------------------------------------------------------

function progressWithPhaseDone(phaseId: number, day: string): Record<string, PlanProgress> {
  return { 'go-roadmap': { ...emptyProgress, phaseDoneDay: { [String(phaseId)]: day } } };
}

describe('isDayQuestEligible', () => {
  const day = '2026-08-24';

  test('requires both streak activity and a phase completed that day', () => {
    const data = app({
      global: global({ historyDates: [day] }),
      progressByPlan: progressWithPhaseDone(3, day)
    });
    assert.equal(isDayQuestEligible(data, day), true);
  });

  test('false when active but no phase was completed that day', () => {
    const data = app({ global: global({ historyDates: [day] }), progressByPlan: {} });
    assert.equal(isDayQuestEligible(data, day), false);
  });

  test('false when a phase was completed that day but the day has no activity', () => {
    const data = app({ progressByPlan: progressWithPhaseDone(3, day) });
    assert.equal(isDayQuestEligible(data, day), false);
  });

  test('a phase completed on a different day does not qualify', () => {
    const data = app({
      global: global({ historyDates: [day] }),
      progressByPlan: progressWithPhaseDone(3, '2026-08-23')
    });
    assert.equal(isDayQuestEligible(data, day), false);
  });

  test('a completed phase in any plan qualifies (not just the active one)', () => {
    const data = app({
      global: global({ historyDates: [day] }),
      progressByPlan: { 'custom-plan': { ...emptyProgress, phaseDoneDay: { '7': day } } }
    });
    assert.equal(isDayQuestEligible(data, day), true);
  });

  test('study minutes alone count as activity for the day', () => {
    const data = app({
      global: global({ historyMinutes: { [day]: 15 } }),
      progressByPlan: progressWithPhaseDone(3, day)
    });
    assert.equal(isDayQuestEligible(data, day), true);
  });
});

describe('clearQuestDay', () => {
  test('removes a day and claws back the +10s plus the +25 all-done bonus', () => {
    const state = quests({
      items: [quest({ id: 'a' }), quest({ id: 'b' })],
      completions: { a: { '2026-08-24': true }, b: { '2026-08-24': true, '2026-08-23': true } },
      xp: 90
    });
    const out = clearQuestDay(state, '2026-08-24', { enabledQuestCount: 2 });
    assert.equal(out.completions.a?.['2026-08-24'], undefined);
    assert.equal(out.completions.b?.['2026-08-24'], undefined);
    assert.equal(out.completions.b?.['2026-08-23'], true, 'other days untouched');
    assert.equal(out.xp, 90 - 10 - 10 - 25);
  });

  test('claws back only the +10s when the all-done bonus was not reached', () => {
    const state = quests({
      items: [quest({ id: 'a' }), quest({ id: 'b' })],
      completions: { a: { '2026-08-24': true } },
      xp: 10
    });
    const out = clearQuestDay(state, '2026-08-24', { enabledQuestCount: 2 });
    assert.equal(out.xp, 0);
    assert.deepEqual(out.completions, {});
  });

  test('removes now-empty per-quest day maps', () => {
    const state = quests({
      items: [quest({ id: 'a' })],
      completions: { a: { '2026-08-24': true } },
      xp: 10
    });
    const out = clearQuestDay(state, '2026-08-24', { enabledQuestCount: 1 });
    assert.deepEqual(out.completions, {});
    assert.equal(out.xp, 0);
  });

  test('disabled quests do not block the bonus clawback', () => {
    const state = quests({
      items: [quest({ id: 'a' }), quest({ id: 'off', enabled: false })],
      completions: { a: { d: true } },
      xp: 35
    });
    const out = clearQuestDay(state, 'd', { enabledQuestCount: 1 });
    assert.equal(out.xp, 0, '+10 and +25 clawed back; the disabled quest is ignored');
  });

  test('is a no-op for a day with no completions', () => {
    const state = quests({ items: [quest()], xp: 45 });
    const out = clearQuestDay(state, '2026-08-24', { enabledQuestCount: 1 });
    assert.equal(out, state, 'same reference returned — nothing changed');
  });

  test('xp never goes negative', () => {
    const state = quests({
      items: [quest({ id: 'a' })],
      completions: { a: { d: true } },
      xp: 2
    });
    const out = clearQuestDay(state, 'd', { enabledQuestCount: 1 });
    assert.equal(out.xp, 0);
  });
});

describe('normalizeAppData: rulesVersion XP reset', () => {
  test('quests without a rulesVersion reset xp to 0 and stamp the current version', () => {
    const out = normalizeAppData({
      version: 2,
      quests: quests({ items: [quest()], completions: {}, xp: 35 })
    });
    assert.equal(out.quests!.xp, 0);
    assert.equal(out.quests!.rulesVersion, QUEST_RULES_VERSION);
  });

  test('quests already at the current rulesVersion keep their xp', () => {
    const out = normalizeAppData({
      version: 2,
      quests: quests({ items: [quest()], rulesVersion: QUEST_RULES_VERSION, xp: 20 })
    });
    assert.equal(out.quests!.xp, 20);
    assert.equal(out.quests!.rulesVersion, QUEST_RULES_VERSION);
  });

  test('rulesVersion survives a normalize round-trip (reset happens only once)', () => {
    const once = normalizeAppData({
      version: 2,
      quests: quests({ items: [quest()], rulesVersion: QUEST_RULES_VERSION, xp: 20 })
    });
    const twice = normalizeAppData(once);
    assert.equal(twice.quests!.xp, 20);
    assert.equal(twice.quests!.rulesVersion, QUEST_RULES_VERSION);
  });
});

describe('normalizeAppData: phaseDoneDay', () => {
  test('valid phase completion days are preserved', () => {
    const out = normalizeAppData({
      version: 2,
      progressByPlan: {
        'go-roadmap': {
          ...emptyProgress,
          completedPhases: [3],
          phaseDoneDay: { '3': '2026-08-24', '4': '2026-08-23' }
        }
      }
    });
    assert.deepEqual(out.progressByPlan['go-roadmap'].phaseDoneDay, {
      '3': '2026-08-24',
      '4': '2026-08-23'
    });
  });

  test('garbage phaseDoneDay values are dropped', () => {
    const out = normalizeAppData({
      version: 2,
      progressByPlan: {
        'go-roadmap': {
          ...emptyProgress,
          completedPhases: [3],
          phaseDoneDay: { '3': 'not-a-date', '4': '2026-08-23' }
        }
      }
    });
    assert.deepEqual(out.progressByPlan['go-roadmap'].phaseDoneDay, { '4': '2026-08-23' });
  });
});

describe('merge: phaseDoneDay & rulesVersion', () => {
  test('phaseDoneDay entries are unioned across devices', () => {
    const base = app();
    const local = app({
      progressByPlan: { p: { ...emptyProgress, phaseDoneDay: { '3': '2026-08-24' } } }
    });
    const remote = app({
      progressByPlan: { p: { ...emptyProgress, phaseDoneDay: { '4': '2026-08-23' } } }
    });
    const { merged } = threeWayMerge(base, local, remote);
    assert.deepEqual(merged.progressByPlan.p.phaseDoneDay, { '3': '2026-08-24', '4': '2026-08-23' });
  });

  test('rulesVersion is carried forward as the max', () => {
    const base = app();
    const local = app({ quests: quests({ rulesVersion: 1, xp: 5 }) });
    const remote = app({ quests: quests({ rulesVersion: 2, xp: 9 }) });
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.quests!.rulesVersion, 2);
  });

  test('xp from a stale-rules side is discarded when the other side is current', () => {
    const base = app();
    const local = app({ quests: quests({ rulesVersion: 1, xp: 0 }) });
    const remote = app({ quests: quests({ xp: 35 }) }); // pre-migration, no rulesVersion
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.quests!.rulesVersion, 1);
    assert.equal(merged.quests!.xp, 0, 'stale-rules xp must not resurrect via merge');
  });

  test('same-rules merge keeps the higher xp', () => {
    const base = app();
    const local = app({ quests: quests({ rulesVersion: 1, xp: 30 }) });
    const remote = app({ quests: quests({ rulesVersion: 1, xp: 75 }) });
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.quests!.xp, 75);
  });
});

// ---------------------------------------------------------------------------
// Demo showcase plan — seeding guarantees
// ---------------------------------------------------------------------------

describe('demo showcase plan seeding', () => {
  test('fresh install defaults include the demo plan', () => {
    const fresh = defaultAppData();
    const demo = fresh.customPlans.find((p) => p.id === DEMO_PLAN_ID);
    assert.ok(demo, 'demo plan seeded on first run');
    assert.equal(demo!.name.includes('Demo'), true, 'clearly labelled as a demo');
  });

  test('normalizeAppData injects the demo plan when no trace exists', () => {
    const out = normalizeAppData({ version: 2 });
    assert.ok(out.customPlans.some((p) => p.id === DEMO_PLAN_ID));
  });

  test('a deleted demo plan (tombstone) is NOT resurrected', () => {
    const out = normalizeAppData({
      version: 2,
      customPlans: [{ id: DEMO_PLAN_ID, name: 'Demo', emoji: 'x', accent: 'accent', sections: [], phases: [], deleted: true }]
    });
    const traces = out.customPlans.filter((p) => p.id === DEMO_PLAN_ID);
    assert.equal(traces.length, 1, 'exactly the tombstone, no re-seeded copy');
    assert.equal(traces[0].deleted, true);
  });

  test('an edited demo plan is kept verbatim — no duplicate injected', () => {
    const out = normalizeAppData({
      version: 2,
      customPlans: [
        { id: DEMO_PLAN_ID, name: 'My tweaked demo', emoji: 'x', accent: 'warning', sections: [], phases: [] }
      ]
    });
    const traces = out.customPlans.filter((p) => p.id === DEMO_PLAN_ID);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].name, 'My tweaked demo');
  });

  test('demo plan is NOT marked builtIn so users can freely edit and delete it', () => {
    const fresh = defaultAppData();
    const demo = fresh.customPlans.find((p) => p.id === DEMO_PLAN_ID)!;
    assert.notEqual(demo.builtIn, true);
  });
});
