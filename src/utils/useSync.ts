/**
 * useSync — cross-device sync engine.
 *
 * Lifecycle:
 * 1. On sign-in: pull cloud snapshot → three-way merge with local → push merged → store lastSynced.
 * 2. Background: push local snapshot to cloud every 5 min (if authenticated).
 * 3. On sign-out: push final local snapshot.
 * 4. If merge produces conflicts → expose for ConflictModal.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { threeWayMerge, canonicalJson, Conflict, resolveWithPreference } from './merge';
import { AppData, ConflictResolutionPref } from '../types';
import { loadAppData, saveAppData, onAppDataSaved } from './storage';
import { getDeviceLabel } from './device';

const PUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — safety net
const PUSH_DEBOUNCE_MS = 2500; // push shortly after the last user action

export interface SyncState {
  /** True while a pull/merge/push cycle is in progress. */
  syncing: boolean;
  /** Timestamp of the last successful push to cloud (epoch ms). */
  lastPushedAt: number | null;
  /** Timestamp of the last completed sync cycle (pull+merge or push). */
  lastSyncedAt: number | null;
  /** Conflicts from the last merge that need user resolution. */
  pendingConflicts: Conflict[] | null;
  /** Resolved merged data waiting for user decision (null = none). */
  pendingMerged: AppData | null;
  /** Local snapshot that was diverged (for "keep both" fork). */
  pendingLocal: AppData | null;
  /** Remote snapshot that was diverged (for "keep both" fork). */
  pendingRemote: AppData | null;
  /** The most recent state applied to localStorage by the sync engine. */
  syncedData: AppData | null;
}

export interface SyncActions {
  /** Pull → merge → push cycle. Called on sign-in and periodically. */
  syncNow: () => Promise<void>;
  /** Push local data to cloud immediately (no merge, no conflict). */
  pushNow: () => Promise<void>;
  /**
   * User (or their remembered preference) chose a resolution for pending
   * conflicts. `remember` also stores the choice in settings for future syncs.
   */
  resolveConflicts: (
    resolution: 'local' | 'remote' | 'merge',
    remember?: boolean
  ) => Promise<void>;
}

const DEVICE_LABEL = getDeviceLabel();

export function useSync(): SyncState & SyncActions {
  const { isAuthenticated } = useConvexAuth();
  // Skip the query while signed out: `snapshots.get` returns null for an
  // anonymous request, which used to be mistaken for "account has no data".
  // That race let a fresh device push its empty state over the account's
  // cloud snapshot on sign-in. Skipping keeps `cloudSnapshot` at `undefined`
  // (loading) until the authenticated query resolves, so the only null the
  // sync engine ever sees is a confirmed "no snapshot" answer.
  const cloudSnapshot = useQuery(api.snapshots.get, isAuthenticated ? undefined : 'skip');
  const pushSnapshot = useMutation(api.snapshots.put);

  const [syncing, setSyncing] = useState(false);
  const [lastPushedAt, setLastPushedAt] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<Conflict[] | null>(null);
  const [pendingMerged, setPendingMerged] = useState<AppData | null>(null);
  const [pendingLocal, setPendingLocal] = useState<AppData | null>(null);
  const [pendingRemote, setPendingRemote] = useState<AppData | null>(null);
  // The latest state the sync engine applied locally. App subscribes to this
  // so the UI reflects cloud-merged data after sign-in / background sync —
  // otherwise the React state stays stale until a manual reload.
  const [syncedData, setSyncedData] = useState<AppData | null>(null);

  // Reference to avoid stale closures in the background interval.
  const localRef = useRef<AppData>(loadAppData());

  // Re-entrancy guard for syncNow. State alone can't be checked synchronously
  // inside the callback, and the cloudSnapshot effect can re-fire mid-cycle
  // (right after a push commits), so we need a ref.
  const syncingRef = useRef(false);

  // Serializes pushes so sign-in sync, background interval, sign-out and
  // conflict-resolution never fire `snapshots.put` concurrently from the same
  // tab — one of the triggers for OptimisticConcurrencyControlFailure.
  const pushQueueRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * Push the given data (or current local) to Convex. No auth guard — this is
   * the primitive used by both `pushNow` (guarded) and the sign-out flush,
   * which must run *after* isAuthenticated flips to false.
   */
  const pushInternal = useCallback(
    async (data?: AppData) => {
      const run = async () => {
        const toPush = data ?? loadAppData();
        const now = Date.now();
        // Defense-in-depth: bounded retry on OCC. The server-side upsert is
        // already conflict-free; this only covers residual cross-tab races.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await pushSnapshot({
              data: toPush,
              updatedAt: now,
              deviceLabel: DEVICE_LABEL
            });
            setLastPushedAt(now);
            setLastSyncedAt(now);
            return;
          } catch (err) {
            const isOcc =
              err instanceof Error &&
              err.message.includes('OptimisticConcurrencyControlFailure');
            if (attempt === 2 || !isOcc) throw err;
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          }
        }
      };
      // Chain onto the previous push so they never overlap in this tab.
      const next = pushQueueRef.current.then(run, run);
      pushQueueRef.current = next.catch(() => {});
      return next;
    },
    [pushSnapshot]
  );

  /** Push the given data (or current local) to Convex. */
  const pushNow = useCallback(
    async (data?: AppData) => {
      if (!isAuthenticated) return;
      return pushInternal(data);
    },
    [isAuthenticated, pushInternal]
  );

  /** Full sync cycle: pull → merge → push. */
  const syncNow = useCallback(async () => {
    // Don't re-sync while conflicts are unresolved or a cycle is in flight.
    if (!isAuthenticated || pendingConflicts || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const local = loadAppData();
      localRef.current = local;
      const remote = cloudSnapshot;

      // No cloud data yet — just push local.
      if (!remote) {
        localStorage.setItem('plan_tracker_last_synced', JSON.stringify(local));
        setSyncedData(local);
        await pushNow(local);
        return;
      }

      const remoteData = remote.data as AppData;
      // Use the stored lastSynced snapshot as the base for three-way merge.
      const lastSyncedStr = localStorage.getItem('plan_tracker_last_synced');
      const base: AppData | null = lastSyncedStr ? JSON.parse(lastSyncedStr) : null;

      const { merged, conflicts } = threeWayMerge(base, local, remoteData);

      if (conflicts.length === 0) {
        // Auto-resolved — adopt the merged state locally and use it as the
        // base for future merges. Silent save: this is a sync-internal write,
        // not a user action, so it must not trigger the debounced re-push.
        saveAppData(merged, { silent: true });
        localStorage.setItem('plan_tracker_last_synced', JSON.stringify(merged));
        // Only push back if the cloud doesn't already have this state.
        // Note the comparison is canonical (key-sorted): Convex re-serializes
        // stored documents with sorted object keys, so a raw JSON.stringify
        // comparison against the echoed snapshot never settles and re-pushes
        // forever (~every 500ms, the runaway echo).
        if (canonicalJson(merged) !== canonicalJson(remoteData)) {
          await pushNow(merged);
        }
        setSyncedData(merged);
        return;
      }

      // Remembered preference? Apply it without interrupting the user.
      const pref = local.settings.conflictResolution;
      if (pref && pref !== 'ask') {
        const final = resolveWithPreference(pref, local, remoteData);
        saveAppData(final, { silent: true });
        localStorage.setItem('plan_tracker_last_synced', JSON.stringify(final));
        setSyncedData(final);
        try {
          await pushNow(final);
        } catch {
          // Push failed — next sync cycle retries against fresh cloud state.
        }
        return;
      }

      // Conflicts need a human decision — pause sync, show modal.
      setPendingConflicts(conflicts);
      setPendingMerged(merged);
      setPendingLocal(local);
      setPendingRemote(remoteData);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      // A completed cycle (pull+merge or first push) means the data is synced.
      setLastSyncedAt(Date.now());
    }
  }, [isAuthenticated, cloudSnapshot, pushNow, pendingConflicts]);

  /** Resolve pending conflicts (from the modal, or a remembered preference). */
  const resolveConflicts = useCallback(
    async (resolution: 'local' | 'remote' | 'merge', remember?: boolean) => {
      if (!pendingMerged || !pendingLocal || !pendingRemote) return;

      const final = resolveWithPreference(resolution, pendingLocal, pendingRemote);
      if (remember) {
        // Store the standing choice inside the resolved state itself so one
        // save covers both the outcome and the preference.
        final.settings.conflictResolution = resolution;
      }

      saveAppData(final, { silent: true });
      localStorage.setItem('plan_tracker_last_synced', JSON.stringify(final));
      setSyncedData(final);
      // Push the resolved state and only clear the conflict once the cloud
      // actually has it — otherwise the auto-sync can re-detect the same
      // conflict against a stale snapshot (modal reappears and gets stuck).
      try {
        await pushNow(final);
      } catch {
        return; // push failed — keep the modal open so the user can retry
      }

      // Clear conflict state.
      setPendingConflicts(null);
      setPendingMerged(null);
      setPendingLocal(null);
      setPendingRemote(null);
    },
    [pendingMerged, pendingLocal, pendingRemote, pushNow]
  );

  // Latest syncNow for the auto-sync effect. We keep the effect dependent
  // only on `isAuthenticated`/`cloudSnapshot`, NOT on syncNow's identity —
  // syncNow changes whenever pendingConflicts flips, which would re-fire the
  // effect immediately after resolving a conflict and re-merge against the
  // still-stale cloud snapshot, re-creating the very conflict the user just
  // resolved (modal reappears and gets stuck).
  const syncNowRef = useRef(syncNow);
  useEffect(() => {
    syncNowRef.current = syncNow;
  }, [syncNow]);

  // Auto-sync on sign-in (wait for cloudSnapshot to load).
  useEffect(() => {
    if (!isAuthenticated || cloudSnapshot === undefined) return;
    syncNowRef.current();
  }, [isAuthenticated, cloudSnapshot]);

  // Background push every PUSH_INTERVAL_MS (safety net).
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => {
      if (!pendingConflicts) pushNow();
    }, PUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, pendingConflicts, pushNow]);

  // Debounced push after a user action. `saveAppData` notifies us on every
  // non-silent save (App.tsx / logStudyActivity); we push a short moment
  // after the last change so the account snapshot stays fresh without the
  // runaway echo. This also makes the old sign-out push unnecessary — the
  // final state is already in the cloud before the token is invalidated.
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePush = useCallback(() => {
    if (!isAuthenticated || pendingConflicts) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      pushNow();
    }, PUSH_DEBOUNCE_MS);
  }, [isAuthenticated, pendingConflicts, pushNow]);

  useEffect(() => {
    const off = onAppDataSaved(schedulePush);
    return () => {
      off();
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [schedulePush]);

  return {
    syncing,
    lastPushedAt,
    lastSyncedAt,
    pendingConflicts,
    pendingMerged,
    pendingLocal,
    pendingRemote,
    syncedData,
    syncNow,
    pushNow,
    resolveConflicts
  };
}
