// ---------------------------------------------------------------------------
// Multi-plan model (v2)
// ---------------------------------------------------------------------------

/** Accent colors available to plans — subset of the existing theme palette. */
export type AccentColor = 'accent' | 'success' | 'warning' | 'danger';

export interface PlanSection {
  id: string;
  title: string;
}

/** Generic phase — most curriculum fields are optional so simple checklist-style plans work too. */
export interface Phase {
  id: number;
  section: string;
  title: string;
  shortTitle?: string;
  dense?: boolean;
  what?: string;
  estimatedHours?: number;
  concepts?: string[];
  docLinks?: { title: string; url: string }[];
  steps: string[];
  exit: string[];
  proTip?: string;
  codeSnippet?: string;
  codeLanguage?: string;
}

export interface Plan {
  id: string;
  name: string;
  emoji: string;
  accent: AccentColor;
  description?: string;
  /** Intro card copy shown above the phase list. */
  method?: string;
  /** Numbered working-principle steps shown under the method text. */
  principle?: { step: string }[];
  /** Renders the matching cheatsheet button (e.g. 'go'). */
  cheatsheetId?: string;
  builtIn?: boolean;
  sections: PlanSection[];
  phases: Phase[];
  /** Tombstone flag — plan was deleted on another device. */
  deleted?: boolean;
  /** Epoch-ms timestamp for three-way merge LWW resolution. */
  lastModifiedAt?: number;
}

/** Per-plan progress. Keys like `${phaseId}_${idx}` are scoped inside one plan. */
export interface PlanProgress {
  completedPhases: number[];
  criteriaChecked: Record<string, boolean>;
  stepChecked: Record<string, boolean>;
  userNotes: Record<number, string>;
  lastStudiedPhaseId: number | null;
  /** Per-step countdown overrides in seconds; absent key = default 1 hour. */
  stepDurations?: Record<string, number>;
  /** Step marked done via its countdown timer — value is the local day it was done. */
  stepDoneDay?: Record<string, string>;
}

export interface AppSettings {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // HH:MM 24h internally
  /** How times are displayed in the UI. */
  timeFormat: '12h' | '24h';
  /** IANA timezone override for reminders; absent = browser default. */
  timezone?: string;
  /** Per-user daily study-minute goal shown in the stats graph. */
  dailyFocusGoal?: number;
  /** Global color theme preset; absent = Midnight (the built-in dark). */
  theme?: ThemeId;
  /** Home page layout preset; absent = Dashboard. */
  layout?: LayoutPreset;
  /** Which activity widget shows on the home page; absent = contribution grid. */
  homeWidget?: HomeWidgetId;
  /**
   * How sync conflicts auto-resolve; absent/'ask' = always show the modal.
   * Remembered via the conflict dialog, changeable in Settings → Preferences.
   */
  conflictResolution?: ConflictResolutionPref;
}

/** User's standing choice for resolving sync conflicts. */
export const CONFLICT_RESOLUTION_PREFS = ['ask', 'local', 'remote', 'merge'] as const;
export type ConflictResolutionPref = (typeof CONFLICT_RESOLUTION_PREFS)[number];

// ---------------------------------------------------------------------------
// Appearance customization (themes / layouts / home widgets)
// ---------------------------------------------------------------------------

/** Canonical theme id list — order drives picker UI ordering. */
export const THEME_IDS = ['midnight', 'daylight', 'nord', 'dracula'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const LAYOUT_IDS = ['dashboard', 'focus', 'minimal'] as const;
export type LayoutPreset = (typeof LAYOUT_IDS)[number];

export const HOME_WIDGET_IDS = ['contribution', 'calendar', 'bars', 'ring', 'tiles'] as const;
export type HomeWidgetId = (typeof HOME_WIDGET_IDS)[number];

// ---------------------------------------------------------------------------
// Daily quests — recurring day routines with XP
// ---------------------------------------------------------------------------

export interface Quest {
  id: string;
  title: string;
  emoji?: string;
  /** Optional minutes target — auto-completed when enough focus time is logged that day. */
  targetMinutes?: number;
  enabled: boolean;
  createdAt: number;
  /** Bumped on every edit so cross-device merges can resolve LWW per quest. */
  updatedAt?: number;
}

export interface QuestState {
  items: Quest[];
  /** questId -> local day ('YYYY-MM-DD') -> true for each completed day. */
  completions: Record<string, Record<string, boolean>>;
  xp: number;
}

/** Streak/history shared across all plans. */
export interface GlobalActivity {
  streak: number;
  lastActiveDate: string | null;
  historyDates: string[];
  totalStudyMinutes: number;
  /** Minutes studied per local day ('YYYY-MM-DD') — drives the contribution graph. */
  historyMinutes: Record<string, number>;
}

/** Root persisted state (storage key version 2). */
export interface AppData {
  version: 2;
  activePlanId: string;
  /** Timestamp of the last user action that changed activePlanId. */
  activePlanUpdatedAt?: number;
  customPlans: Plan[];
  settings: AppSettings;
  global: GlobalActivity;
  progressByPlan: Record<string, PlanProgress>;
  /** Daily quests (routines) + XP. Absent = user has never used quests. */
  quests?: QuestState;
  /** Epoch-ms timestamp for three-way merge LWW resolution. */
  lastModifiedAt?: number;
}

/**
 * Section filter values:
 *  - 'ALL'
 *  - 'DENSE' | 'INCOMPLETE' | 'COMPLETED'  (special views)
 *  - 'section:<id>'                        (one plan section)
 */
export type SectionFilter =
  | 'ALL'
  | 'DENSE'
  | 'INCOMPLETE'
  | 'COMPLETED'
  | `section:${string}`;

export const SECTION_FILTER_PREFIX = 'section:';

export interface FilterState {
  section: SectionFilter;
  searchQuery: string;
}
