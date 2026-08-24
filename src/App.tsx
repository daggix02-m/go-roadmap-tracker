import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { NotificationBanner } from './components/NotificationBanner';
import { FilterBar } from './components/FilterBar';
import { PhaseCard } from './components/PhaseCard';
import { DailyFocusBar } from './components/DailyFocusBar';
import { AppData, AppSettings, FilterState, Plan, PlanProgress, Quest, SECTION_FILTER_PREFIX } from './types';
import {
  loadAppData,
  saveAppData,
  logStudyActivity,
  normalizeAppData,
  emptyPlanProgress,
  emptyQuestState,
  syncMinuteQuests,
  toggleQuestCompletion,
  getLocalDateString
} from './utils/storage';
import { BUILT_IN_PLANS, deleteCustomPlan, getAllPlans, getActivePlan, getActivePhase, getPlanProgress } from './data/plans';
import { forkPlan, generatePlanId, validatePlan } from './utils/plans';
import { getProgressSummary } from './data/progress';
import {
  sendDailyReminderNotification,
  playAlarm,
  notifyFocusComplete
} from './utils/notifications';
import {
  STEP_TIMER_DEFAULT_SEC,
  TimerState,
  TimersBlob,
  createTimer,
  loadTimers,
  saveTimers,
  startTimer,
  pauseTimer,
  resetTimer,
  isRunning,
  remainingSeconds,
  formatCountdown
} from './utils/timerEngine';
import { PlanSwitcher } from './components/PlanSwitcher';
import { HomeWidgetCard } from './components/HomeWidgets/WidgetSwitcher';
import { DailyQuests } from './components/DailyQuests';
import { ActiveTimerBar } from './components/ActiveTimerBar';
import { useSync } from './utils/useSync';
import { THEME_CHROME_COLOR } from './utils/themes';

// Heavy modals are lazy-loaded so they don't ship in the initial bundle.
// They only render after the user opens them (stats, timer, cheatsheet, etc.).
const StudyTimerModal = lazy(() =>
  import('./components/StudyTimerModal').then((m) => ({ default: m.StudyTimerModal }))
);
const StatsModal = lazy(() =>
  import('./components/StatsModal').then((m) => ({ default: m.StatsModal }))
);
const GoCheatsheetModal = lazy(() =>
  import('./components/GoCheatsheetModal').then((m) => ({ default: m.GoCheatsheetModal }))
);
const InstallGuideModal = lazy(() =>
  import('./components/InstallGuideModal').then((m) => ({ default: m.InstallGuideModal }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const ConflictModal = lazy(() =>
  import('./components/ConflictModal').then((m) => ({ default: m.ConflictModal }))
);
const PlanEditorModal = lazy(() =>
  import('./components/PlanEditorModal').then((m) => ({ default: m.PlanEditorModal }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);

export default function App() {
  const [appData, setAppData] = useState<AppData>(() => loadAppData());
  const [filter, setFilter] = useState<FilterState>({ section: 'ALL', searchQuery: '' });
  const [openCardId, setOpenCardId] = useState<number | null>(null);

  // Modals state
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showCheatsheetModal, setShowCheatsheetModal] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Cross-device sync engine.
  const { pendingConflicts, resolveConflicts, syncing, lastSyncedAt, pushNow, syncedData } = useSync();
  // Honest sync status for the account menu indicator.
  const syncStatus = { syncing, lastSyncedAt };
  // Flush pending local changes to the cloud BEFORE the session is torn down
  // — the sign-out effect can't push after the token is invalidated.
  const handleBeforeSignOut = useCallback(async () => {
    await pushNow();
  }, [pushNow]);

  // When the sync engine applies a cloud-merged state, surface it into the
  // app's React state so the UI reflects the synced data without a reload.
  useEffect(() => {
    if (syncedData) {
      setAppData(syncedData);
    }
  }, [syncedData]);
  // Plan editor: null = closed; 'new' = creating; planId string = editing that custom plan
  const [editorState, setEditorState] = useState<{ mode: 'new' } | { mode: 'edit'; planId: string } | null>(
    null
  );

  // PWA install prompt event
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // --- Focus timer (device-local; survives reloads via wall-clock deadlines) ---
  const [timersBlob, setTimersBlob] = useState<TimersBlob>(() => loadTimers());
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** endsAtMs of the last focus completion we already logged — prevents double-firing. */
  const focusCompletedRef = useRef<number | null>(null);

  // Register service worker & capture PWA install event
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support unavailable — tracker still works fully online
      });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Active plan & progress (falls back to the built-in Go roadmap)
  const activePlan = useMemo(() => getActivePlan(appData), [appData]);
  const progress = useMemo(
    () => getPlanProgress(appData, activePlan.id),
    [appData, activePlan.id]
  );
  const hasPhases = activePlan.phases.length > 0;
  const activePhase = useMemo(
    () => (hasPhases ? getActivePhase(activePlan, progress) : null),
    [hasPhases, activePlan, progress]
  );
  const progressSummary = useMemo(
    () => getProgressSummary(activePlan, progress),
    [activePlan, progress]
  );

  // Tab title follows the active plan, and shows live focus time while running
  const baseTitle = `${activePlan.name} Tracker`;
  useEffect(() => {
    const f = timersBlob.focus;
    document.title =
      f && isRunning(f)
        ? `${formatCountdown(remainingSeconds(f, nowMs))} — Focus`
        : baseTitle;
  }, [timersBlob.focus, nowMs, baseTitle]);

  // Theme + layout presets: swap CSS variable sets on <html> and keep the
  // PWA status-bar color in step with the active theme.
  const activeTheme = appData.settings.theme ?? 'midnight';
  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_CHROME_COLOR[activeTheme]);
  }, [activeTheme]);

  useEffect(() => {
    document.documentElement.dataset.layout = appData.settings.layout ?? 'dashboard';
  }, [appData.settings.layout]);

  // Open the active card by default on first load
  useEffect(() => {
    if (activePhase) setOpenCardId((prev) => prev ?? activePhase.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleOpen = useCallback((phaseId: number) => {
    setOpenCardId((prev) => (prev === phaseId ? null : phaseId));
  }, []);

  // Periodic in-app reminder check — every 2 hours (5 AM–11 PM local time).
  useEffect(() => {
    if (!appData.settings.dailyReminderEnabled || !activePhase) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const interval = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      // Fire once per 2-hour slot, on the first minute of the hour.
      if (minute === 0 && hour >= 5 && hour <= 23 && hour % 2 === 1) {
        void playAlarm(); // audible in-app fallback alongside the OS notification
        sendDailyReminderNotification(activePhase, appData.global.streak, activePlan.name);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [
    appData.settings.dailyReminderEnabled,
    appData.global.streak,
    activePhase,
    activePlan.name
  ]);

  // Save state helper
  const handleUpdateData = useCallback((updater: (prev: AppData) => AppData) => {
    setAppData((prev) => {
      const next = updater(prev);
      // User action → bump the LWW timestamp so this device wins cross-device
      // merge for LWW fields (settings / global / active plan).
      saveAppData({ ...next, lastModifiedAt: Date.now() });
      return next;
    });
  }, []);

  // Direct state reload (for stats modal import/reset)
  const handleStateReload = useCallback((newState: AppData) => {
    // User-triggered import/reset → bump LWW timestamp too.
    setAppData({ ...newState, lastModifiedAt: Date.now() });
    saveAppData({ ...newState, lastModifiedAt: Date.now() });
  }, []);

  const handleUpdateSettings = useCallback((updater: (prev: AppSettings) => AppSettings) => {
    handleUpdateData((prev) => ({ ...prev, settings: updater(prev.settings) }));
  }, [handleUpdateData]);

  // --- Daily quests ---------------------------------------------------------

  /** After study minutes land, auto-complete any minute-target quests for today. */
  const withQuestSync = useCallback((data: AppData): AppData => {
    const q = data.quests;
    if (!q || q.items.length === 0) return data;
    const day = getLocalDateString();
    return {
      ...data,
      quests: syncMinuteQuests(q, data.global.historyMinutes[day] ?? 0, day, {
        enabledQuestCount: q.items.filter((i) => i.enabled).length
      })
    };
  }, []);

  const handleToggleQuest = useCallback((questId: string) => {
    handleUpdateData((prev) => {
      const q = prev.quests ?? emptyQuestState();
      return {
        ...prev,
        quests: toggleQuestCompletion(q, questId, getLocalDateString(), {
          enabledQuestCount: q.items.filter((i) => i.enabled).length
        })
      };
    });
  }, [handleUpdateData]);

  /** Creates a new quest or applies an edit patch when the id already exists. */
  const handleUpsertQuest = useCallback((quest: Quest) => {
    handleUpdateData((prev) => {
      const q = prev.quests ?? emptyQuestState();
      const items = q.items.some((i) => i.id === quest.id)
        ? q.items.map((i) => (i.id === quest.id ? quest : i))
        : [...q.items, quest];
      return { ...prev, quests: { ...q, items } };
    });
  }, [handleUpdateData]);

  const handleDeleteQuest = useCallback((questId: string) => {
    handleUpdateData((prev) => {
      const q = prev.quests ?? emptyQuestState();
      const completions = { ...q.completions };
      delete completions[questId];
      return {
        ...prev,
        quests: { ...q, items: q.items.filter((i) => i.id !== questId), completions }
      };
    });
  }, [handleUpdateData]);

  /** One-tap showcase: Nord theme + Focus layout + goal ring (+ template quests when none exist). */
  const handleApplyDemoSetup = useCallback(() => {
    handleUpdateData((prev) => {
      let quests = prev.quests ?? emptyQuestState();
      if (quests.items.length === 0) {
        const base = Date.now();
        quests = {
          ...emptyQuestState(),
          items: [
            { id: 'demo_q_review', title: 'Review yesterday', emoji: '🔁', targetMinutes: 15, enabled: true, createdAt: base },
            { id: 'demo_q_docs', title: 'Read documentation', emoji: '📖', targetMinutes: 20, enabled: true, createdAt: base + 1 },
            { id: 'demo_q_practice', title: 'Practice problems', emoji: '🧩', targetMinutes: 30, enabled: true, createdAt: base + 2 },
            { id: 'demo_q_cards', title: 'Flashcards', emoji: '🃏', targetMinutes: 10, enabled: true, createdAt: base + 3 }
          ]
        };
      }
      return {
        ...prev,
        quests,
        settings: { ...prev.settings, theme: 'nord', layout: 'focus', homeWidget: 'ring' }
      };
    });
  }, [handleUpdateData]);

  /** Restore a full JSON backup (Import flow). */
  const handleImportAppData = useCallback(
    (data: Partial<AppData>) => {
      handleStateReload(normalizeAppData(data));
    },
    [handleStateReload]
  );

  /** Add imported plans (or replace everything with them). */
  const handleImportPlans = useCallback(
    (plans: Plan[], replaceAll: boolean) => {
      handleUpdateData((prev) => {
        if (replaceAll) {
          return {
            ...prev,
            customPlans: plans,
            activePlanId: plans[0]?.id ?? prev.activePlanId,
            activePlanUpdatedAt: Date.now(),
            progressByPlan: {}
          };
        }
        // Collision-safe add: re-id any import that clashes with an existing plan.
        const existingIds = new Set(prev.customPlans.map((p) => p.id));
        const toAdd = plans.map((p) =>
          existingIds.has(p.id)
            ? { ...p, id: `${p.id}-imported-${Date.now().toString(36)}` }
            : p
        );
        return {
          ...prev,
          customPlans: [...prev.customPlans, ...toAdd],
          ...(toAdd[0] ? { activePlanId: toAdd[0].id, activePlanUpdatedAt: Date.now() } : {})
        };
      });
    },
    [handleUpdateData]
  );

  /** Mutates only the active plan's progress object. */
  const updateProgress = useCallback((mutate: (prev: PlanProgress) => PlanProgress) => {
    handleUpdateData((prev) => ({
      ...prev,
      progressByPlan: {
        ...prev.progressByPlan,
        [activePlan.id]: mutate(prev.progressByPlan[activePlan.id] ?? emptyPlanProgress())
      }
    }));
  }, [handleUpdateData, activePlan.id]);

  const handleToggleCriteria = useCallback((phaseId: number, criteriaIndex: number) => {
    updateProgress((prev) => ({
      ...prev,
      criteriaChecked: {
        ...prev.criteriaChecked,
        [`${phaseId}_${criteriaIndex}`]: !prev.criteriaChecked[`${phaseId}_${criteriaIndex}`]
      }
    }));
  }, [updateProgress]);

  const handleToggleStep = useCallback((phaseId: number, stepIndex: number) => {
    updateProgress((prev) => ({
      ...prev,
      stepChecked: {
        ...prev.stepChecked,
        [`${phaseId}_${stepIndex}`]: !prev.stepChecked[`${phaseId}_${stepIndex}`]
      }
    }));
  }, [updateProgress]);

  const handleToggleComplete = useCallback((phaseId: number) => {
    const isAlreadyComplete = progress.completedPhases.includes(phaseId);

    if (isAlreadyComplete) {
      updateProgress((prev) => ({
        ...prev,
        completedPhases: prev.completedPhases.filter((id) => id !== phaseId)
      }));
      return;
    }

    // Completing also checks every exit criterion and records activity for the streak.
    handleUpdateData((prev) => {
      const current = prev.progressByPlan[activePlan.id] ?? emptyPlanProgress();
      const phase = activePlan.phases.find((p) => p.id === phaseId);
      const withCompletion: AppData = {
        ...prev,
        progressByPlan: {
          ...prev.progressByPlan,
          [activePlan.id]: {
            ...current,
            completedPhases: [...current.completedPhases, phaseId].sort((a, b) => a - b),
            criteriaChecked: Object.fromEntries(
              (phase?.exit ?? []).map((_, i) => [`${phaseId}_${i}`, true])
            )
          }
        }
      };
      return logStudyActivity(withCompletion, activePlan.id, phaseId, 0);
    });
  }, [updateProgress, handleUpdateData, progress, activePlan]);

  const handleSaveNote = useCallback((phaseId: number, note: string) => {
    updateProgress((prev) => ({
      ...prev,
      userNotes: {
        ...prev.userNotes,
        [phaseId]: note
      }
    }));
  }, [updateProgress]);

  const handleLogStudySession = (minutes: number) => {
    if (!activePhase) return;
    handleStateReload(
      withQuestSync(logStudyActivity(appData, activePlan.id, activePhase.id, minutes))
    );
  };

  // --- Focus timer control (state lives here so it outlives the modal) -----

  const updateFocusTimer = (mutate: (t: TimerState | null) => TimerState | null) => {
    setTimersBlob((prev) => ({ ...prev, focus: mutate(prev.focus) }));
  };

  const handleSelectFocusPreset = (durationSec: number, variant: 'study' | 'break') => {
    focusCompletedRef.current = null;
    updateFocusTimer((prev) => {
      const base = prev ?? createTimer('focus', durationSec);
      return { ...resetTimer(base, durationSec), variant };
    });
  };

  const handleStartFocus = () => updateFocusTimer((t) => (t ? startTimer(t, Date.now()) : t));
  const handlePauseFocus = () => updateFocusTimer((t) => (t ? pauseTimer(t, Date.now()) : t));
  const handleStopFocus = () => {
    focusCompletedRef.current = null;
    updateFocusTimer((t) => (t ? resetTimer(t, t.durationSec) : t));
  };

  // --- Step countdown timers (one active at a time, device-local) ----------

  const stepDurations = progress.stepDurations ?? {};
  const stepDoneDay = progress.stepDoneDay ?? {};

  const handleStartStepTimer = useCallback((phaseId: number, stepIdx: number) => {
    const durationSec =
      stepDurations[`${phaseId}_${stepIdx}`] ?? STEP_TIMER_DEFAULT_SEC;
    setTimersBlob((prev) => ({
      ...prev,
      // Starting a new step replaces any previous one — only one runs at a time.
      step: startTimer(createTimer('step', durationSec, { phaseId, stepIdx }), Date.now())
    }));
  }, [stepDurations]);

  const handlePauseStepTimer = useCallback(() =>
    setTimersBlob((prev) => ({
      ...prev,
      step: prev.step ? pauseTimer(prev.step, Date.now()) : null
    })), []);

  const handleResumeStepTimer = useCallback(() =>
    setTimersBlob((prev) => ({
      ...prev,
      step: prev.step ? startTimer(prev.step, Date.now()) : null
    })), []);

  const handleCancelStepTimer = useCallback(() =>
    setTimersBlob((prev) => ({ ...prev, step: null })), []);

  const handleSetStepDuration = useCallback((phaseId: number, stepIdx: number, sec: number) => {
    const key = `${phaseId}_${stepIdx}`;
    updateProgress((prev) => ({
      ...prev,
      stepDurations: { ...(prev.stepDurations ?? {}), [key]: sec }
    }));
    // If this key owns the live timer, apply the new length immediately.
    setTimersBlob((prev) => {
      if (!prev.step || prev.step.phaseId !== phaseId || prev.step.stepIdx !== stepIdx) return prev;
      return { ...prev, step: resetTimer(prev.step, sec) };
    });
  }, [updateProgress]);

  const handleMarkStepDoneToday = useCallback((phaseId: number, stepIdx: number) => {
    const key = `${phaseId}_${stepIdx}`;
    updateProgress((prev) => ({
      ...prev,
      stepDoneDay: { ...(prev.stepDoneDay ?? {}), [key]: getLocalDateString() }
    }));
    handleCancelStepTimer();
  }, [updateProgress, handleCancelStepTimer]);

  // Persist device-local timers on every change.
  useEffect(() => {
    saveTimers(timersBlob);
  }, [timersBlob]);

  // Single 1-second ticker while any timer runs; instant catch-up on tab focus.
  const anyTimerRunning =
    (timersBlob.focus !== null && timersBlob.focus.endsAtMs !== null) ||
    (timersBlob.step !== null && timersBlob.step.endsAtMs !== null);

  useEffect(() => {
    if (!anyTimerRunning) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    const catchUp = () => setNowMs(Date.now());
    document.addEventListener('visibilitychange', catchUp);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', catchUp);
    };
  }, [anyTimerRunning]);

  // Fire exactly once when the running focus timer crosses zero.
  useEffect(() => {
    const f = timersBlob.focus;
    if (!f || f.endsAtMs === null || nowMs < f.endsAtMs) return;
    if (focusCompletedRef.current === f.endsAtMs) return;
    focusCompletedRef.current = f.endsAtMs;

    void playAlarm();
    if ((f.variant ?? 'study') === 'study' && activePhase) {
      const minutes = Math.max(1, Math.round(f.durationSec / 60));
      notifyFocusComplete(
        `phase ${activePhase.id} — ${activePhase.shortTitle ?? activePhase.title}`,
        minutes
      );
      handleUpdateData((prev) =>
        withQuestSync(logStudyActivity(prev, activePlan.id, activePhase.id, minutes))
      );
    }
    // Frozen at zero ("Done") until a new preset or Stop is chosen.
  }, [nowMs, timersBlob.focus]);

  // Gentle chime the first time a step countdown crosses zero (the prompt
  // itself lives inside the phase card and resurfaces until answered).
  const stepExpiredRef = useRef<number | null>(null);
  useEffect(() => {
    const s = timersBlob.step;
    if (!s || s.endsAtMs === null || nowMs < s.endsAtMs) return;
    if (stepExpiredRef.current === s.endsAtMs) return;
    stepExpiredRef.current = s.endsAtMs;
    void playAlarm();
  }, [nowMs, timersBlob.step]);

  // Focus timer that finished while the app was fully closed: log once on load.
  useEffect(() => {
    const f = timersBlob.focus;
    if (!f || f.endsAtMs === null || Date.now() < f.endsAtMs) return;
    focusCompletedRef.current = f.endsAtMs;
    if ((f.variant ?? 'study') === 'study' && activePhase) {
      const minutes = Math.max(1, Math.round(f.durationSec / 60));
      handleUpdateData((prev) =>
        withQuestSync(logStudyActivity(prev, activePlan.id, activePhase.id, minutes))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectConcept = useCallback((concept: string) => {
    setFilter({ section: 'ALL', searchQuery: concept });
  }, []);

  // --- Plan management -----------------------------------------------------

  const handleSelectPlan = (planId: string) => {
    setFilter({ section: 'ALL', searchQuery: '' });
    setOpenCardId(null);
    handleUpdateData((prev) => ({
      ...prev,
      activePlanId: planId,
      activePlanUpdatedAt: Date.now()
    }));
  };

  const handleForkPlan = (planId: string) => {
    handleUpdateData((prev) => {
      const source = getAllPlans(prev).find((p) => p.id === planId);
      if (!source) return prev;
      const newId = generatePlanId();
      const { plan, progress: forkedProgress } = forkPlan(source, getPlanProgress(prev, planId), newId);
      return {
        ...prev,
        customPlans: [...prev.customPlans, plan],
        progressByPlan: { ...prev.progressByPlan, [newId]: forkedProgress },
        activePlanId: newId,
        activePlanUpdatedAt: Date.now()
      };
    });
    setFilter({ section: 'ALL', searchQuery: '' });
    setOpenCardId(null);
  };

  const handleEditPlan = (planId: string) => {
    const target = getAllPlans(appData).find((p) => p.id === planId);
    if (!target) return;
    if (target.builtIn) {
      // Built-ins are read-only source constants — fork a personal, editable copy
      // (progress carried over so the user continues mid-journey).
      const newId = generatePlanId();
      const { plan, progress: forkedProgress } = forkPlan(target, getPlanProgress(appData, planId), newId);
      handleUpdateData((prev) => ({
        ...prev,
        customPlans: [...prev.customPlans, plan],
        progressByPlan: { ...prev.progressByPlan, [newId]: forkedProgress },
        activePlanId: newId,
        activePlanUpdatedAt: Date.now()
      }));
      setEditorState({ mode: 'edit', planId: newId });
      return;
    }
    setEditorState({ mode: 'edit', planId });
  };

  const handleDeletePlan = (planId: string) => {
    const target = getAllPlans(appData).find((p) => p.id === planId);
    if (!target || target.builtIn) return;
    if (!window.confirm(`Delete "${target.name}" and its progress? This cannot be undone.`)) {
      return;
    }
    // Tombstone instead of hard delete: sync unions plans by id, so a plain
    // absence would be resurrected by any stale remote/cloud copy. The
    // tombstone makes mergePlans treat the deletion as authoritative.
    handleUpdateData((prev) => {
      const next = deleteCustomPlan(prev, planId);
      return next ?? prev;
    });
  };

  const handleImportPlanFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        // Accept both bare plan files ({name, phases...}) and exports ({type:'plan', plan:{...}})
        const candidate =
          parsed && typeof parsed === 'object' && parsed.type === 'plan' && parsed.plan
            ? parsed.plan
            : parsed;
        const plan = validatePlan(candidate);
        if (!plan) {
          alert('Invalid plan file format.');
          return;
        }
        handleUpdateData((prev) => ({
          ...prev,
          customPlans: [...prev.customPlans, plan],
          activePlanId: plan.id,
          activePlanUpdatedAt: Date.now()
        }));
        setFilter({ section: 'ALL', searchQuery: '' });
        setOpenCardId(null);
      } catch {
        alert('Failed to parse plan file.');
      }
    };
    reader.readAsText(file);
  };

  const handleSavePlan = (saved: Plan) => {
    handleUpdateData((prev) => {
      const exists = prev.customPlans.some((p) => p.id === saved.id);
      return {
        ...prev,
        customPlans: exists
          ? prev.customPlans.map((p) => (p.id === saved.id ? saved : p))
          : [...prev.customPlans, saved],
        activePlanId: saved.id,
        activePlanUpdatedAt: Date.now()
      };
    });
    setEditorState(null);
    setFilter({ section: 'ALL', searchQuery: '' });
    setOpenCardId(null);
  };

  const editorTarget =
    editorState?.mode === 'edit'
      ? appData.customPlans.find((p) => p.id === editorState.planId) ?? null
      : null;

  const handleJumpToActive = () => {
    if (!activePhase) return;
    setFilter((prev) => ({ ...prev, section: 'ALL', searchQuery: '' }));
    setOpenCardId(activePhase.id);

    setTimeout(() => {
      const el = document.getElementById(`phase-card-${activePhase.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  };

  const handleTriggerPwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallGuideModal(true);
    }
  };

  const filteredPhases = useMemo(() => {
    return activePlan.phases.filter((p) => {
      if (filter.section !== 'ALL') {
        if (filter.section === 'DENSE' && !p.dense) return false;
        if (filter.section === 'INCOMPLETE' && progress.completedPhases.includes(p.id)) return false;
        if (filter.section === 'COMPLETED' && !progress.completedPhases.includes(p.id)) return false;
        if (filter.section.startsWith(SECTION_FILTER_PREFIX)) {
          const sectionId = filter.section.slice(SECTION_FILTER_PREFIX.length);
          if (p.section !== sectionId) return false;
        }
      }

      if (filter.searchQuery.trim()) {
        const q = filter.searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          (p.shortTitle ?? '').toLowerCase().includes(q) ||
          (p.what ?? '').toLowerCase().includes(q) ||
          (p.concepts ?? []).some((c) => c.toLowerCase().includes(q)) ||
          p.steps.some((s) => s.toLowerCase().includes(q)) ||
          p.exit.some((e) => e.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [activePlan, filter, progress]);

  return (
    <div className="min-h-screen bg-page text-text pb-24">
      {/* Header + timer bar stick together as one unit */}
      <div className="sticky top-0 z-40">
        <Header
          plan={activePlan}
          progress={progressSummary}
          streak={appData.global.streak}
          titleNode={
            <PlanSwitcher
              plans={getAllPlans(appData)}
              activePlanId={activePlan.id}
              progressByPlan={appData.progressByPlan}
              onSelect={handleSelectPlan}
              onFork={handleForkPlan}
              onDelete={handleDeletePlan}
              onImportFile={handleImportPlanFile}
              onCreate={() => setEditorState({ mode: 'new' })}
              onEdit={handleEditPlan}
            />
          }
          onOpenStats={() => setShowStatsModal(true)}
          onOpenTimer={() => hasPhases && setShowTimerModal(true)}
          onOpenCheatsheet={
            activePlan.cheatsheetId ? () => setShowCheatsheetModal(true) : undefined
          }
          onOpenInstallGuide={() => setShowInstallGuideModal(true)}
          canInstallPwa={!!deferredPrompt}
          onTriggerPwaInstall={handleTriggerPwaInstall}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          syncStatus={syncStatus}
          onBeforeSignOut={handleBeforeSignOut}
        />

        {timersBlob.focus &&
          !showTimerModal &&
          (timersBlob.focus.endsAtMs !== null ||
            timersBlob.focus.remainingSec < timersBlob.focus.durationSec) && (
            <ActiveTimerBar
              timer={timersBlob.focus}
              nowMs={nowMs}
              phaseLabel={
                activePhase ? activePhase.shortTitle ?? activePhase.title : 'no active phase'
              }
              onOpenModal={() => setShowTimerModal(true)}
              onToggleRun={() =>
                isRunning(timersBlob.focus!) ? handlePauseFocus() : handleStartFocus()
              }
              onStop={handleStopFocus}
            />
          )}

        {/* Step countdown bar — jumps to the owning phase card on tap. */}
        {timersBlob.step && !showTimerModal && (
          <ActiveTimerBar
            timer={timersBlob.step}
            nowMs={nowMs}
            phaseLabel={(() => {
              const owner = activePlan.phases.find((p) => p.id === timersBlob.step!.phaseId);
              return owner ? owner.shortTitle ?? owner.title : 'unknown phase';
            })()}
            onOpenModal={() => {
              const pid = timersBlob.step?.phaseId;
              if (pid === undefined) return;
              setOpenCardId(pid);
              requestAnimationFrame(() =>
                document
                  .getElementById(`phase-card-${pid}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              );
            }}
            onToggleRun={() =>
              timersBlob.step && isRunning(timersBlob.step)
                ? handlePauseStepTimer()
                : handleResumeStepTimer()
            }
            onStop={handleCancelStepTimer}
          />
        )}
      </div>

      {activePhase && (
        <NotificationBanner
          settings={appData.settings}
          streak={appData.global.streak}
          activePhase={activePhase}
          planName={activePlan.name}
          onUpdateSettings={handleUpdateSettings}
          onOpenInstallGuide={() => setShowInstallGuideModal(true)}
        />
      )}

      <FilterBar
        plan={activePlan}
        filter={filter}
        onFilterChange={setFilter}
        completedCount={progress.completedPhases.length}
      />

      <main className="home-main max-w-3xl lg:max-w-5xl mx-auto px-4 pt-4 space-y-3">
        {/* Widget-style overview — user-selectable activity widget */}
        <HomeWidgetCard
          widget={appData.settings.homeWidget ?? 'contribution'}
          data={{
            historyMinutes: appData.global.historyMinutes,
            dailyFocusGoal: appData.settings.dailyFocusGoal,
            streak: appData.global.streak,
            completedPhases: progress.completedPhases.length,
            totalPhases: activePlan.phases.length,
            totalStudyMinutes: appData.global.totalStudyMinutes,
            planAccent: activePlan.accent
          }}
          onChangeWidget={(id) => handleUpdateSettings((prev) => ({ ...prev, homeWidget: id }))}
        />

        {/* Daily routines + XP */}
        <DailyQuests
          quests={appData.quests ?? emptyQuestState()}
          day={getLocalDateString()}
          onToggleQuest={handleToggleQuest}
          onAddQuest={handleUpsertQuest}
          onDeleteQuest={handleDeleteQuest}
        />

        {/* Intro: the method */}
        {activePlan.method &&
          filter.section === 'ALL' &&
          !filter.searchQuery &&
          filteredPhases.length > 0 && (
            <section className="method-card rounded-lg border border-line bg-surface p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-text">One app, learned by building it</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{activePlan.method}</p>
              {activePlan.principle && activePlan.principle.length > 0 && (
                <div className="mt-3 pt-3 border-t border-line">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-faint">
                    Working principle
                  </span>
                  <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                    {activePlan.principle.map((s, i) => (
                      <li key={i} className="text-xs text-muted flex items-center gap-1.5">
                        <span className="font-mono text-faint">{i + 1}</span>
                        {s.step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

        {filteredPhases.length === 0 ? (
          <div className="p-8 rounded-lg border border-line bg-surface text-center">
            <p className="text-sm font-medium text-muted">
              {hasPhases
                ? 'No phases match your search.'
                : 'This plan has no phases yet.'}
            </p>
            <button
              onClick={() => setFilter({ section: 'ALL', searchQuery: '' })}
              className="mt-3 px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="phase-grid">
            {filteredPhases.map((phase) => {
              // Only the card owning the active step timer needs the live clock.
              // Everyone else gets a frozen value so React.memo can skip re-renders
              // while the 1-second focus timer ticks.
              const ownsStepTimer =
                timersBlob.step !== null && timersBlob.step.phaseId === phase.id;
              const stepTimerApi = ownsStepTimer
                ? {
                    timer: timersBlob.step,
                    durations: stepDurations,
                    doneDay: stepDoneDay,
                    today: getLocalDateString(),
                    start: handleStartStepTimer,
                    pause: handlePauseStepTimer,
                    resume: handleResumeStepTimer,
                    cancel: handleCancelStepTimer,
                    setDuration: handleSetStepDuration,
                    markDoneToday: handleMarkStepDoneToday
                  }
                : undefined;
              return (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  progress={progress}
                  isOpen={openCardId === phase.id}
                  isActive={!!activePhase && activePhase.id === phase.id && !progress.completedPhases.includes(phase.id)}
                  stepTimerApi={stepTimerApi}
                  nowMs={ownsStepTimer ? nowMs : 0}
                  onToggleOpen={() => handleToggleOpen(phase.id)}
                  onToggleCriteria={handleToggleCriteria}
                  onToggleStep={handleToggleStep}
                  onCompletePhase={handleToggleComplete}
                  onSaveNote={handleSaveNote}
                  onSelectConcept={handleSelectConcept}
                />
              );
            })}
          </div>
        )}

        <footer className="pt-6 pb-2 text-center text-[11px] text-faint">
          Progress is saved locally in your browser.
        </footer>
      </main>

      {activePhase && (
        <DailyFocusBar
          activePhase={activePhase}
          totalPhases={activePlan.phases.length}
          completedCount={progress.completedPhases.length}
          onJumpToActive={handleJumpToActive}
          onOpenTimer={() => setShowTimerModal(true)}
        />
      )}

      <Suspense fallback={null}>
        {showTimerModal && activePhase && (
          <StudyTimerModal
            activePhase={activePhase}
            timer={timersBlob.focus}
            nowMs={nowMs}
            onSelectPreset={handleSelectFocusPreset}
            onStart={handleStartFocus}
            onPause={handlePauseFocus}
            onReset={handleStopFocus}
            onClose={() => setShowTimerModal(false)}
          />
        )}

        {showStatsModal && (
          <StatsModal
            appData={appData}
            plan={activePlan}
            progress={progress}
            onClose={() => setShowStatsModal(false)}
            onUpdateData={handleStateReload}
          />
        )}

        {showCheatsheetModal && (
          <GoCheatsheetModal
            isOpen={showCheatsheetModal}
            onClose={() => setShowCheatsheetModal(false)}
          />
        )}

        <InstallGuideModal
          isOpen={showInstallGuideModal}
          onClose={() => setShowInstallGuideModal(false)}
          canInstallPwa={!!deferredPrompt}
          onTriggerPwaInstall={handleTriggerPwaInstall}
        />

        {showAuthModal && (
          <AuthModal onClose={() => setShowAuthModal(false)} />
        )}

        {pendingConflicts && pendingConflicts.length > 0 && (
          <ConflictModal
            conflicts={pendingConflicts}
            onResolve={resolveConflicts}
          />
        )}

        {editorState && (
          <PlanEditorModal
            plan={editorState.mode === 'edit' ? editorTarget : null}
            onClose={() => setEditorState(null)}
            onSave={handleSavePlan}
          />
        )}

        {showSettingsModal && (
          <SettingsModal
            settings={appData.settings}
            onUpdateSettings={handleUpdateSettings}
            appData={appData}
            onClose={() => setShowSettingsModal(false)}
            onOpenAuthModal={() => setShowAuthModal(true)}
            onApplyDemoSetup={handleApplyDemoSetup}
            onImportAppData={handleImportAppData}
            onImportPlans={handleImportPlans}
          />
        )}
      </Suspense>
    </div>
  );
}
