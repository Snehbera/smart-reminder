import {
  Clock,
  Inbox,
  Plus,
  Repeat,
  Search,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ReminderCard, type CardAction } from '../components/ReminderCard';
import { effectiveAt } from '../lib/time';
import {
  CATEGORIES,
  type FrequencyFilter,
  type Reminder,
} from '../lib/types';

interface Props {
  reminders: Reminder[];
  loading: boolean;
  highlightId: string | null;
  busy: Record<string, CardAction | undefined>;
  onAction: (action: CardAction, reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onNavigateCreate: () => void;
}

const FREQUENCY_FILTERS: { id: FrequencyFilter; label: string }[] = [
  { id: 'all', label: 'All Repeat' },
  { id: 'none', label: 'One-time' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

export function UpcomingPage({
  reminders,
  loading,
  highlightId,
  busy,
  onAction,
  onEdit,
  onNavigateCreate,
}: Props) {
  const [search, setSearch] = useState('');
  const [freqFilter, setFreqFilter] = useState<FrequencyFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Filter only upcoming reminders (pending/snoozed where effectiveAt >= now)
  const upcomingList = useMemo(() => {
    const now = Date.now();
    return reminders
      .filter((r) => {
        if (r.status === 'completed' || r.status === 'sent') return false;
        if (effectiveAt(r).getTime() < now) return false;

        // Frequency filter
        if (freqFilter !== 'all' && r.repeatInterval !== freqFilter) return false;
        // Category filter
        if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
        // Search filter
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const matchesTitle = r.title.toLowerCase().includes(q);
          const matchesNotes = (r.notes ?? '').toLowerCase().includes(q);
          const matchesCat = r.category.toLowerCase().includes(q);
          if (!matchesTitle && !matchesNotes && !matchesCat) return false;
        }
        return true;
      })
      .sort((a, b) => effectiveAt(a).getTime() - effectiveAt(b).getTime());
  }, [reminders, freqFilter, categoryFilter, search]);

  const hasAnyFilter = search.trim() !== '' || freqFilter !== 'all' || categoryFilter !== 'all';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Page Header with Quick Counter */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Upcoming Reminders</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {upcomingList.length} scheduled alert{upcomingList.length === 1 ? '' : 's'}
          </p>
        </div>

        <button
          onClick={onNavigateCreate}
          className="btn-primary !py-2 !px-3 text-xs flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Add Reminder</span>
        </button>
      </div>

      {/* Search and Filters Card */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search upcoming reminders..."
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

          {/* Category Dropdown */}
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

      {/* Reminders List */}
      {loading && reminders.length === 0 ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-slate-100 dark:bg-slate-900" />
          ))}
        </div>
      ) : upcomingList.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <Inbox className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="font-bold text-slate-800 dark:text-slate-200 text-base">
            {hasAnyFilter ? 'No matching reminders found' : 'No upcoming reminders'}
          </p>
          <p className="mt-1 max-w-sm text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {hasAnyFilter
              ? 'Try clearing your filters or search keywords.'
              : 'Configure a reminder and you will receive a pinned notification even when this app is closed.'}
          </p>
          <button
            onClick={onNavigateCreate}
            className="btn-primary mt-5 py-2.5 px-5 text-xs sm:text-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Configure First Reminder
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {upcomingList.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              highlighted={highlightId === r.id}
              busyAction={busy[r.id] ?? null}
              onAction={onAction}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
