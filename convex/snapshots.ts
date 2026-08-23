/**
 * Snapshots — cross-device sync store.
 *
 * One document per user. The client always writes its own snapshot;
 * conflicts are resolved client-side via three-way merge (S8).
 *
 * CONCURRENCY
 * -----------
 * `put` inserts a NEW document every time (a pure write with no reads of the
 * snapshot table), then deletes the user's strictly-older snapshots. The old
 * read-then-write upsert (query `by_user` → patch) caused
 * `OptimisticConcurrencyControlFailure` whenever two devices pushed at once:
 * both transactions read the same "hot" snapshot doc, and one aborted on the
 * stale read. Pure `insert` never reads, so it can never hit the OCC retry
 * limit; the cleanup only touches old, effectively-immutable docs.
 *
 * Last-write-wins is preserved: cleanup deletes only docs whose `updatedAt`
 * is strictly older than the one just written, so a concurrently-inserted
 * newer snapshot is never removed. `get` picks the highest `updatedAt` via
 * the `by_user_updated` index.
 */
import { getAuthUserId } from '@convex-dev/auth/server';
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

/** Return the current user's snapshot, or null if they haven't synced yet. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query('snapshots')
      .withIndex('by_user_updated', (q) => q.eq('userId', userId))
      .order('desc')
      .first();
  }
});

/** Upsert the user's snapshot. Called by the client after every merge. */
export const put = mutation({
  args: {
    data: v.any(),
    updatedAt: v.number(),
    deviceLabel: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // Hot path: a pure insert. No reads of the snapshot table → the mutation
    // has an empty read set → it can never be aborted by optimistic
    // concurrency control, no matter how many devices push at once.
    const newId = await ctx.db.insert('snapshots', {
      userId,
      data: args.data,
      updatedAt: args.updatedAt,
      deviceLabel: args.deviceLabel
    });

    // Best-effort cleanup of strictly-older snapshots. Only docs with a
    // smaller `updatedAt` are removed, so a concurrently-written newer
    // snapshot (LWW winner) is never deleted. If two pushes race on cleaning
    // up the same old doc, Convex aborts + retries this mutation — the retry
    // inserts a fresh doc and cleans again, so it self-heals.
    const older = await ctx.db
      .query('snapshots')
      .withIndex('by_user_updated', (q) =>
        q.eq('userId', userId).lt('updatedAt', args.updatedAt)
      )
      .collect();
    for (const s of older) {
      if (s._id !== newId) await ctx.db.delete(s._id);
    }
  }
});
