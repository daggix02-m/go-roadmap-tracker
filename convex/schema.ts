/**
 * Convex schema — auth tables + sync snapshot.
 *
 * `authTables` provides the full Auth.js data model: `users`,
 * `authAccounts`, `authSessions`, `authRefreshTokens`, and
 * `authVerificationTokens`. We add a `snapshots` table for
 * cross-device sync (one document per user/device).
 *
 * @see https://labs.convex.dev/auth
 */
import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  // ---- Auth.js tables (managed by @convex-dev/auth) ----
  ...authTables,

  // ---- Sync snapshot (one per user, device-local) ----
  snapshots: defineTable({
    userId: v.id('users'),
    /** Last modified timestamp for LWW conflict resolution. */
    updatedAt: v.number(),
    /** JSON-serialised AppData (everything except timers). */
    data: v.any(),
    /** Human-readable label (e.g. "Chrome · Linux"). */
    deviceLabel: v.optional(v.string())
  })
    .index('by_user', ['userId'])
    .index('by_user_updated', ['userId', 'updatedAt']),

  // ---- Web Push subscription (S11) ----
  pushSubscriptions: defineTable({
    userId: v.id('users'),
    endpoint: v.string(),
    subscriptionJson: v.string()
  })
    .index('by_user', ['userId'])
    .index('by_endpoint', ['endpoint']),

  // ---- Reminder schedule (S11) ----
  reminderSchedule: defineTable({
    userId: v.id('users'),
    /** Next time the cron should fire (epoch ms). */
    nextFireAt: v.number(),
    /** IANA time-zone, e.g. 'Africa/Addis_Ababa'. */
    tz: v.string(),
    /** Human-readable current goal shown in the push, e.g. "Phase 7 — Maps". */
    activePhaseLabel: v.optional(v.string()),
    /** Consecutive failed cron rounds — schedule is dropped at the cap. */
    failCount: v.optional(v.number()),
    /** Last failure kind: 'gone' | 'auth' | 'transient'. */
    lastError: v.optional(v.string()),
    /** When the last failure happened (epoch ms) — drives UI staleness. */
    lastFailedAt: v.optional(v.number())
  })
    .index('by_user', ['userId'])
    .index('by_next_fire', ['nextFireAt']),

  // ---- Focus timer expiry schedule (push notification on completion) ----
  timerSchedule: defineTable({
    userId: v.id('users'),
    /** When the timer expires (epoch ms). */
    endsAtMs: v.number(),
    /** Which kind of timer: 'focus' or 'step'. */
    kind: v.union(v.literal('focus'), v.literal('step')),
    /** Focus variant: 'study' or 'break'. */
    variant: v.optional(v.union(v.literal('study'), v.literal('break'))),
    /** Human-readable phase label for the notification body. */
    phaseLabel: v.optional(v.string()),
    /** Consecutive failed push rounds — schedule is dropped at the cap. */
    failCount: v.optional(v.number())
  })
    .index('by_user', ['userId'])
    .index('by_due', ['endsAtMs'])
});
