/**
 * Reminder schedule + push subscription CRUD.
 * Used by the cron job and the client subscription manager.
 */
import { getAuthUserId } from '@convex-dev/auth/server';
import { internalAction, internalQuery, internalMutation, query, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { evaluateReminderRound } from './reminderPolicy';

// ---------------------------------------------------------------------------
// Reminder schedule model
// ---------------------------------------------------------------------------
//
// Reminders fire every 2 hours through the day, starting at 5:00 and ending
// at 23:00 local time (the "12pm" end time from the original request is
// interpreted as the last useful slot of the day). Times are computed in the
// user's own timezone so a reminder never fires at the wrong local hour.

const SLOT_HOURS = [5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

/** Calendar parts (year, month, day, hour) of `epochMs` in `tz`. */
function zonedParts(tz: string, epochMs: number): { y: number; m: number; d: number; h: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(epochMs)).map((p) => [p.type, p.value])
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24
  };
}

/** Epoch ms of the wall-clock time (y-m-d hh:mm) in `tz`. */
function zonedEpoch(tz: string, y: number, m: number, d: number, h: number, min: number): number {
  // Guess using UTC, then correct by the offset at that wall time.
  const guess = Date.UTC(y, m - 1, d, h, min);
  const offset = tzOffsetMs(tz, guess);
  return guess - offset;
}

/** Timezone offset (ms) of `tz` at the given epoch — positive when ahead of UTC. */
function tzOffsetMs(tz: string, epochMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(epochMs)).map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - epochMs;
}

/** Next reminder slot strictly after `now` in `tz` (never the same minute). */
function nextSlotAfter(tz: string, now: number): number {
  const p = zonedParts(tz, now);
  for (const h of SLOT_HOURS) {
    const cand = zonedEpoch(tz, p.y, p.m, p.d, h, 0);
    if (cand > now) return cand;
  }
  // Roll to tomorrow 05:00 (wall-clock, DST-safe).
  const todayStart = zonedEpoch(tz, p.y, p.m, p.d, 0, 0);
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  const tp = zonedParts(tz, tomorrowStart);
  return zonedEpoch(tz, tp.y, tp.m, tp.d, SLOT_HOURS[0], 0);
}

// ---------------------------------------------------------------------------
// Cron helpers (internal only — not callable from clients)
// ---------------------------------------------------------------------------
//
// These functions are only reachable via the `internal.*` API (i.e. from
// server-side code such as the cron's `triggerReminders` internal action).
// They are intentionally `internalQuery`/`internalMutation`: they accept
// arbitrary user IDs / endpoints and contain no authorization checks, so they
// must never be exposed to clients.

/** Find all schedules where nextFireAt <= now. */
export const getDue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('reminderSchedule')
      .withIndex('by_next_fire', (q) => q.lte('nextFireAt', args.now))
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

/** Advance a schedule to the next 2-hour reminder slot (same local day window). */
export const advanceSchedule = internalMutation({
  args: { userId: v.id('users'), now: v.number() },
  handler: async (ctx, args) => {
    const sched = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .first();
    if (!sched) return;
    const next = nextSlotAfter(sched.tz, args.now);
    await ctx.db.patch(sched._id, { nextFireAt: next });
  }
});

/** Remove schedule when no active subscriptions remain. */
export const removeSchedule = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const sched = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .first();
    if (sched) await ctx.db.delete(sched._id);
  }
});

/** Record a failed round — the schedule stays for the next retry window. */
export const markScheduleRetry = internalMutation({
  args: {
    scheduleId: v.id('reminderSchedule'),
    failCount: v.number(),
    lastError: v.string(),
    lastFailedAt: v.number()
  },
  handler: async (ctx, args) => {
    const { scheduleId, ...patch } = args;
    await ctx.db.patch(scheduleId, patch);
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

/**
 * Server-side reminder health for the signed-in user — drives the status
 * line in the reminder banner ("next at HH:MM" vs "needs repair").
 */
export const reminderStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const sched = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .first();
    if (!sched) return { scheduled: false as const };
    return {
      scheduled: true as const,
      nextFireAt: sched.nextFireAt,
      tz: sched.tz,
      failCount: sched.failCount ?? 0,
      lastError: sched.lastError,
      lastFailedAt: sched.lastFailedAt
    };
  }
});

/**
 * Subscribe: upsert subscription + schedule reminders every 2h (5:00–23:00 local).
 *
 * Both upserts insert a NEW document (a pure write with no reads of the
 * affected tables — immune to `OptimisticConcurrencyControlFailure`), then
 * delete the previous docs for the same endpoint / user. Convex does not yet
 * support custom `_id`s on `insert`, so this insert-then-cleanup pattern is
 * the supported equivalent of an exception-based upsert.
 */
export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    subscriptionJson: v.string(),
    reminderTime: v.string(),   // HH:MM 24h (kept for display compat)
    tz: v.string(),             // IANA tz
    activePhaseLabel: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // --- Push subscription (one per endpoint) ------------------------------
    const subId = await ctx.db.insert('pushSubscriptions', {
      userId,
      endpoint: args.endpoint,
      subscriptionJson: args.subscriptionJson
    });

    // Remove any older subscription for the same endpoint so it stays unique.
    const olderSubs = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .collect();
    for (const s of olderSubs) {
      if (s._id !== subId) await ctx.db.delete(s._id);
    }

    // Next 2-hour reminder slot in the user's timezone (5:00–23:00).
    const nextFireAt = nextSlotAfter(args.tz, Date.now());

    // --- Reminder schedule (one per user) ---------------------------------
    const schedId = await ctx.db.insert('reminderSchedule', {
      userId,
      nextFireAt,
      tz: args.tz,
      activePhaseLabel: args.activePhaseLabel
    });

    // Remove any older schedule for this user so it stays unique.
    const olderScheds = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const s of olderScheds) {
      if (s._id !== schedId) await ctx.db.delete(s._id);
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

/** Scans due schedules, sends pushes, then advances / retries / removes. */
export const triggerReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.runQuery(internal.reminders.getDue, { now });

    for (const entry of due) {
      const subs = await ctx.runQuery(internal.reminders.getSubscriptions, {
        userId: entry.userId
      });

      const attempts: { index: number; result: { ok: boolean; status?: number } }[] = [];
      for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        const result = (await ctx.runAction(internal.push.sendPush, {
          endpoint: sub.endpoint,
          subscriptionJson: sub.subscriptionJson,
          title: 'Time to study! 📚',
          body: entry.activePhaseLabel
            ? `Keep going — next up: ${entry.activePhaseLabel}. Open the app and tackle your next step.`
            : "Don't break your streak — open the app and tackle your next step.",
          tag: 'daily-reminder'
        })) as { ok: boolean; status?: number };
        attempts.push({ index: i, result });
      }

      const round = evaluateReminderRound(
        attempts.map((a) => a.result),
        { failCount: entry.failCount }
      );

      // Delete endpoints the gateway reported as permanently gone.
      for (const idx of round.removeEndpoints ?? []) {
        await ctx.runMutation(internal.reminders.removeSubscription, {
          endpoint: subs[idx].endpoint
        });
      }

      if (round.action === 'advance') {
        await ctx.runMutation(internal.reminders.advanceSchedule, {
          userId: entry.userId,
          now
        });
      } else if (round.action === 'retry') {
        await ctx.runMutation(internal.reminders.markScheduleRetry, {
          scheduleId: entry._id,
          failCount: round.failCount,
          lastError: round.lastError ?? 'transient',
          lastFailedAt: now
        });
      } else {
        await ctx.runMutation(internal.reminders.removeSchedule, {
          userId: entry.userId
        });
      }
    }
  }
});
