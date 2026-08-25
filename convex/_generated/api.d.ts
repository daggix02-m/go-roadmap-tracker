/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as cron from "../cron.js";
import type * as http from "../http.js";
import type * as profile from "../profile.js";
import type * as push from "../push.js";
import type * as reminderPolicy from "../reminderPolicy.js";
import type * as reminders from "../reminders.js";
import type * as snapshots from "../snapshots.js";
import type * as timerPolicy from "../timerPolicy.js";
import type * as timerSchedule from "../timerSchedule.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  cron: typeof cron;
  http: typeof http;
  profile: typeof profile;
  push: typeof push;
  reminderPolicy: typeof reminderPolicy;
  reminders: typeof reminders;
  snapshots: typeof snapshots;
  timerPolicy: typeof timerPolicy;
  timerSchedule: typeof timerSchedule;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
