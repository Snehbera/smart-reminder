import { AlarmClockPlus, BellRing, Loader2, Repeat } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  CATEGORIES,
  REPEAT_OPTIONS,
  categoryColor,
  type CategoryName,
  type Reminder,
  type ReminderInput,
  type RepeatInterval,
} from '../lib/types';
import { browserTimeZone, formatCountdown, localInputToIso, presets, toLocalInputValue } from '../lib/time';

interface Props {
  /** When provided the form edits this reminder instead of creating a new one. */
  initial?: Reminder;
  submitLabel: string;
  onSubmit: (input: ReminderInput, timeChanged: boolean) => Promise<void>;
  onCancel?: () => void;
}

const CHIPS: { label: string; make: () => Date }[] = [
  { label: 'In 1 min', make: () => presets.inMinutes(1) },
  { label: 'In 1 hour', make: () => presets.inMinutes(60) },
  { label: 'Tomorrow 9 AM', make: presets.tomorrowAt9 },
  { label: 'Next Month', make: presets.nextMonth },
  { label: 'Next Year', make: presets.nextYear },
];

const isCategory = (v: string | undefined): v is CategoryName => CATEGORIES.some((c) => c.name === v);

export function ReminderForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const initialWhen = useMemo(
    () => toLocalInputValue(initial ? new Date(initial.remindAt) : presets.inMinutes(60)),
    [initial],
  );

  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [when, setWhen] = useState(initialWhen);
  const [category, setCategory] = useState<CategoryName>(isCategory(initial?.category) ? initial!.category as CategoryName : 'Personal');
  const [repeat, setRepeat] = useState<RepeatInterval>(initial?.repeatInterval ?? 'none');
  const [nag, setNag] = useState(initial?.nagMode ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iso = localInputToIso(when);
  const preview = iso ? formatCountdown(new Date(iso)) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Give your reminder a title.');
    if (!iso) return setError('Pick a valid date and time.');
    const timeChanged = !initial || when !== initialWhen;
    if (timeChanged && new Date(iso).getTime() < Date.now() - 60_000) return setError('Pick a time in the future.');

    setSaving(true);
    try {
      await onSubmit(
        {
          title: title.trim(),
          notes: notes.trim() || null,
          category,
          remindAt: iso,
          timezone: browserTimeZone(),
          repeatInterval: repeat,
          nagMode: nag,
          badgeColor: categoryColor(category),
        },
        timeChanged,
      );
      if (!initial) {
        setTitle('');
        setNotes('');
        setWhen(toLocalInputValue(presets.inMinutes(60)));
        setRepeat('none');
        setNag(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="rem-title" className="sr-only">
          Title
        </label>
        <input
          id="rem-title"
          className="field text-base"
          placeholder="What should I remind you about?"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!!initial}
        />
      </div>

      <div>
        <label htmlFor="rem-notes" className="sr-only">
          Notes
        </label>
        <textarea
          id="rem-notes"
          className="field resize-none"
          rows={2}
          placeholder="Notes (optional)"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="rem-when" className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
          When
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="rem-when"
            type="datetime-local"
            className="field sm:max-w-[16rem]"
            value={when}
            min={initial ? undefined : toLocalInputValue(new Date())}
            onChange={(e) => setWhen(e.target.value)}
          />
          {preview && <span className="text-xs text-slate-500 dark:text-slate-400">{preview}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CHIPS.map((chip) => (
            <button key={chip.label} type="button" className="chip" onClick={() => setWhen(toLocalInputValue(chip.make()))}>
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Category</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((c) => {
            const selected = c.name === category;
            return (
              <button
                key={c.name}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCategory(c.name)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition"
                style={
                  selected
                    ? { borderColor: c.color, backgroundColor: c.color + '22', color: c.color }
                    : undefined
                }
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span className={selected ? '' : 'text-slate-600 dark:text-slate-300'}>{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rem-repeat" className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Repeat className="h-3 w-3" /> Repeat
          </label>
          <select id="rem-repeat" className="field" value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatInterval)}>
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <BellRing className="h-3 w-3" /> Nag Mode
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={nag}
            onClick={() => setNag((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-300 px-3.5 py-2 text-left text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${nag ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${nag ? 'left-[18px]' : 'left-0.5'}`}
              />
            </span>
            <span className="leading-tight text-slate-600 dark:text-slate-300">
              Re-alert every 15 min until Done
            </span>
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlarmClockPlus className="h-4 w-4" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
