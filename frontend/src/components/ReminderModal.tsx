import { AlarmClockPlus, Pencil, X } from 'lucide-react';
import type { Reminder, ReminderInput } from '../lib/types';
import { ReminderForm } from './ReminderForm';

interface Props {
  isOpen: boolean;
  initial?: Reminder;
  onClose: () => void;
  onSubmit: (input: ReminderInput, timeChanged: boolean) => Promise<void>;
}

export function ReminderModal({ isOpen, initial, onClose, onSubmit }: Props) {
  if (!isOpen) return null;

  async function handleSubmit(input: ReminderInput, timeChanged: boolean) {
    await onSubmit(input, timeChanged);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="card relative w-full max-w-lg my-8 overflow-hidden p-5 sm:p-6 shadow-2xl transition max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              {initial ? <Pencil className="h-4 w-4" /> : <AlarmClockPlus className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {initial ? 'Edit Reminder' : 'Configure New Reminder'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {initial ? 'Change schedule, interval or alerts' : 'Set timing, repeat interval and alerts'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ReminderForm
          initial={initial}
          submitLabel={initial ? 'Save changes' : 'Add reminder'}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
