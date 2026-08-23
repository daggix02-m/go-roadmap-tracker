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
import { threeWayMerge, Conflict } from './merge';
import { AppData } from '../types';
import { loadAppData, saveAppData } from './storage';
import { getDeviceLabel } from './device';

const PUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface SyncState {
  /** True while a pull/merge/push cycle is in progress. */
  syncing: boolean;
  /** Timestamp of the last successful push to cloud (epoch ms). */
  lastPushedAt: number | null;
  /** Conflicts from the last merge that need user resolution. */
  pendingConflicts: Conflict[] | null;
  /** Resolved merged data waiting for user decision (null = none). */
  pendingMerged: AppData | null;
  /** Local snapshot that was diverged (for "keep both" fork). */
  pendingLocal: AppData | null;
  /** Remote snapshot that was diverged (for "keep both" fork). */
  pendingRemote: AppData | null;
}

export interface SyncActions {
  /** Pull → merge → push cycle. Called on sign-in and periodically. */
  syncNow: () => Promise<void>;
  /** Push local data to cloud immediately (no merge, no conflict). */
  pushNow: () => Promise<void>;
  /** User chose a resolution for pending conflicts. */
  resolveConflicts: (resolution: 'local' | 'remote' | 'merge') => void;
}

const DEVICE_LABEL = getDeviceLabel();

export function useSync(): SyncState & SyncActions {
  const { isAuthenticated } = useConvexAuth();
  const cloudSnapshot = useQuery(api.snapshots.get);
  const pushSnapshot = useMutation(api.snapshots.put);

  const [syncing, setSyncing] = useState(false);
  const [lastPushedAt, setLastPushedAt] = useState<number | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<Conflict[] | null>(null);
  const [pendingMerged, setPendingMerged] = useState<AppData | null>(null);
  const [pendingLocal, setPendingLocal] = useState<AppData | null>(null);
  const [pendingRemote, setPendingRemote] = useState<AppData | null>(null);

  // Reference to avoid stale closures in the background interval.
  const localRef = useRef<AppData>(loadAppData());

  /** Push the given data (or current local) to Convex. */
  const pushNow = useCallback(
    async (data?: AppData) => {
      if (!isAuthenticated) return;
      const toPush = data ?? loadAppData();
      const now = Date.now();
      await pushSnapshot({
        data: toPush,
        updatedAt: now,
        deviceLabel: DEVICE_LABEL
      });
      setLastPushedAt(now);
    },
    [isAuthenticated, pushSnapshot]
  );

  /** Full sync cycle: pull → merge → push. */
  const syncNow = useCallback(async () => {
    if (!isAuthenticated || pendingConflicts) return; // don't re-sync while conflicts unresolved
    setSyncing(true);
    try {
      const local = loadAppData();
      localRef.current = local;
      const remote = cloudSnapshot;

      // No cloud data yet — just push local.
      if (!remote) {
        await pushNow(local);
        return;
      }

      const remoteData = remote.data as AppData;
      // Use the stored lastSynced snapshot as the base for three-way merge.
      const lastSyncedStr = localStorage.getItem('plan_tracker_last_synced');
      const base: AppData | null = lastSyncedStr ? JSON.parse(lastSyncedStr) : null;

      const { merged, conflicts } = threeWayMerge(base, local, remoteData);

      if (conflicts.length === 0) {
        // Auto-resolved — store merged, push to cloud.
        saveAppData(merged);
        localStorage.setItem('plan_tracker_last_synced', JSON.stringify(merged));
        await pushNow(merged);
      } else {
        // Conflicts need user decision — pause sync, show modal.
        setPendingConflicts(conflicts);
        setPendingMerged(merged);
        setPendingLocal(local);
        setPendingRemote(remoteData);
      }
    } finally {
      setSyncing(false);
    }
  }, [isAuthenticated, cloudSnapshot, pushNow, pendingConflicts]);

  /** Resolve pending conflicts. */
  const resolveConflicts = useCallback(
    (resolution: 'local' | 'remote' | 'merge') => {
      if (!pendingMerged || !pendingLocal || !pendingRemote) return;

      let final: AppData;

      switch (resolution) {
        case 'local':
          final = pendingLocal;
          break;
        case 'remote':
          final = pendingRemote;
          break;
        case 'merge': {
          // Fork: keep local as-is, duplicate remote's custom plans
          // under new IDs so nothing is lost.
          const remoteOnlyPlans = pendingRemote.customPlans.filter(
            (rp) => !pendingLocal.customPlans.some((lp) => lp.id === rp.id)
          );
          const forked = remoteOnlyPlans.map((p) => ({
            ...p,
            id: `${p.id}-fork-${Date.now()}`,
            name: `${p.name} (cloud)`,
            lastModifiedAt: Date.now()
          }));
          final = {
            ...pendingLocal,
            customPlans: [...pendingLocal.customPlans, ...forked],
            lastModifiedAt: Date.now()
          };
          break;
        }
      }

      saveAppData(final);
      localStorage.setItem('plan_tracker_last_synced', JSON.stringify(final));
      // Push the resolved state.
      pushNow(final);

      // Clear conflict state.
      setPendingConflicts(null);
      setPendingMerged(null);
      setPendingLocal(null);
      setPendingRemote(null);
    },
    [pendingMerged, pendingLocal, pendingRemote, pushNow]
  );

  // Auto-sync on sign-in (wait for cloudSnapshot to load).
  useEffect(() => {
    if (!isAuthenticated || cloudSnapshot === undefined) return;
    syncNow();
  }, [isAuthenticated, cloudSnapshot, syncNow]);

  // Background push every PUSH_INTERVAL_MS.
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => {
      if (!pendingConflicts) pushNow();
    }, PUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, pendingConflicts, pushNow]);

  // Push on sign-out (before the ConvexAuthProvider clears state).
  useEffect(() => {
    if (isAuthenticated) return;
    // Component unmounts or auth state flips to false — push final snapshot.
    const local = loadAppData();
    pushNow(local).catch(() => {});
  }, [isAuthenticated, pushNow]);

  return {
    syncing,
    lastPushedAt,
    pendingConflicts,
    pendingMerged,
    pendingLocal,
    pendingRemote,
    syncNow,
    pushNow,
    resolveConflicts
  };
}
