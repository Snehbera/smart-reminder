import { CheckCheck, History, Inbox } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { effectiveAt } from '../lib/time';
import type { Reminder, ReminderInput } from '../lib/types';
import { ReminderCard, type CardAction } from './ReminderCard';
import { ReminderForm } from './ReminderForm';

export type Tab = 'upcoming' | 'overdue' | 'completed';

export function tabOf(r: Reminder): Tab {
  if (r.status === 'completed') return 'completed';
  if (r.status === 'sent') return 'overdue';
  return 'upcoming'; // pending | snoozed
}

interface Props {
  reminders: Reminder[];
  loading: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  highlightId: string | null;
  busy: Record<string, CardAction | undefined>;
  onAction: (action: CardAction, reminder: Reminder) => void;
  onSaveEdit: (reminder: Reminder, input: ReminderInput, timeChanged: boolean) => Promise<void>;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue / Sent' },
  { id: 'completed', label: 'Completed' },
];

const EMPTY: Record<Tab, { icon: typeof Inbox; title: string; hint: string }> = {
  upcoming: { icon: Inbox, title: 'Nothing scheduled', hint: 'Add a reminder above — it will find you even when this tab is closed.' },
  overdue: { icon: History, title: 'No sent reminders waiting', hint: 'Reminders that have alerted but are not marked done show up here.' },
  completed: { icon: CheckCheck, title: 'No completed reminders yet', hint: 'Finished reminders are kept here for 90 days.' },
};

export function ReminderList({ reminders, loading, tab, onTabChange, highlightId, busy, onAction, onSaveEdit }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const g: Record<Tab, Reminder[]> = { upcoming: [], overdue: [], completed: [] };
    for (const r of reminders) g[tabOf(r)].push(r);
    g.upcoming.sort((a, b) => effectiveAt(a).getTime() - effectiveAt(b).getTime());
    const sentAt = (r: Reminder) => Date.parse(r.lastSentAt ?? r.remindAt);
    g.overdue.sort((a, b) => sentAt(b) - sentAt(a));
    g.completed.sort((a, b) => Date.parse(b.remindAt) - Date.parse(a.remindAt));
    return g;
  }, [reminders]);

  // Bring a highlighted reminder (opened from a notification) into view.
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => document.getElementById(`reminder-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => clearTimeout(t);
  }, [highlightId, tab, reminders.length]);

  const list = grouped[tab];
  const Empty = EMPTY[tab];

  return (
    <section aria-label="Your reminders">
      <div role="tablist" className="mb-3 flex gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800/70">
        {TABS.map((t) => {
          const active = t.id === tab;
          const count = grouped[t.id].length;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.id)}
              className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition sm:px-3 ${
                active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                  t.id === 'overdue' && count > 0
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading && reminders.length === 0 ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="card h-28 animate-pulse bg-slate-100 dark:bg-slate-900" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Empty.icon className="h-9 w-9 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 font-medium">{Empty.title}</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{Empty.hint}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((r) =>
            editingId === r.id ? (
              <li key={r.id} className="card animate-pop p-4 sm:p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Edit reminder</h3>
                <ReminderForm
                  initial={r}
                  submitLabel="Save changes"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (input, timeChanged) => {
                    await onSaveEdit(r, input, timeChanged);
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <ReminderCard
                key={r.id}
                reminder={r}
                highlighted={highlightId === r.id}
                busyAction={busy[r.id] ?? null}
                onAction={onAction}
                onEdit={(rem) => setEditingId(rem.id)}
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
}
