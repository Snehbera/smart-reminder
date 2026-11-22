import {
  AlarmClock,
  BellRing,
  Check,
  Clock,
  Loader2,
  Pencil,
  Repeat,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNow } from '../hooks/useNow';
import { effectiveAt, formatAgo, formatCountdown, formatDateTime } from '../lib/time';
import { REPEAT_OPTIONS, type Reminder } from '../lib/types';

export type CardAction = 'test' | 'snooze' | 'done' | 'restore' | 'delete';

interface Props {
  reminder: Reminder;
  highlighted: boolean;
  busyAction: CardAction | null;
  onAction: (action: CardAction, reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
}

/** Live countdown. Ticks every second in the last 2 minutes, every 15 s otherwise. */
function Countdown({ target }: { target: Date }) {
  const close = target.getTime() - Date.now() < 120_000;
  const now = useNow(close ? 1000 : 15_000);
  return <>{formatCountdown(target, now)}</>;
}

function Ago({ date }: { date: Date }) {
  const now = useNow(30_000);
  return <>{formatAgo(date, now)}</>;
}

export function ReminderCard({ reminder: r, highlighted, busyAction, onAction, onEdit }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3500);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const completed = r.status === 'completed';
  const sent = r.status === 'sent';
  const snoozed = r.status === 'snoozed';
  const at = effectiveAt(r);
  const repeatLabel = REPEAT_OPTIONS.find((o) => o.value === r.repeatInterval)?.label;
  const busy = busyAction !== null;

  const spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  return (
    <li
      id={`reminder-${r.id}`}
      className={`card relative overflow-hidden p-4 pl-5 transition ${highlighted ? 'animate-flash ring-2 ring-indigo-500' : ''} ${completed ? 'opacity-75' : ''}`}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: r.badgeColor }} aria-hidden />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: r.badgeColor + '22', color: r.badgeColor }}
            >
              {r.category}
            </span>
            {r.repeatInterval !== 'none' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <Repeat className="h-3 w-3" /> {repeatLabel}
              </span>
            )}
            {r.nagMode && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <BellRing className="h-3 w-3" /> Nag
              </span>
            )}
          </div>
          <h3 className={`mt-1.5 break-words text-base font-semibold ${completed ? 'line-through decoration-slate-400' : ''}`}>
            {r.title}
          </h3>
          {r.notes && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-600 dark:text-slate-400">{r.notes}</p>}
        </div>

        <div className="shrink-0 text-right text-xs">
          {completed ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Done
            </span>
          ) : sent ? (
            <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
              <BellRing className="h-3.5 w-3.5" /> Sent{' '}
              {r.lastSentAt ? <Ago date={new Date(r.lastSentAt)} /> : null}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-300">
              {snoozed ? <AlarmClock className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {snoozed ? 'Snoozed · ' : ''}
              <Countdown target={at} />
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {formatDateTime(new Date(r.remindAt))}
        {r.repeatInterval !== 'none' && r.lastSentAt && !sent ? (
          <>
            {' · last alert '}
            <Ago date={new Date(r.lastSentAt)} />
          </>
        ) : null}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <button className="icon-btn" onClick={() => onAction('test', r)} disabled={busy} title="Send this notification to this device now">
          {busyAction === 'test' ? spinner : <Send className="h-3.5 w-3.5" />} Test Alert
        </button>

        {completed ? (
          <button className="icon-btn" onClick={() => onAction('restore', r)} disabled={busy}>
            {busyAction === 'restore' ? spinner : <RotateCcw className="h-3.5 w-3.5" />} Restore
          </button>
        ) : (
          <>
            <button className="icon-btn" onClick={() => onAction('snooze', r)} disabled={busy}>
              {busyAction === 'snooze' ? spinner : <AlarmClock className="h-3.5 w-3.5" />} Snooze +10m
            </button>
            <button
              className="icon-btn text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              onClick={() => onAction('done', r)}
              disabled={busy}
            >
              {busyAction === 'done' ? spinner : <Check className="h-3.5 w-3.5" />} Mark Done
            </button>
          </>
        )}

        <span className="flex-1" />

        <button className="icon-btn" onClick={() => onEdit(r)} disabled={busy}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          className={`icon-btn ${confirmDelete ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'text-red-600 dark:text-red-400'}`}
          onClick={() => (confirmDelete ? onAction('delete', r) : setConfirmDelete(true))}
          disabled={busy}
        >
          {busyAction === 'delete' ? spinner : <Trash2 className="h-3.5 w-3.5" />} {confirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </li>
  );
}
