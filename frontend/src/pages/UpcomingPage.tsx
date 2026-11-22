import {
  Clock,
  Inbox,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Tag,
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

  // Base list of all upcoming (unfiltered) to compute category counts
  const baseUpcoming = useMemo(() => {
    const now = Date.now();
    return reminders.filter((r) => {
      if (r.status === 'completed' || r.status === 'sent') return false;
      return effectiveAt(r).getTime() >= now;
    });
  }, [reminders]);

  // Count per category for the visual category badges
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: baseUpcoming.length };
    for (const c of CATEGORIES) map[c.name] = 0;
    for (const r of baseUpcoming) {
      if (map[r.category] !== undefined) map[r.category]++;
    }
    return map;
  }, [baseUpcoming]);

  // Filter only upcoming reminders based on search, frequency, and category
  const upcomingList = useMemo(() => {
    return baseUpcoming
      .filter((r) => {
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
  }, [baseUpcoming, freqFilter, categoryFilter, search]);

  const hasAnyFilter = search.trim() !== '' || freqFilter !== 'all' || categoryFilter !== 'all';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 100% Mobile-Responsive Header: Never wraps awkwardly */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
              Upcoming
            </h2>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
              {upcomingList.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 ml-10 truncate">
            {upcomingList.length === 1 ? '1 scheduled alert' : `${upcomingList.length} scheduled alerts`}
          </p>
        </div>

        <button
          onClick={onNavigateCreate}
          className="btn-primary !py-1.5 !px-3 sm:!py-2 sm:!px-3.5 text-xs font-semibold shrink-0 whitespace-nowrap flex items-center gap-1.5 shadow-sm active:scale-95 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Add Reminder</span>
        </button>
      </div>

      {/* Filter and Category Controls (New modern pill & carousel approach) */}
      <div className="card p-3 sm:p-4 space-y-3 shadow-sm border-slate-200/80 dark:border-slate-800">
        {/* Search Input Row with Reset */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search reminders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 pr-8 text-xs sm:text-sm !py-2"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {hasAnyFilter && (
            <button
              onClick={() => {
                setSearch('');
                setFreqFilter('all');
                setCategoryFilter('all');
              }}
              className="btn-ghost !py-2 !px-2.5 text-xs text-indigo-600 dark:text-indigo-400 shrink-0 font-medium flex items-center gap-1"
              title="Reset all filters"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>

        {/* Visual Category Badges (Replaced ugly dropdown with modern color-dot pills) */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar text-xs">
            <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0 flex items-center gap-1 text-[11px] mr-0.5">
              <Tag className="h-3 w-3" /> Category:
            </span>

            {/* "All" Category Pill */}
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 shrink-0 ${
                categoryFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              <span>All</span>
              <span className="opacity-60 text-[10px]">({categoryCounts.all ?? 0})</span>
            </button>

            {/* Individual Visual Category Pills */}
            {CATEGORIES.map((c) => {
              const active = categoryFilter === c.name;
              const count = categoryCounts[c.name] ?? 0;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setCategoryFilter(c.name)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 shrink-0 border ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-400 shadow-sm'
                      : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span>{c.name}</span>
                  {count > 0 && <span className="opacity-60 text-[10px]">({count})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Repeat Frequency Filter Chips (With no-scrollbar for clean mobile rendering) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar text-xs border-t border-slate-100 dark:border-slate-800/60 pt-2">
          <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0 flex items-center gap-1 text-[11px] mr-0.5">
            <Repeat className="h-3 w-3" /> Repeat:
          </span>
          {FREQUENCY_FILTERS.map((f) => {
            const active = freqFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFreqFilter(f.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition shrink-0 ${
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
            className="btn-primary mt-5 !py-2.5 !px-5 text-xs sm:text-sm"
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
