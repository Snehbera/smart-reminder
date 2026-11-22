import { CheckCheck, Inbox, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ReminderCard, type CardAction } from '../components/ReminderCard';
import type { Reminder } from '../lib/types';

interface Props {
  reminders: Reminder[];
  highlightId: string | null;
  busy: Record<string, CardAction | undefined>;
  onAction: (action: CardAction, reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
}

export function CompletedPage({
  reminders,
  highlightId,
  busy,
  onAction,
  onEdit,
}: Props) {
  const [search, setSearch] = useState('');

  const completedList = useMemo(() => {
    return reminders
      .filter((r) => {
        if (r.status !== 'completed') return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const matchesTitle = r.title.toLowerCase().includes(q);
          const matchesNotes = (r.notes ?? '').toLowerCase().includes(q);
          const matchesCat = r.category.toLowerCase().includes(q);
          if (!matchesTitle && !matchesNotes && !matchesCat) return false;
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.remindAt) - Date.parse(a.remindAt));
  }, [reminders, search]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CheckCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span>Completed Archive</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {completedList.length} completed reminder{completedList.length === 1 ? '' : 's'} (stored for 90 days)
          </p>
        </div>
      </div>

      {/* Search Bar */}
      {reminders.some((r) => r.status === 'completed') && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search completed reminders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 pr-9 text-xs sm:text-sm !py-2.5"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Completed List */}
      {completedList.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <Inbox className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="font-bold text-slate-800 dark:text-slate-200 text-base">
            No completed reminders
          </p>
          <p className="mt-1 max-w-sm text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Reminders you mark done will be archived here for 90 days. You can restore them anytime.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {completedList.map((r) => (
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
