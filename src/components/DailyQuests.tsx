import React, { useState } from 'react';
import {
  Check,
  Circle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import { Quest, QuestState } from '../types';
import { levelFromXp, xpForLevel } from '../utils/storage';

export const QUEST_TEMPLATES: { title: string; emoji: string; targetMinutes?: number }[] = [
  { title: 'Review yesterday', emoji: '🔁', targetMinutes: 15 },
  { title: 'Read documentation', emoji: '📖', targetMinutes: 20 },
  { title: 'Practice problems', emoji: '🧩', targetMinutes: 30 },
  { title: 'Flashcards', emoji: '🃏', targetMinutes: 10 }
];

function newQuestId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

interface DailyQuestsProps {
  quests: QuestState;
  /** Local day key ('YYYY-MM-DD'). */
  day: string;
  onToggleQuest: (questId: string) => void;
  onAddQuest: (quest: Quest) => void;
  onDeleteQuest: (questId: string) => void;
}

/**
 * Home-page daily routines card: today's checklist plus the XP ledger.
 * Checking quests earns XP; finishing every enabled quest pays a bonus.
 */
export const DailyQuests: React.FC<DailyQuestsProps> = ({
  quests,
  day,
  onToggleQuest,
  onAddQuest,
  onDeleteQuest
}) => {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMinutes, setDraftMinutes] = useState('');
  const onCloseAdd = () => setAdding(false);

  const enabled = quests.items.filter((q) => q.enabled);
  const doneCount = enabled.filter((q) => quests.completions[q.id]?.[day]).length;

  const level = levelFromXp(quests.xp);
  const levelStart = xpForLevel(level);
  const nextStart = xpForLevel(level + 1);
  const levelPct = Math.min(100, ((quests.xp - levelStart) / (nextStart - levelStart)) * 100);

  const addCustom = () => {
    const title = draftTitle.trim();
    if (!title) return;
    const minutes = parseInt(draftMinutes, 10);
    onAddQuest({
      id: newQuestId(),
      title,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(Number.isFinite(minutes) && minutes > 0 ? { targetMinutes: minutes } : {})
    });
    setDraftTitle('');
    setDraftMinutes('');
    setAdding(false);
  };

  const addTemplate = (t: (typeof QUEST_TEMPLATES)[number]) => {
    onAddQuest({
      id: newQuestId(),
      title: t.title,
      emoji: t.emoji,
      targetMinutes: t.targetMinutes,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  };

  if (quests.items.length === 0 && !adding && !editing) {
    // Activation state — templates are the whole show.
    return (
      <section aria-label="Daily quests" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold tracking-tight text-text">Daily quests</h2>
          <span className="font-mono text-[11px] text-faint">0 xp</span>
        </div>
        <p className="text-[13px] text-muted leading-relaxed">
          Small recurring routines that reset every morning — checking them earns XP toward levels.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {QUEST_TEMPLATES.map((t) => (
            <button
              key={t.title}
              onClick={() => addTemplate(t)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-raised text-xs text-muted hover:text-text hover:border-line-strong transition-colors cursor-pointer"
            >
              <span aria-hidden="true">{t.emoji}</span>
              {t.title}
              <span className="font-mono text-[10px] text-faint">{t.targetMinutes}m</span>
            </button>
          ))}
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-dashed border-line-strong text-xs text-muted hover:text-text transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Custom
          </button>
        </div>
        {addRow()}
      </section>
    );
  }

  /** Render-function (not a component) so the inputs never remount mid-typing. */
  function addRow(): React.ReactNode {
    if (!adding) return null;
    return (
      <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          placeholder="New quest…"
          aria-label="Quest name"
          className="flex-1 min-w-[8rem] px-2.5 py-1.5 bg-page border border-line rounded-md text-sm text-text placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
        />
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={draftMinutes}
          onChange={(e) => setDraftMinutes(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          placeholder="min"
          aria-label="Target minutes (optional)"
          className="w-16 px-2 py-1.5 bg-page border border-line rounded-md text-sm font-mono text-text placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={addCustom}
          disabled={!draftTitle.trim()}
          className="px-2.5 py-1.5 rounded-md bg-text text-page text-xs font-semibold disabled:opacity-40 hover:opacity-85 transition-opacity cursor-pointer"
        >
          Add
        </button>
        <button
          onClick={onCloseAdd}
          aria-label="Cancel"
          className="p-1.5 rounded-md text-faint hover:text-text hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Daily quests" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold tracking-tight text-text">Daily quests</h2>
        <span
          className="flex items-center gap-1 font-mono text-[11px]"
          title={`${quests.xp} total experience`}
        >
          <Sparkles className="w-3 h-3 text-warning" aria-hidden="true" />
          <span className="text-text">{quests.xp}</span>
          <span className="text-faint">xp · L{level}</span>
        </span>
      </div>

      {/* Level progress */}
      <div
        className="h-0.5 w-full rounded-full bg-raised overflow-hidden mb-3"
        role="progressbar"
        aria-valuenow={Math.round(levelPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level ${level} progress`}
      >
        <div
          className="h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${levelPct}%` }}
        />
      </div>

      <ul className="space-y-0.5">
        {quests.items.map((q) => {
          const done = !!quests.completions[q.id]?.[day];
          return (
            <li key={q.id}>
              <div
                className={`group flex items-center gap-2.5 px-2 -mx-2 py-1.5 rounded-md transition-colors ${
                  q.enabled ? 'hover:bg-hover' : 'opacity-50'
                }`}
              >
                <button
                  onClick={() => q.enabled && onToggleQuest(q.id)}
                  disabled={!q.enabled}
                  role="checkbox"
                  aria-checked={done}
                  aria-label={`${q.title}${done ? ' — done today' : ''}`}
                  className="shrink-0 cursor-pointer"
                >
                  {done ? (
                    <span className="block w-[18px] h-[18px] rounded-full bg-success flex items-center justify-center">
                      <Check className="w-3 h-3 text-page" strokeWidth={3} />
                    </span>
                  ) : (
                    <Circle className="w-[18px] h-[18px] text-line-strong group-hover:text-accent transition-colors" />
                  )}
                </button>

                <button
                  onClick={() => q.enabled && onToggleQuest(q.id)}
                  disabled={!q.enabled}
                  className={`min-w-0 flex-1 text-left text-[13px] cursor-pointer ${
                    done ? 'text-muted line-through decoration-line-strong' : 'text-text'
                  }`}
                >
                  {q.emoji && (
                    <span className="mr-1.5" aria-hidden="true">
                      {q.emoji}
                    </span>
                  )}
                  {q.title}
                  {q.targetMinutes && (
                    <span className="ml-1.5 font-mono text-[10px] text-faint no-underline">
                      {q.targetMinutes}m
                    </span>
                  )}
                </button>

                {editing && (
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        onAddQuest({
                          ...q,
                          enabled: !q.enabled,
                          updatedAt: Date.now()
                        })
                      }
                      aria-label={q.enabled ? `Disable ${q.title}` : `Enable ${q.title}`}
                      className="px-1.5 py-0.5 rounded font-mono text-[10px] text-muted hover:text-text hover:bg-raised transition-colors cursor-pointer"
                    >
                      {q.enabled ? 'off' : 'on'}
                    </button>
                    <button
                      onClick={() => onDeleteQuest(q.id)}
                      aria-label={`Delete ${q.title}`}
                      className="p-1 rounded text-faint hover:text-danger transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <span className="font-mono text-[11px] text-faint">
          {doneCount}/{enabled.length} today
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-mono text-faint hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            {editing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {editing ? 'done' : 'edit'}
          </button>
          <button
            onClick={() => setAdding((a) => !a)}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-mono text-faint hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            quest
          </button>
        </div>
      </div>

      {addRow()}

      {enabled.length > 0 && doneCount === enabled.length && (
        <p className="mt-2 text-[11px] text-success" role="status">
          All quests complete — bonus XP earned. See you tomorrow.
        </p>
      )}
    </section>
  );
};
