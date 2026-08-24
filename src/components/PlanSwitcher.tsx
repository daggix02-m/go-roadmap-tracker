import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Plan, PlanProgress } from '../types';

interface PlanSwitcherProps {
  plans: Plan[];
  activePlanId: string;
  progressByPlan: Record<string, PlanProgress>;
  onSelect: (planId: string) => void;
  onFork: (planId: string) => void;
  onDelete: (planId: string) => void;
  onImportFile: (file: File, onError?: (message: string) => void) => void;
  onCreate: () => void;
  onEdit: (planId: string) => void;
}

export const PlanSwitcher: React.FC<PlanSwitcherProps> = ({
  plans,
  activePlanId,
  progressByPlan,
  onSelect,
  onFork,
  onDelete,
  onImportFile,
  onCreate,
  onEdit
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  /** Plan whose delete button is armed (two-step confirm); null = none. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePlan = plans.find((p) => p.id === activePlanId) ?? plans[0];

  // Close on outside click / Escape
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Clear any armed delete state when the menu closes.
  useEffect(() => {
    if (!isOpen) setConfirmDeleteId(null);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
    };
  }, []);

  if (!activePlan) return null;

  /** Two-step delete: first tap arms, second tap (within 3s) deletes. */
  const handleDeleteClick = (planId: string) => {
    if (confirmDeleteId === planId) {
      if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
      setConfirmDeleteId(null);
      onDelete(planId);
      setIsOpen(false);
      return;
    }
    setConfirmDeleteId(planId);
    if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
    confirmResetTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setFileError(null);
    onImportFile(file, (message) => setFileError(message));
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      {/* Trigger — styled like the old wordmark */}
      <button
        id="plan-switcher-btn"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="min-w-0 text-left cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-hover transition-colors"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm leading-none">{activePlan.emoji}</span>
          <span className="text-sm font-semibold text-text tracking-tight truncate">
            {activePlan.name}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 text-faint transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </span>
        {activePlan.description && (
          <span className="block text-[11px] text-muted truncate">{activePlan.description}</span>
        )}
      </button>

      {isOpen && (
        <div
          role="group"
          aria-label="Switch plan"
          className="absolute top-full left-0 mt-2 w-72 max-h-[70dvh] overflow-y-auto bg-surface border border-line rounded-lg shadow-xl z-50 p-1.5 animate-fade-in"
        >
          {/* Plan list */}
          <ul className="space-y-0.5">
            {plans.map((plan) => {
              const prog = progressByPlan[plan.id];
              const done = prog ? prog.completedPhases.length : 0;
              const isActive = plan.id === activePlanId;
              return (
                <li key={plan.id} className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      onSelect(plan.id);
                      setIsOpen(false);
                    }}
                    aria-current={isActive ? 'true' : undefined}
                    className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors cursor-pointer ${
                      isActive ? 'bg-hover' : 'hover:bg-hover'
                    }`}
                  >
                    <span className="text-base leading-none shrink-0">{plan.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-text truncate">
                        {plan.name}
                        {plan.builtIn && (
                          <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wide text-faint">
                            built-in
                          </span>
                        )}
                      </span>
                      <span className="block font-mono text-[10px] text-faint">
                        {done}/{plan.phases.length} phases
                      </span>
                    </span>
                    {isActive && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                  </button>

                  <button
                    aria-label={`Fork ${plan.name}`}
                    title={`Fork ${plan.name}`}
                    onClick={() => {
                      onFork(plan.id);
                      setIsOpen(false);
                    }}
                    className="min-h-10 min-w-10 flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  <button
                    aria-label={`Edit ${plan.name}`}
                    title={
                      plan.builtIn
                        ? `Copy ${plan.name} into an editable plan`
                        : `Edit ${plan.name}`
                    }
                    onClick={() => {
                      onEdit(plan.id);
                      setIsOpen(false);
                    }}
                    className="min-h-10 min-w-10 flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {!plan.builtIn && (
                    <>
                      <button
                        aria-label={
                          confirmDeleteId === plan.id
                            ? `Confirm delete ${plan.name}`
                            : `Delete ${plan.name}`
                        }
                        title={
                          confirmDeleteId === plan.id
                            ? 'Tap again to confirm'
                            : `Delete ${plan.name}`
                        }
                        onClick={() => handleDeleteClick(plan.id)}
                        className={`min-h-10 min-w-10 flex items-center justify-center rounded-md transition-colors cursor-pointer shrink-0 ${
                          confirmDeleteId === plan.id
                            ? 'bg-danger text-page'
                            : 'text-muted hover:text-danger hover:bg-hover'
                        }`}
                      >
                        {confirmDeleteId === plan.id ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Actions */}
          <div className="mt-1.5 pt-1.5 border-t border-line flex flex-col gap-0.5">
            <button
              onClick={() => {
                onCreate();
                setIsOpen(false);
              }}
              className="flex items-center gap-2 px-2 py-2 rounded-md text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New plan
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-2 py-2 rounded-md text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import plan file…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
            />
            {fileError && <p className="px-2 text-[11px] text-danger">{fileError}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
