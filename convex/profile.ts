/**
 * Profile & account management.
 *
 * Profile fields (name, avatar, email) live on the `users` auth table, which
 * is separate from the synced `snapshots` blob — so editing them never
 * conflicts with cross-device data sync. Password/email changes require the
 * current password and are performed through the auth library's helpers
 * (`retrieveAccount`, `modifyAccountCredentials`, `invalidateSessions`),
 * which route through the internal `auth:store` mutation.
 */
import {
  getAuthUserId,
  getAuthSessionId,
  retrieveAccount,
  modifyAccountCredentials,
  invalidateSessions
} from '@convex-dev/auth/server';
import { action, internalQuery, mutation } from './_generated/server';
import { api, internal } from './_generated/api';
import { v } from 'convex/values';

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/** The password account id (email) for the current user, or null. */
export const getSelf = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { userId, email: user.email ?? null };
  }
});

/** Upload URL for a new avatar image (Convex file storage). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  }
});

// ---------------------------------------------------------------------------
// Profile mutations
// ---------------------------------------------------------------------------

/** Update display name and/or avatar (image = Convex storageId or URL). */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const patch: Record<string, string> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length > 60) throw new Error('Name is too long (max 60 characters).');
      patch.name = name;
    }
    if (args.image !== undefined) {
      // Empty string clears the avatar; otherwise store the storageId/URL.
      patch.image = args.image;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(userId, patch);
    }
  }
});

// ---------------------------------------------------------------------------
// Email + password (actions — they verify the current password first)
// ---------------------------------------------------------------------------

/** Change the account email. Requires the current password. */
export const changeEmail = action({
  args: {
    currentPassword: v.string(),
    email: v.string()
  },
  handler: async (ctx, args) => {
    const self = await ctx.runQuery(internal.profile.getSelf, {});
    const userId = await getAuthUserId(ctx);
    if (!userId || !self) throw new Error('Not authenticated');
    if (!self.email) throw new Error('No email on this account.');

    const email = args.email.trim().toLowerCase();
    if (!email.includes('@')) throw new Error('Enter a valid email address.');

    // Verify current password against the existing password account.
    const { account, user } = await retrieveAccount(ctx, {
      provider: 'password',
      account: { id: self.email, secret: args.currentPassword }
    });

    // Patch users.email + the password account id in one atomic mutation.
    await ctx.runMutation(api.profile.setEmail, {
      userId: user._id,
      accountId: account._id,
      email
    });
  }
});

/** Change the account password. Requires the current password. */
export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string()
  },
  handler: async (ctx, args) => {
    const self = await ctx.runQuery(internal.profile.getSelf, {});
    const userId = await getAuthUserId(ctx);
    if (!userId || !self) throw new Error('Not authenticated');
    if (!self.email) throw new Error('No email on this account.');

    if (args.newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    // Verify current password, then set the new one.
    const { user } = await retrieveAccount(ctx, {
      provider: 'password',
      account: { id: self.email, secret: args.currentPassword }
    });
    await modifyAccountCredentials(ctx, {
      provider: 'password',
      account: { id: self.email, secret: args.newPassword }
    });

    // Invalidate every other session so a leaked old password stops working.
    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions(ctx, {
      userId: user._id,
      except: sessionId ? [sessionId] : []
    });
  }
});

// ---------------------------------------------------------------------------
// Internal helpers (not exposed to clients)
// ---------------------------------------------------------------------------

/** Atomically set users.email + authAccounts.providerAccountId. */
export const setEmail = mutation({
  args: {
    userId: v.id('users'),
    accountId: v.id('authAccounts'),
    email: v.string()
  },
  handler: async (ctx, args) => {
    // The `users.email` index is unique — a duplicate throws and bubbles up.
    await ctx.db.patch(args.userId, { email: args.email });
    await ctx.db.patch(args.accountId, {
      providerAccountId: args.email,
      emailVerified: args.email
    });
  }
});

/**
 * Permanently delete the user's cloud data: snapshot, push subscriptions,
 * reminder schedule, auth accounts, sessions, refresh tokens and the user doc.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // Sync snapshot.
    const snapshots = await ctx.db
      .query('snapshots')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const s of snapshots) await ctx.db.delete(s._id);

    // Push subscriptions + reminder schedule.
    const subs = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const s of subs) await ctx.db.delete(s._id);

    const schedules = await ctx.db
      .query('reminderSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const s of schedules) await ctx.db.delete(s._id);

    // Auth accounts + sessions + refresh tokens.
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .collect();
    for (const a of accounts) await ctx.db.delete(a._id);

    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
        .collect();
      for (const t of refreshTokens) await ctx.db.delete(t._id);
      await ctx.db.delete(session._id);
    }

    await ctx.db.delete(userId);
  }
});