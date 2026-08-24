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
  awardPhaseXp,
  revokePhaseXp,
  isDayQuestEligible,
  QUEST_RULES_VERSION,
  QUEST_XP_PER_PHASE
} from '../src/utils/storage';
import { threeWayMerge } from '../src/utils/merge';
import { AppData, AppSettings, GlobalActivity, PlanProgress, QuestState } from '../src/types';
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
// Phase XP — XP is earned only by completing a full roadmap phase.
// ---------------------------------------------------------------------------

describe('quest XP & levels', () => {
  test('level 1 starts at zero xp', () => {
    assert.equal(levelFromXp(0), 1);
  });

  test('xpForLevel is the exact inverse of levelFromXp at boundaries', () => {
    for (let lvl = 1; lvl <= 10; lvl++) {
      assert.equal(levelFromXp(xpForLevel(lvl)), lvl);
    }
  });

  test('negative or garbage xp clamps to level 1', () => {
    assert.equal(levelFromXp(-5), 1);
    assert.equal(levelFromXp(Number.NaN), 1);
  });
});

describe('awardPhaseXp', () => {
  test('awarding a phase pays exactly QUEST_XP_PER_PHASE', () => {
    const out = awardPhaseXp(quests(), '3');
    assert.equal(out.xp, QUEST_XP_PER_PHASE);
  });

  test('awarding several phases stacks the xp', () => {
    const s1 = awardPhaseXp(quests(), '3');
    const s2 = awardPhaseXp(s1, '4');
    const s3 = awardPhaseXp(s2, '5');
    assert.equal(s3.xp, QUEST_XP_PER_PHASE * 3);
  });

  test('awarding the same phase twice does not double-pay', () => {
    const once = awardPhaseXp(quests(), '3');
    const twice = awardPhaseXp(once, '3');
    assert.equal(twice.xp, QUEST_XP_PER_PHASE);
  });
});

describe('revokePhaseXp', () => {
  test('revoking a phase refunds exactly what awarding gave', () => {
    const awarded = awardPhaseXp(quests(), '3');
    const revoked = revokePhaseXp(awarded, '3');
    assert.equal(revoked.xp, 0);
  });

  test('revoking only claws back the revoked phase', () => {
    const s = awardPhaseXp(awardPhaseXp(quests(), '3'), '4');
    const out = revokePhaseXp(s, '3');
    assert.equal(out.xp, QUEST_XP_PER_PHASE);
  });

  test('revoking a phase that was never awarded is a no-op', () => {
    const state = quests({ xp: 50 });
    assert.equal(revokePhaseXp(state, '3'), state);
  });

  test('xp never goes negative on revoke', () => {
    const state = quests({
      xp: 5, // corrupted/legacy low balance
      earnedPhaseIds: ['3']
    });
    const out = revokePhaseXp(state, '3');
    assert.equal(out.xp, 0);
  });

  test('revoking then re-awarding the same phase pays again', () => {
    const out = awardPhaseXp(revokePhaseXp(awardPhaseXp(quests(), '3'), '3'), '3');
    assert.equal(out.xp, QUEST_XP_PER_PHASE);
  });
});

describe('emptyQuestState', () => {
  test('starts with no xp and empty award history', () => {
    const s = emptyQuestState();
    assert.equal(s.xp, 0);
    assert.deepEqual(s.earnedPhaseIds ?? [], []);
  });
});

// ---------------------------------------------------------------------------
// XP gate — a day only counts as eligible when it is streak-active AND a full
// roadmap phase was completed that day. XP is awarded on completion, but the
// card reflects the gate so days that lose a completed phase re-lock.
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

// ---------------------------------------------------------------------------
// normalizeAppData: rulesVersion XP reset + earnedPhaseIds sanitization
// ---------------------------------------------------------------------------

describe('normalizeAppData: rulesVersion XP reset', () => {
  test('quests without a rulesVersion reset xp to 0 and stamp the current version', () => {
    const out = normalizeAppData({ version: 2, quests: quests({ xp: 35 }) });
    assert.equal(out.quests!.xp, 0);
    assert.equal(out.quests!.rulesVersion, QUEST_RULES_VERSION);
  });

  test('quests already at the current rulesVersion keep their xp', () => {
    const out = normalizeAppData({
      version: 2,
      quests: quests({ xp: 20, rulesVersion: QUEST_RULES_VERSION })
    });
    assert.equal(out.quests!.xp, 20);
    assert.equal(out.quests!.rulesVersion, QUEST_RULES_VERSION);
  });

  test('rulesVersion survives a normalize round-trip (reset happens only once)', () => {
    const once = normalizeAppData({
      version: 2,
      quests: quests({ xp: 20, rulesVersion: QUEST_RULES_VERSION })
    });
    const twice = normalizeAppData(once);
    assert.equal(twice.quests!.xp, 20);
    assert.equal(twice.quests!.rulesVersion, QUEST_RULES_VERSION);
  });

  test('earnedPhaseIds are preserved on normalize when valid', () => {
    const out = normalizeAppData({
      version: 2,
      quests: quests({
        xp: 50,
        rulesVersion: QUEST_RULES_VERSION,
        earnedPhaseIds: ['3', '4']
      })
    });
    assert.deepEqual(out.quests!.earnedPhaseIds, ['3', '4']);
  });

  test('garbage earnedPhaseIds entries are dropped', () => {
    const out = normalizeAppData({
      version: 2,
      quests: quests({
        xp: 25,
        rulesVersion: QUEST_RULES_VERSION,
        earnedPhaseIds: ['3', 7 as unknown as string, 'not-a-number']
      })
    });
    assert.deepEqual(out.quests!.earnedPhaseIds, ['3']);
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

// ---------------------------------------------------------------------------
// Phase XP merge rules — cross-device guarantees
// ---------------------------------------------------------------------------

describe('merge: phase xp & earnedPhaseIds', () => {
  test('earnedPhaseIds are unioned across devices (true-wins, nothing lost)', () => {
    const base = app();
    const local = app({ quests: quests({ earnedPhaseIds: ['3'] }) });
    const remote = app({ quests: quests({ earnedPhaseIds: ['4'] }) });
    const { merged, conflicts } = threeWayMerge(base, local, remote);
    assert.deepEqual(merged.quests!.earnedPhaseIds!.sort(), ['3', '4']);
    assert.equal(conflicts.length, 0);
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

  test('merging two devices without any quests leaves no quests residue', () => {
    const base = app();
    const { merged } = threeWayMerge(base, app(), app());
    assert.equal(merged.quests, undefined);
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
