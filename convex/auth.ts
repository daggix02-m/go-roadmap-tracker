/**
 * Convex Auth — email + password (primary).
 *
 * Exports the auth helpers required by the library and the app:
 *   - `auth`       — auth middleware for queries/mutations/actions
 *   - `signIn`     — server-side sign-in action
 *   - `signOut`    — server-side sign-out action
 *   - `store`      — token store to call from client actions
 *   - `isAuthenticated` — query that returns true when a valid session exists
 *
 * Password hashing is built-in (Scrypt via Lucia).
 * No external email provider is required for basic sign-up / sign-in.
 *
 * @see https://labs.convex.dev/auth
 */
import { convexAuth, getAuthUserId } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

// ---------------------------------------------------------------------------
// Auth bootstrap
// ---------------------------------------------------------------------------

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Require email + password on sign-up; minimum 8 characters enforced
      // by the provider. Extend with profile() callback if needed.
      profile: (params) => ({
        email: String(params.email ?? '').toLowerCase().trim(),
        name: params.name ? String(params.name) : undefined
      })
    })
  ],
  session: {
    totalDurationMs: 1000 * 60 * 60 * 24 * 30, // 30 days
    inactiveDurationMs: 1000 * 60 * 60 * 24 * 7 // 7 days idle
  }
});

// ---------------------------------------------------------------------------
// Helper queries / mutations exposed for client convenience
// ---------------------------------------------------------------------------

/** Returns the authenticated Convex user doc, or null. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  }
});
