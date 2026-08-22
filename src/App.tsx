import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { NotificationBanner } from './components/NotificationBanner';
import { FilterBar } from './components/FilterBar';
import { PhaseCard } from './components/PhaseCard';
import { DailyFocusBar } from './components/DailyFocusBar';
import { StudyTimerModal } from './components/StudyTimerModal';
import { StatsModal } from './components/StatsModal';
import { GoCheatsheetModal } from './components/GoCheatsheetModal';
import { InstallGuideModal } from './components/InstallGuideModal';
import { FilterState, UserState } from './types';
import { ROADMAP_DATA, ROADMAP_METHOD, WORKING_PRINCIPLE } from './data/roadmapData';
import { loadUserState, saveUserState, recordStudyActivity } from './utils/storage';
import { sendDailyReminderNotification } from './utils/notifications';

export default function App() {
  const [userState, setUserState] = useState<UserState>(() => loadUserState());
  const [filter, setFilter] = useState<FilterState>({
    part: 'ALL',
    searchQuery: ''
  });
  const [openCardId, setOpenCardId] = useState<number | null>(null);

  // Modals state
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showCheatsheetModal, setShowCheatsheetModal] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);

  // PWA install prompt event
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

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

  // Lowest incomplete phase = current focus
  const activePhase = useMemo(() => {
    for (const phase of ROADMAP_DATA) {
      if (!userState.completedPhases.includes(phase.id)) return phase;
    }
    return ROADMAP_DATA[ROADMAP_DATA.length - 1];
  }, [userState.completedPhases]);

  // Open the active card by default on first load
  useEffect(() => {
    setOpenCardId((prev) => prev ?? activePhase.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic daily reminder check
  useEffect(() => {
    if (!userState.dailyReminderEnabled) return;

    const interval = setInterval(() => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;

      if (currentTime === userState.dailyReminderTime) {
        sendDailyReminderNotification(activePhase, userState.streak);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [userState.dailyReminderEnabled, userState.dailyReminderTime, activePhase, userState.streak]);

  // Save state helper
  const handleUpdateState = (updater: (prev: UserState) => UserState) => {
    setUserState((prev) => {
      const next = updater(prev);
      saveUserState(next);
      return next;
    });
  };

  // Direct state reload (for stats modal import/reset)
  const handleStateReload = (newState: UserState) => {
    setUserState(newState);
    saveUserState(newState);
  };

  const handleToggleCriteria = (phaseId: number, criteriaIndex: number) => {
    handleUpdateState((prev) => ({
      ...prev,
      criteriaChecked: {
        ...prev.criteriaChecked,
        [`${phaseId}_${criteriaIndex}`]: !prev.criteriaChecked[`${phaseId}_${criteriaIndex}`]
      }
    }));
  };

  const handleToggleStep = (phaseId: number, stepIndex: number) => {
    handleUpdateState((prev) => ({
      ...prev,
      stepChecked: {
        ...prev.stepChecked,
        [`${phaseId}_${stepIndex}`]: !prev.stepChecked[`${phaseId}_${stepIndex}`]
      }
    }));
  };

  const handleToggleComplete = (phaseId: number) => {
    handleUpdateState((prev) => {
      const isAlreadyComplete = prev.completedPhases.includes(phaseId);
      let next: UserState;

      if (isAlreadyComplete) {
        next = {
          ...prev,
          completedPhases: prev.completedPhases.filter((id) => id !== phaseId)
        };
      } else {
        // Completing a phase also counts as activity for streak purposes
        next = recordStudyActivity(
          {
            ...prev,
            completedPhases: [...prev.completedPhases, phaseId].sort((a, b) => a - b),
            criteriaChecked: Object.fromEntries(
              ROADMAP_DATA.find((p) => p.id === phaseId)!.exit.map((_, i) => [
                `${phaseId}_${i}`,
                true
              ])
            )
          },
          phaseId,
          0
        );
      }

      return next;
    });
  };

  const handleSaveNote = (phaseId: number, note: string) => {
    handleUpdateState((prev) => ({
      ...prev,
      userNotes: {
        ...prev.userNotes,
        [phaseId]: note
      }
    }));
  };

  const handleSelectConcept = (concept: string) => {
    setFilter({
      part: 'ALL',
      searchQuery: concept
    });
  };

  const handleJumpToActive = () => {
    setFilter((prev) => ({ ...prev, part: 'ALL', searchQuery: '' }));
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
    return ROADMAP_DATA.filter((p) => {
      if (filter.part !== 'ALL') {
        if (filter.part === 'DENSE' && !p.dense) return false;
        if (filter.part === 'INCOMPLETE' && userState.completedPhases.includes(p.id)) return false;
        if (filter.part === 'COMPLETED' && !userState.completedPhases.includes(p.id)) return false;
        if (['A', 'B', 'C', 'D'].includes(filter.part) && p.part !== filter.part) return false;
      }

      if (filter.searchQuery.trim()) {
        const q = filter.searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.shortTitle.toLowerCase().includes(q) ||
          p.what.toLowerCase().includes(q) ||
          p.concepts.some((c) => c.toLowerCase().includes(q)) ||
          p.steps.some((s) => s.toLowerCase().includes(q)) ||
          p.exit.some((e) => e.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [filter, userState.completedPhases]);

  return (
    <div className="min-h-screen bg-page text-text pb-24">
      <Header
        userState={userState}
        onOpenStats={() => setShowStatsModal(true)}
        onOpenTimer={() => setShowTimerModal(true)}
        onOpenCheatsheet={() => setShowCheatsheetModal(true)}
        onOpenInstallGuide={() => setShowInstallGuideModal(true)}
        canInstallPwa={!!deferredPrompt}
        onTriggerPwaInstall={handleTriggerPwaInstall}
      />

      <NotificationBanner
        userState={userState}
        activePhase={activePhase}
        onUpdateState={handleUpdateState}
      />

      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        completedCount={userState.completedPhases.length}
      />

      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
        {/* Intro: the method */}
        {filter.part === 'ALL' && !filter.searchQuery && filteredPhases.length > 0 && (
          <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-text">One app, learned by building it</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{ROADMAP_METHOD}</p>
            <div className="mt-3 pt-3 border-t border-line">
              <span className="font-mono text-[11px] uppercase tracking-wider text-faint">
                Working principle
              </span>
              <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {WORKING_PRINCIPLE.map((s, i) => (
                  <li key={i} className="text-xs text-muted flex items-center gap-1.5">
                    <span className="font-mono text-faint">{i + 1}</span>
                    {s.step}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {filteredPhases.length === 0 ? (
          <div className="p-8 rounded-lg border border-line bg-surface text-center">
            <p className="text-sm font-medium text-muted">No phases match your search.</p>
            <button
              onClick={() => setFilter({ part: 'ALL', searchQuery: '' })}
              className="mt-3 px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : (
          filteredPhases.map((phase) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              userState={userState}
              isOpen={openCardId === phase.id}
              isActive={activePhase.id === phase.id && !userState.completedPhases.includes(phase.id)}
              onToggleOpen={() =>
                setOpenCardId((prev) => (prev === phase.id ? null : phase.id))
              }
              onToggleCriteria={handleToggleCriteria}
              onToggleStep={handleToggleStep}
              onCompletePhase={handleToggleComplete}
              onSaveNote={handleSaveNote}
              onSelectConcept={handleSelectConcept}
            />
          ))
        )}

        <footer className="pt-6 pb-2 text-center text-[11px] text-faint">
          Progress is saved locally in your browser.
        </footer>
      </main>

      <DailyFocusBar
        userState={userState}
        onJumpToActive={handleJumpToActive}
        onOpenTimer={() => setShowTimerModal(true)}
      />

      {showTimerModal && (
        <StudyTimerModal
          userState={userState}
          onClose={() => setShowTimerModal(false)}
          onUpdateState={handleStateReload}
        />
      )}

      {showStatsModal && (
        <StatsModal
          userState={userState}
          onClose={() => setShowStatsModal(false)}
          onUpdateState={handleStateReload}
        />
      )}

      <GoCheatsheetModal
        isOpen={showCheatsheetModal}
        onClose={() => setShowCheatsheetModal(false)}
      />

      <InstallGuideModal
        isOpen={showInstallGuideModal}
        onClose={() => setShowInstallGuideModal(false)}
        canInstallPwa={!!deferredPrompt}
        onTriggerPwaInstall={handleTriggerPwaInstall}
      />
    </div>
  );
}
