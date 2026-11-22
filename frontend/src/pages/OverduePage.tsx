import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { ReminderCard, type CardAction } from '../components/ReminderCard';
import { effectiveAt } from '../lib/time';
import type { Reminder } from '../lib/types';

interface Props {
  reminders: Reminder[];
  highlightId: string | null;
  busy: Record<string, CardAction | undefined>;
  onAction: (action: CardAction, reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
}

export function OverduePage({
  reminders,
  highlightId,
  busy,
  onAction,
  onEdit,
}: Props) {
  // Overdue = status is 'sent' OR (status in ('pending', 'snoozed') and effectiveAt < now)
  const overdueList = useMemo(() => {
    const now = Date.now();
    return reminders
      .filter((r) => {
        if (r.status === 'completed') return false;
        if (r.status === 'sent') return true;
        return effectiveAt(r).getTime() < now;
      })
      .sort((a, b) => {
        const sentAt = (r: Reminder) => Date.parse(r.lastSentAt ?? r.remindAt);
        return sentAt(b) - sentAt(a);
      });
  }, [reminders]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span>Overdue Reminders</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {overdueList.length} reminder{overdueList.length === 1 ? '' : 's'} waiting for your action
          </p>
        </div>
      </div>

      {/* Info Callout */}
      {overdueList.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <p>
            These reminders have reached their alert time. Tap <strong>✓ Mark Done</strong> to complete
            or <strong>⏰ Snooze 10m</strong> to postpone the alert.
          </p>
        </div>
      )}

      {/* Overdue List */}
      {overdueList.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 mb-3 shadow-sm">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="font-bold text-slate-800 dark:text-slate-200 text-base">
            All caught up!
          </p>
          <p className="mt-1 max-w-sm text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            You have no overdue or unacknowledged reminder alerts. Good job!
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {overdueList.map((r) => (
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
