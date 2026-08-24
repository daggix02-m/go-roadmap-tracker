'use node';

/**
 * Push notification action — sends a web push to a single subscription.
 * Runs in Node.js ("use node") so it can use the web-push npm package.
 */
import { v } from 'convex/values';
import { internalAction } from './_generated/server';

/**
 * Send a push notification to one subscription endpoint.
 * Called by the cron job for each due reminder.
 */
export const sendPush = internalAction({
  args: {
    endpoint: v.string(),
    subscriptionJson: v.string(),
    title: v.string(),
    body: v.string(),
    icon: v.optional(v.string()),
    tag: v.optional(v.string())
  },
  handler: async (_ctx, args) => {
    const webPush = await import('web-push');

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidEmail) {
      throw new Error('VAPID keys not configured in Convex environment.');
    }

    webPush.default.setVapidDetails(
      vapidEmail,
      vapidPublicKey,
      vapidPrivateKey
    );

    const subscription = JSON.parse(args.subscriptionJson);

    try {
      await webPush.default.sendNotification(
        subscription,
        JSON.stringify({
          title: args.title,
          body: args.body,
          icon: args.icon ?? '/icon-192.png',
          tag: args.tag ?? 'daily-reminder',
          data: { url: '/' }
        })
      );
      return { ok: true };
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      console.error(`Push failed (${status ?? 'unknown'}):`, err);
      // Surface the gateway status so reminderPolicy can classify the
      // failure (gone vs auth vs transient) and decide whether to retry.
      return { ok: false, status };
    }
  }
});
