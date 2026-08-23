import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { NotificationBanner } from './components/NotificationBanner';
import { FilterBar } from './components/FilterBar';
import { PhaseCard } from './components/PhaseCard';
import { DailyFocusBar } from './components/DailyFocusBar';
import { StudyTimerModal } from './components/StudyTimerModal';
import { StatsModal } from './components/StatsModal';
import { GoCheatsheetModal } from './components/GoCheatsheetModal';
import { InstallGuideModal } from './components/InstallGuideModal';
import { AppData, AppSettings, FilterState, Plan, PlanProgress, SECTION_FILTER_PREFIX } from './types';
import {
  loadAppData,
  saveAppData,
  logStudyActivity,
  emptyPlanProgress,
  getLocalDateString
} from './utils/storage';
import { BUILT_IN_PLANS, getAllPlans, getActivePlan, getActivePhase, getPlanProgress } from './data/plans';
import { forkPlan, generatePlanId, validatePlan } from './utils/plans';
import { getProgressSummary } from './data/progress';
import {
  sendDailyReminderNotification,
  playChime,
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
import { PlanEditorModal } from './components/PlanEditorModal';
import { ContributionGraph } from './components/ContributionGraph';
import { ActiveTimerBar } from './components/ActiveTimerBar';

export default function App() {
  const [appData, setAppData] = useState<AppData>(() => loadAppData());
  const [filter, setFilter] = useState<FilterState>({ section: 'ALL', searchQuery: '' });
  const [openCardId, setOpenCardId] = useState<number | null>(null);

  // Modals state
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showCheatsheetModal, setShowCheatsheetModal] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
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

  // Open the active card by default on first load
  useEffect(() => {
    if (activePhase) setOpenCardId((prev) => prev ?? activePhase.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic daily reminder check
  useEffect(() => {
    if (!appData.settings.dailyReminderEnabled || !activePhase) return;

    const interval = setInterval(() => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;

      if (currentTime === appData.settings.dailyReminderTime) {
        sendDailyReminderNotification(activePhase, appData.global.streak, activePlan.name);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [
    appData.settings.dailyReminderEnabled,
    appData.settings.dailyReminderTime,
    appData.global.streak,
    activePhase,
    activePlan.name
  ]);

  // Save state helper
  const handleUpdateData = (updater: (prev: AppData) => AppData) => {
    setAppData((prev) => {
      const next = updater(prev);
      saveAppData(next);
      return next;
    });
  };

  // Direct state reload (for stats modal import/reset)
  const handleStateReload = (newState: AppData) => {
    setAppData(newState);
    saveAppData(newState);
  };

  const handleUpdateSettings = (updater: (prev: AppSettings) => AppSettings) => {
    handleUpdateData((prev) => ({ ...prev, settings: updater(prev.settings) }));
  };

  /** Mutates only the active plan's progress object. */
  const updateProgress = (mutate: (prev: PlanProgress) => PlanProgress) => {
    handleUpdateData((prev) => ({
      ...prev,
      progressByPlan: {
        ...prev.progressByPlan,
        [activePlan.id]: mutate(prev.progressByPlan[activePlan.id] ?? emptyPlanProgress())
      }
    }));
  };

  const handleToggleCriteria = (phaseId: number, criteriaIndex: number) => {
    updateProgress((prev) => ({
      ...prev,
      criteriaChecked: {
        ...prev.criteriaChecked,
        [`${phaseId}_${criteriaIndex}`]: !prev.criteriaChecked[`${phaseId}_${criteriaIndex}`]
      }
    }));
  };

  const handleToggleStep = (phaseId: number, stepIndex: number) => {
    updateProgress((prev) => ({
      ...prev,
      stepChecked: {
        ...prev.stepChecked,
        [`${phaseId}_${stepIndex}`]: !prev.stepChecked[`${phaseId}_${stepIndex}`]
      }
    }));
  };

  const handleToggleComplete = (phaseId: number) => {
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
  };

  const handleSaveNote = (phaseId: number, note: string) => {
    updateProgress((prev) => ({
      ...prev,
      userNotes: {
        ...prev.userNotes,
        [phaseId]: note
      }
    }));
  };

  const handleLogStudySession = (minutes: number) => {
    if (!activePhase) return;
    handleStateReload(logStudyActivity(appData, activePlan.id, activePhase.id, minutes));
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

  const handleStartStepTimer = (phaseId: number, stepIdx: number) => {
    const durationSec =
      stepDurations[`${phaseId}_${stepIdx}`] ?? STEP_TIMER_DEFAULT_SEC;
    setTimersBlob((prev) => ({
      ...prev,
      // Starting a new step replaces any previous one — only one runs at a time.
      step: startTimer(createTimer('step', durationSec, { phaseId, stepIdx }), Date.now())
    }));
  };
  const handlePauseStepTimer = () =>
    setTimersBlob((prev) => ({
      ...prev,
      step: prev.step ? pauseTimer(prev.step, Date.now()) : null
    }));
  const handleResumeStepTimer = () =>
    setTimersBlob((prev) => ({
      ...prev,
      step: prev.step ? startTimer(prev.step, Date.now()) : null
    }));
  const handleCancelStepTimer = () =>
    setTimersBlob((prev) => ({ ...prev, step: null }));

  const handleSetStepDuration = (phaseId: number, stepIdx: number, sec: number) => {
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
  };

  const handleMarkStepDoneToday = (phaseId: number, stepIdx: number) => {
    const key = `${phaseId}_${stepIdx}`;
    updateProgress((prev) => ({
      ...prev,
      stepDoneDay: { ...(prev.stepDoneDay ?? {}), [key]: getLocalDateString() }
    }));
    handleCancelStepTimer();
  };

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

    playChime();
    if ((f.variant ?? 'study') === 'study' && activePhase) {
      const minutes = Math.max(1, Math.round(f.durationSec / 60));
      notifyFocusComplete(
        `phase ${activePhase.id} — ${activePhase.shortTitle ?? activePhase.title}`,
        minutes
      );
      handleUpdateData((prev) =>
        logStudyActivity(prev, activePlan.id, activePhase.id, minutes)
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
    playChime();
  }, [nowMs, timersBlob.step]);

  // Focus timer that finished while the app was fully closed: log once on load.
  useEffect(() => {
    const f = timersBlob.focus;
    if (!f || f.endsAtMs === null || Date.now() < f.endsAtMs) return;
    focusCompletedRef.current = f.endsAtMs;
    if ((f.variant ?? 'study') === 'study' && activePhase) {
      const minutes = Math.max(1, Math.round(f.durationSec / 60));
      handleUpdateData((prev) =>
        logStudyActivity(prev, activePlan.id, activePhase.id, minutes)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectConcept = (concept: string) => {
    setFilter({ section: 'ALL', searchQuery: concept });
  };

  // --- Plan management -----------------------------------------------------

  const handleSelectPlan = (planId: string) => {
    setFilter({ section: 'ALL', searchQuery: '' });
    setOpenCardId(null);
    handleUpdateData((prev) => ({ ...prev, activePlanId: planId }));
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
        activePlanId: newId
      };
    });
    setFilter({ section: 'ALL', searchQuery: '' });
    setOpenCardId(null);
  };

  const handleDeletePlan = (planId: string) => {
    const target = getAllPlans(appData).find((p) => p.id === planId);
    if (!target || target.builtIn) return;
    if (!window.confirm(`Delete "${target.name}" and its progress? This cannot be undone.`)) {
      return;
    }
    handleUpdateData((prev) => {
      const nextProgress = { ...prev.progressByPlan };
      delete nextProgress[planId];
      return {
        ...prev,
        customPlans: prev.customPlans.filter((p) => p.id !== planId),
        progressByPlan: nextProgress,
        activePlanId:
          prev.activePlanId === planId ? BUILT_IN_PLANS[0].id : prev.activePlanId
      };
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
          activePlanId: plan.id
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
        activePlanId: saved.id
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
              onEdit={(planId) => setEditorState({ mode: 'edit', planId })}
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
        />
      )}

      <FilterBar
        plan={activePlan}
        filter={filter}
        onFilterChange={setFilter}
        completedCount={progress.completedPhases.length}
      />

      <main className="max-w-3xl lg:max-w-5xl mx-auto px-4 pt-4 space-y-3">
        {/* Widget-style overview */}
        <ContributionGraph historyMinutes={appData.global.historyMinutes} />

        {/* Intro: the method */}
        {activePlan.method &&
          filter.section === 'ALL' &&
          !filter.searchQuery &&
          filteredPhases.length > 0 && (
            <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            {filteredPhases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                progress={progress}
                isOpen={openCardId === phase.id}
                isActive={!!activePhase && activePhase.id === phase.id && !progress.completedPhases.includes(phase.id)}
                stepTimerApi={{
                  timer: timersBlob.step,
                  nowMs,
                  durations: stepDurations,
                  doneDay: stepDoneDay,
                  today: getLocalDateString(),
                  start: handleStartStepTimer,
                  pause: handlePauseStepTimer,
                  resume: handleResumeStepTimer,
                  cancel: handleCancelStepTimer,
                  setDuration: handleSetStepDuration,
                  markDoneToday: handleMarkStepDoneToday
                }}
                onToggleOpen={() =>
                  setOpenCardId((prev) => (prev === phase.id ? null : phase.id))
                }
                onToggleCriteria={handleToggleCriteria}
                onToggleStep={handleToggleStep}
                onCompletePhase={handleToggleComplete}
                onSaveNote={handleSaveNote}
                onSelectConcept={handleSelectConcept}
              />
            ))}
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

      {editorState && (
        <PlanEditorModal
          plan={editorState.mode === 'edit' ? editorTarget : null}
          onClose={() => setEditorState(null)}
          onSave={handleSavePlan}
        />
      )}
    </div>
  );
}
