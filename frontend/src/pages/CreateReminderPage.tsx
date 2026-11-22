import { AlarmClockPlus, ArrowLeft, Pencil } from 'lucide-react';
import { ReminderForm } from '../components/ReminderForm';
import type { Reminder, ReminderInput } from '../lib/types';

interface Props {
  initial?: Reminder | null;
  onSubmit: (input: ReminderInput, timeChanged: boolean) => Promise<void>;
  onCancel: () => void;
}

export function CreateReminderPage({ initial, onSubmit, onCancel }: Props) {
  return (
    <div className="space-y-4 animate-fade-in max-w-2xl mx-auto">
      {/* Top Bar with Back Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost !p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            {initial ? (
              <>
                <Pencil className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Edit Reminder</span>
              </>
            ) : (
              <>
                <AlarmClockPlus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Configure New Reminder</span>
              </>
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {initial
              ? 'Modify schedule, recurrence, or alert notes'
              : 'Set timing, repeat cadence, and pinned web push alerts'}
          </p>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="card p-4 sm:p-6 shadow-sm">
        <ReminderForm
          initial={initial || undefined}
          submitLabel={initial ? 'Save changes' : 'Create reminder'}
          onSubmit={async (input, timeChanged) => {
            await onSubmit(input, timeChanged);
            onCancel(); // navigate back after save
          }}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
