import { AlertTriangle, CheckCheck, Clock, Plus, Settings } from 'lucide-react';
import type { NavPage, User } from '../lib/types';

interface Props {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  overdueCount: number;
  user: User | null;
}

export function BottomNav({ activePage, onNavigate, overdueCount, user }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 sm:hidden pb-safe">
      <div className="flex items-center justify-around px-2 py-1.5 h-16 max-w-lg mx-auto">
        {/* Upcoming / Home */}
        <button
          type="button"
          onClick={() => onNavigate('upcoming')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activePage === 'upcoming'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Clock className={`h-5 w-5 ${activePage === 'upcoming' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-1">Upcoming</span>
        </button>

        {/* Overdue */}
        <button
          type="button"
          onClick={() => onNavigate('overdue')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${
            activePage === 'overdue'
              ? 'text-amber-600 dark:text-amber-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <AlertTriangle className={`h-5 w-5 ${activePage === 'overdue' ? 'stroke-[2.5]' : ''}`} />
            {overdueCount > 0 && (
              <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white shadow-sm">
                {overdueCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1">Overdue</span>
        </button>

        {/* Center Prominent Add Button */}
        <div className="flex items-center justify-center flex-1 -mt-5">
          <button
            type="button"
            onClick={() => onNavigate('create')}
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition active:scale-95 ${
              activePage === 'create'
                ? 'bg-indigo-700 text-white ring-4 ring-indigo-500/20'
                : 'bg-indigo-600 text-white shadow-indigo-600/30'
            }`}
            aria-label="New Reminder"
          >
            <Plus className="h-6 w-6 stroke-[2.5]" />
          </button>
        </div>

        {/* Completed */}
        <button
          type="button"
          onClick={() => onNavigate('completed')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activePage === 'completed'
              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <CheckCheck className={`h-5 w-5 ${activePage === 'completed' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-1">Done</span>
        </button>

        {/* Settings / Account */}
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activePage === 'settings'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Settings className={`h-5 w-5 ${activePage === 'settings' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-1 truncate max-w-[48px]">
            {user ? 'Account' : 'Settings'}
          </span>
        </button>
      </div>
    </nav>
  );
}
