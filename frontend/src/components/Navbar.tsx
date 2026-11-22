import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  Clock,
  LogIn,
  Moon,
  Plus,
  Settings,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import type { NavPage, User } from '../lib/types';

interface Props {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  overdueCount: number;
  user: User | null;
  onOpenAuth: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function Navbar({
  activePage,
  onNavigate,
  overdueCount,
  user,
  onOpenAuth,
  theme,
  onToggleTheme,
}: Props) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-3 sm:px-6">
        {/* Brand Logo & Name */}
        <div
          onClick={() => onNavigate('upcoming')}
          className="flex items-center gap-2.5 cursor-pointer select-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white leading-none">
                Smart Reminders
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Web Push Alerts
            </span>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => onNavigate('upcoming')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activePage === 'upcoming'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Upcoming</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('overdue')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activePage === 'overdue'
                ? 'bg-white text-amber-600 shadow-sm dark:bg-slate-900 dark:text-amber-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Overdue</span>
            {overdueCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 text-white text-[10px] px-1.5 py-0.2 font-bold">
                {overdueCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('completed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activePage === 'completed'
                ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <CheckCheck className="h-4 w-4" />
            <span>Completed</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activePage === 'settings'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
        </nav>

        {/* Desktop & Mobile Actions */}
        <div className="flex items-center gap-2">
          {/* User Account / Profile */}
          {user ? (
            <button
              onClick={() => onNavigate('settings')}
              className="flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-1.5 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition"
              title="Manage Account"
            >
              <UserIcon className="h-3.5 w-3.5 text-indigo-500" />
              <span className="max-w-[100px] truncate hidden md:inline">
                {user.name || user.email}
              </span>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="btn-ghost !py-1.5 !px-2.5 text-xs font-semibold flex items-center gap-1.5"
            >
              <LogIn className="h-3.5 w-3.5 text-indigo-500" />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="btn-ghost h-9 w-9 !p-0"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* "+ New Reminder" Primary Button (desktop only, mobile uses bottom button) */}
          <button
            onClick={() => onNavigate('create')}
            className="btn-primary hidden sm:flex !py-2 !px-3.5 text-xs font-semibold shadow-md shadow-indigo-500/20"
          >
            <Plus className="h-4 w-4 mr-1" />
            <span>New Reminder</span>
          </button>
        </div>
      </div>
    </header>
  );
}
