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
  customPlans: Plan[];
  settings: AppSettings;
  global: GlobalActivity;
  progressByPlan: Record<string, PlanProgress>;
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
