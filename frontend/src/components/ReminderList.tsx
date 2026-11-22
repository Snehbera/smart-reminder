import {
  AlertTriangle,
  CheckCheck,
  Clock,
  Inbox,
  Plus,
  Repeat,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { effectiveAt } from '../lib/time';
import {
  CATEGORIES,
  type FrequencyFilter,
  type Reminder,
  type ReminderInput,
} from '../lib/types';
import { ReminderCard, type CardAction } from './ReminderCard';
import { ReminderForm } from './ReminderForm';

export type Tab = 'all' | 'upcoming' | 'overdue' | 'completed';

export function tabOf(r: Reminder): 'upcoming' | 'overdue' | 'completed' {
  if (r.status === 'completed') return 'completed';
  if (r.status === 'sent') return 'overdue';
  // If remindAt or snoozedUntil is already in the past, consider it overdue/due
  if (effectiveAt(r).getTime() < Date.now()) return 'overdue';
  return 'upcoming';
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
  onOpenAddModal?: () => void;
  onEditInModal?: (reminder: Reminder) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All Sections' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
];

const FREQUENCY_FILTERS: { id: FrequencyFilter; label: string }[] = [
  { id: 'all', label: 'All Repeat' },
  { id: 'none', label: 'One-time' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

export function ReminderList({
  reminders,
  loading,
  tab,
  onTabChange,
  highlightId,
  busy,
  onAction,
  onSaveEdit,
  onOpenAddModal,
  onEditInModal,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [freqFilter, setFreqFilter] = useState<FrequencyFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Filter reminders by search, frequency, and category
  const filteredReminders = useMemo(() => {
    return reminders.filter((r) => {
      // Frequency filter
      if (freqFilter !== 'all' && r.repeatInterval !== freqFilter) {
        return false;
      }
      // Category filter
      if (categoryFilter !== 'all' && r.category !== categoryFilter) {
        return false;
      }
      // Search keyword filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesTitle = r.title.toLowerCase().includes(q);
        const matchesNotes = (r.notes ?? '').toLowerCase().includes(q);
        const matchesCat = r.category.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNotes && !matchesCat) return false;
      }
      return true;
    });
  }, [reminders, freqFilter, categoryFilter, search]);

  const grouped = useMemo(() => {
    const g: Record<'upcoming' | 'overdue' | 'completed', Reminder[]> = {
      upcoming: [],
      overdue: [],
      completed: [],
    };
    for (const r of filteredReminders) {
      g[tabOf(r)].push(r);
    }
    g.upcoming.sort((a, b) => effectiveAt(a).getTime() - effectiveAt(b).getTime());
    const sentAt = (r: Reminder) => Date.parse(r.lastSentAt ?? r.remindAt);
    g.overdue.sort((a, b) => sentAt(b) - sentAt(a));
    g.completed.sort((a, b) => Date.parse(b.remindAt) - Date.parse(a.remindAt));
    return g;
  }, [filteredReminders]);

  // Total counts for tabs (unfiltered)
  const rawCounts = useMemo(() => {
    const counts = { all: reminders.length, upcoming: 0, overdue: 0, completed: 0 };
    for (const r of reminders) counts[tabOf(r)]++;
    return counts;
  }, [reminders]);

  // Bring highlighted reminder into view
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(
      () => document.getElementById(`reminder-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      80,
    );
    return () => clearTimeout(t);
  }, [highlightId, tab, reminders.length]);

  const handleEditClick = (r: Reminder) => {
    if (onEditInModal) {
      onEditInModal(r);
    } else {
      setEditingId(r.id);
    }
  };

  const renderReminderList = (list: Reminder[]) => (
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
            onEdit={handleEditClick}
          />
        ),
      )}
    </ul>
  );

  const hasAnyFilter = search.trim() !== '' || freqFilter !== 'all' || categoryFilter !== 'all';

  return (
    <section aria-label="Your reminders" className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search reminders by title, notes, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 pr-8 text-xs sm:text-sm py-2"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input py-2 text-xs sm:text-sm w-full sm:w-auto font-medium"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>

            {hasAnyFilter && (
              <button
                onClick={() => {
                  setSearch('');
                  setFreqFilter('all');
                  setCategoryFilter('all');
                }}
                className="btn-ghost !py-2 text-xs text-indigo-600 dark:text-indigo-400 shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Frequency Chips (Once, Daily, Weekly, Monthly, Yearly) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
          <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0 flex items-center gap-1 mr-1">
            <Repeat className="h-3.5 w-3.5" /> Repeat:
          </span>
          {FREQUENCY_FILTERS.map((f) => {
            const active = freqFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFreqFilter(f.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs / Section Selector */}
      <div role="tablist" className="flex gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800/70 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.id === tab;
          const count = rawCounts[t.id];
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.id)}
              className={`flex-1 min-w-[70px] rounded-lg px-2 py-2 text-xs sm:text-sm font-medium transition text-center whitespace-nowrap ${
                active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                  t.id === 'overdue' && count > 0
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-bold'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Rendering */}
      {loading && reminders.length === 0 ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-slate-100 dark:bg-slate-900" />
          ))}
        </div>
      ) : filteredReminders.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Inbox className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 font-semibold text-slate-800 dark:text-slate-200">
            {hasAnyFilter ? 'No matching reminders' : 'No reminders configured'}
          </p>
          <p className="mt-1 max-w-sm text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {hasAnyFilter
              ? 'Try adjusting your search keyword, category, or repeat filter.'
              : 'Add a new reminder to receive persistent push alerts on this device.'}
          </p>
          {onOpenAddModal && (
            <button onClick={onOpenAddModal} className="btn-primary mt-4 py-2 px-4 text-xs sm:text-sm">
              <Plus className="h-4 w-4 mr-1.5" /> Configure Reminder
            </button>
          )}
        </div>
      ) : tab === 'all' ? (
        /* SEPARATED SECTIONS: Overdue, Upcoming, Completed */
        <div className="space-y-6">
          {/* OVERDUE SECTION */}
          {grouped.overdue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[12px]">
                    Overdue / Waiting Action
                  </h3>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    {grouped.overdue.length}
                  </span>
                </div>
              </div>
              {renderReminderList(grouped.overdue)}
            </div>
          )}

          {/* UPCOMING SECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[12px]">
                  Upcoming Reminders
                </h3>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {grouped.upcoming.length}
                </span>
              </div>
              {onOpenAddModal && (
                <button
                  onClick={onOpenAddModal}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              )}
            </div>
            {grouped.upcoming.length > 0 ? (
              renderReminderList(grouped.upcoming)
            ) : (
              <div className="card p-6 text-center text-xs text-slate-400 dark:text-slate-500">
                No upcoming reminders scheduled.
              </div>
            )}
          </div>

          {/* COMPLETED SECTION */}
          {grouped.completed.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <CheckCheck className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[12px]">
                    Completed Reminders
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {grouped.completed.length}
                  </span>
                </div>
              </div>
              {renderReminderList(grouped.completed)}
            </div>
          )}
        </div>
      ) : (
        /* INDIVIDUAL TAB VIEW */
        <div>
          {grouped[tab as 'upcoming' | 'overdue' | 'completed'].length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-10 text-center">
              <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium">No reminders in {tab}</p>
            </div>
          ) : (
            renderReminderList(grouped[tab as 'upcoming' | 'overdue' | 'completed'])
          )}
        </div>
      )}
    </section>
  );
}
