/**
 * PROVE-IT BUG TEST — runaway sync echo: the sign-in sync cycle never settles.
 *
 * Root causes (fixed together):
 *  1. `saveAppData` bumped `lastModifiedAt` on every save and
 *     `normalizeAppData` dropped it on load, so local was always a timestamp
 *     ahead of the pushed snapshot.
 *  2. The push decision used raw `JSON.stringify`, but the Convex backend
 *     re-serializes stored documents with SORTED object keys — so even
 *     identical data compared unequal forever and re-pushed every ~500ms.
 *
 * This test replays the client-side cycle (load → merge → save → push
 * decision) using the same canonical comparison the fixed syncNow uses, and
 * asserts the cycle stabilizes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadAppData, saveAppData } from '../src/utils/storage';
import { threeWayMerge, canonicalJson } from '../src/utils/merge';
import { AppData } from '../src/types';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string): string | null => store.get(k) ?? null,
  setItem: (k: string, v: string): void => void store.set(k, v),
  removeItem: (k: string): void => void store.delete(k)
};

/** Replays one syncNow iteration. Returns the pushed state, or null if none. */
function syncIteration(remote: AppData): AppData | null {
  const local = loadAppData();
  const lastSyncedStr = store.get('plan_tracker_last_synced');
  const base: AppData | null = lastSyncedStr ? JSON.parse(lastSyncedStr) : null;
  const { merged, conflicts } = threeWayMerge(base, local, remote);

  if (conflicts.length === 0) {
    saveAppData(merged);
    store.set('plan_tracker_last_synced', JSON.stringify(merged));
    if (canonicalJson(merged) !== canonicalJson(remote)) {
      return merged;
    }
  }
  return null;
}

describe('sync cycle stabilizes (no endless re-push)', () => {
  test('idle merge cycles after a successful sync must not keep pushing', () => {
    store.clear();

    // Fresh device signs in with no cloud data → syncNow pushes local.
    const fresh = loadAppData();
    const pushedToCloud: AppData = JSON.parse(JSON.stringify(fresh));
    store.set('plan_tracker_last_synced', JSON.stringify(pushedToCloud));
    let remote = pushedToCloud;

    let pushes = 0;
    for (let i = 0; i < 50; i++) {
      const pushed = syncIteration(remote);
      if (pushed === null) break;
      pushes++;
      remote = pushed;
    }

    assert.ok(
      pushes <= 3,
      `sync cycle did not settle: ${pushes} re-pushes before stabilizing`
    );
  });

  test('a user change pushes once, then the cycle settles', () => {
    store.clear();

    // Seed a settled base state (local == remote == last_synced).
    const fresh = loadAppData();
    saveAppData(fresh);
    store.set('plan_tracker_last_synced', JSON.stringify(fresh));
    let remote = JSON.parse(store.get('plan_tracker_v2')!) as AppData;

    // User checks a step → a real local change.
    const changed = JSON.parse(JSON.stringify(fresh));
    changed.progressByPlan = {
      'go-roadmap': {
        completedPhases: [], criteriaChecked: {}, stepChecked: { '0_0': true },
        userNotes: {}, lastStudiedPhaseId: null
      }
    };
    saveAppData({ ...changed, lastModifiedAt: Date.now() });

    let pushes = 0;
    for (let i = 0; i < 50; i++) {
      const pushed = syncIteration(remote);
      if (pushed === null) break;
      pushes++;
      remote = pushed;
    }

    assert.ok(
      pushes >= 1 && pushes <= 3,
      `expected 1–2 settling pushes, got ${pushes}`
    );
  });
});