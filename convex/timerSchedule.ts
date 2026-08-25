/**
 * Timer schedule — tracks active focus timers server-side so the cron can
 * send push notifications when they expire.
 *
 * Only focus timers are tracked (step timers are local-only). One active
 * timer per user; starting a new one replaces any previous.
 */
import { getAuthUserId } from '@convex-dev/auth/server';
import { internalAction, internalMutation, internalQuery, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { evaluateTimerRound, buildTimerNotification } from './timerPolicy';

// ---------------------------------------------------------------------------
// Client-facing mutations
// ---------------------------------------------------------------------------

/** Record or replace a focus timer for the signed-in user. */
export const startTracking = mutation({
  args: {
    endsAtMs: v.number(),
    kind: v.union(v.literal('focus'), v.literal('step')),
    variant: v.optional(v.union(v.literal('study'), v.literal('break'))),
    phaseLabel: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // Only track focus timers — step timers are short and local-only.
    if (args.kind !== 'focus') return;

    // Upsert: insert new, delete old (same pattern as reminders.subscribe).
    const schedId = await ctx.db.insert('timerSchedule', {
      userId,
      endsAtMs: args.endsAtMs,
      kind: args.kind,
      variant: args.variant,
      phaseLabel: args.phaseLabel
    });

    const older = await ctx.db
      .query('timerSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const s of older) {
      if (s._id !== schedId) await ctx.db.delete(s._id);
    }
  }
});

/** Cancel the active timer schedule for the signed-in user. */
export const cancelTracking = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const sched = await ctx.db
      .query('timerSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (sched) await ctx.db.delete(sched._id);
  }
});

// ---------------------------------------------------------------------------
// Cron helpers (internal only)
// ---------------------------------------------------------------------------

/** Find all schedules where endsAtMs <= now. */
export const getDue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('timerSchedule')
      .withIndex('by_due', (q) => q.lte('endsAtMs', args.now))
      .collect();
  }
});

/** Get all push subscriptions for a user. */
export const getSubscriptions = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
  }
});

/** Remove a stale subscription by endpoint. */
export const removeSubscription = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .first();
    if (sub) await ctx.db.delete(sub._id);
  }
});

/** Remove a timer schedule. */
export const removeSchedule = internalMutation({
  args: { scheduleId: v.id('timerSchedule') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.scheduleId);
  }
});

/** Record a failed push round. */
export const markRetry = internalMutation({
  args: {
    scheduleId: v.id('timerSchedule'),
    failCount: v.number(),
    lastError: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scheduleId, {
      failCount: args.failCount
    });
  }
});

// ---------------------------------------------------------------------------
// Cron-triggered orchestration
// ---------------------------------------------------------------------------

/** Scans due timer schedules, sends pushes, then cleans up or retries. */
export const triggerExpiredTimers = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.runQuery(internal.timerSchedule.getDue, { now });

    for (const entry of due) {
      const subs = await ctx.runQuery(internal.timerSchedule.getSubscriptions, {
        userId: entry.userId
      });

      const minutesStudied = Math.max(1, Math.round((entry.endsAtMs - (entry.endsAtMs - 60000)) / 60000));
      const notif = buildTimerNotification(
        {
          _id: entry._id,
          userId: entry.userId,
          endsAtMs: entry.endsAtMs,
          kind: entry.kind,
          variant: entry.variant,
          phaseLabel: entry.phaseLabel
        },
        minutesStudied
      );

      const attempts: { index: number; result: { ok: boolean; status?: number } }[] = [];
      for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        const result = (await ctx.runAction(internal.push.sendPush, {
          endpoint: sub.endpoint,
          subscriptionJson: sub.subscriptionJson,
          title: notif.title,
          body: notif.body,
          tag: notif.tag
        })) as { ok: boolean; status?: number };
        attempts.push({ index: i, result });
      }

      const round = evaluateTimerRound(
        { _id: entry._id, userId: entry.userId, endsAtMs: entry.endsAtMs, kind: entry.kind, variant: entry.variant },
        attempts.map((a) => a.result),
        entry.failCount
      );

      // Delete endpoints the gateway reported as permanently gone.
      for (const idx of round.removeEndpoints ?? []) {
        await ctx.runMutation(internal.timerSchedule.removeSubscription, {
          endpoint: subs[idx].endpoint
        });
      }

      if (round.action === 'fire' || round.action === 'removeSchedule') {
        await ctx.runMutation(internal.timerSchedule.removeSchedule, {
          scheduleId: entry._id
        });
      } else if (round.action === 'retry') {
        await ctx.runMutation(internal.timerSchedule.markRetry, {
          scheduleId: entry._id,
          failCount: round.failCount,
          lastError: round.lastError ?? 'transient'
        });
      }
    }
  }
});
