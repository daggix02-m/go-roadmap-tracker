/**
 * Cron job — fires daily reminders.
 *
 * Runs every minute. The orchestration logic lives in
 * `reminders.triggerReminders` so it can be referenced via the
 * generated `api.*` path that the cron scheduler requires.
 */
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

export const cron = cronJobs();
cron.interval('trigger-reminders', { seconds: 60 }, internal.reminders.triggerReminders);
