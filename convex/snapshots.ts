/**
 * Snapshots — cross-device sync store.
 *
 * One document per user. The client always writes its own snapshot;
 * conflicts are resolved client-side via three-way merge (S8).
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
      .withIndex('by_user', (q) => q.eq('userId', userId))
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

    const existing = await ctx.db
      .query('snapshots')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        data: args.data,
        updatedAt: args.updatedAt,
        deviceLabel: args.deviceLabel
      });
    } else {
      await ctx.db.insert('snapshots', {
        userId,
        data: args.data,
        updatedAt: args.updatedAt,
        deviceLabel: args.deviceLabel
      });
    }
  }
});
