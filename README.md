

## Scheduled reminders — deployment checklist

Scheduled study reminders are delivered by a Convex cron job (`convex/cron.ts`,
every 60s) that sends Web Push messages through the `web-push` package. The
in-app "Test" button is local-only, so it can work even when the scheduled
pipeline is not configured. If reminders don't arrive:

1. **Set the VAPID keys** (generate once with
   `npx web-push generate-vapid-keys`, and pick any mailto address):

   ```bash
   npx convex env set VAPID_PUBLIC_KEY <public key>
   npx convex env set VAPID_PRIVATE_KEY <private key>
   npx convex env set VAPID_EMAIL mailto:you@example.com
   ```

   Rotating these keys invalidates existing subscriptions — users will see a
   "Reminders not arriving — repair" button in the reminder banner.

2. **Deploy functions + cron**: `npx convex dev` (or `npx convex deploy`).
   Verify under Dashboard → *Schedules* that `trigger-reminders` exists and
   its runs succeed. Missing VAPID keys show up as errors from
   `reminders:triggerReminders`.

3. **Re-enable reminders in the app** after (re)configuring keys — old
   subscriptions created before the keys existed must be refreshed. The app's
   server-side health indicator (`api.reminders.reminderStatus`) distinguishes
   transient failures (retried up to 5 cron rounds) from permanent ones.
