/**
 * Reminder schedule + push subscription CRUD.
 * Used by the cron job and the client subscription manager.
 */
import { getAuthUserId } from '@convex-dev/auth/server';
import { internalAction, query, mutation } from './_generated/server';
import { api, internal } from './_generated/api';
import { v } from 'convex/values';

// ---------------------------------------------------------------------------
// Cron helpers (internal)
// ---------------------------------------------------------------------------

/** Find all schedules where nextFireAt <= now. */
export const getDue = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('reminderSchedule')
      .withIndex('by_next_fire', (q) => q.lte('nextFireAt', args.now))
      .collect();
  }
});

/** Get all push subscriptions for a user. */
export const getSubscriptions = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
  }
});

/** Remove a stale subscription by endpoint. */
export const removeSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .first();
    if (sub) await ctx.db.delete(sub._id);
  }
});

/** Advance a schedule by +1 day (same local time). */
export const advanceSchedule = mutation({
  args: { userId: v.id('users'), now: v.number() },
  handler: async (ctx, args) => {
    const sched = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();
    if (!sched) return;
    // +24h is safe for DST because nextFireAt is in epoch ms;
    // the client re-computes the next local time when updating.
    await ctx.db.patch(sched._id, { nextFireAt: args.now + 24 * 60 * 60 * 1000 });
  }
});

/** Remove schedule when no active subscriptions remain. */
export const removeSchedule = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const sched = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();
    if (sched) await ctx.db.delete(sched._id);
  }
});

// ---------------------------------------------------------------------------
// Client-facing
// ---------------------------------------------------------------------------

/** Returns the VAPID public key for PushManager.subscribe(). */
export const getVapidKey = query({
  args: {},
  handler: async () => {
    return process.env.VAPID_PUBLIC_KEY ?? null;
  }
});

/** Subscribe: upsert subscription + upsert schedule. */
export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    subscriptionJson: v.string(),
    reminderTime: v.string(),   // HH:MM 24h
    tz: v.string()              // IANA tz
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // Upsert subscription.
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { userId, subscriptionJson: args.subscriptionJson });
    } else {
      await ctx.db.insert('pushSubscriptions', {
        userId,
        endpoint: args.endpoint,
        subscriptionJson: args.subscriptionJson
      });
    }

    // Compute next fire time from reminderTime + tz.
    const [h, m] = args.reminderTime.split(':').map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    // Upsert schedule.
    const sched = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (sched) {
      await ctx.db.patch(sched._id, { nextFireAt: next.getTime(), tz: args.tz });
    } else {
      await ctx.db.insert('reminderSchedule', {
        userId,
        nextFireAt: next.getTime(),
        tz: args.tz
      });
    }
  }
});

/** Unsubscribe: remove all subscriptions + schedule for the user. */
export const unsubscribe = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const subs = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const sub of subs) await ctx.db.delete(sub._id);

    const sched = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (sched) await ctx.db.delete(sched._id);
  }
});

// ---------------------------------------------------------------------------
// Cron-triggered orchestration (called by cron interval via api.*)
// ---------------------------------------------------------------------------

/** Scans due schedules, sends pushes, advances or removes. */
export const triggerReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
      const due = await ctx.runQuery(api.reminders.getDue, { now });

    for (const entry of due) {
      const subs = await ctx.runQuery(api.reminders.getSubscriptions, {
        userId: entry.userId
      });

      let anyActive = false;

      for (const sub of subs) {
        const result = await ctx.runAction(internal.push.sendPush, {
          endpoint: sub.endpoint,
          subscriptionJson: sub.subscriptionJson,
          title: 'Time to study! 📚',
          body: "Don't break your streak — open the app and tackle your next step.",
          tag: 'daily-reminder'
        });

        if (result.remove) {
          await ctx.runMutation(api.reminders.removeSubscription, {
            endpoint: sub.endpoint
          });
        } else if (result.ok) {
          anyActive = true;
        }
      }

      if (anyActive) {
        await ctx.runMutation(api.reminders.advanceSchedule, {
          userId: entry.userId,
          now
        });
      } else {
        await ctx.runMutation(api.reminders.removeSchedule, {
          userId: entry.userId
        });
      }
    }
  }
});
