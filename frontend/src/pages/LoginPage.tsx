import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';

interface Props {
  onSuccess: (user: User) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function LoginPage({ onSuccess, theme, onToggleTheme }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError('Please enter your email address.');
    if (!password) return setError('Please enter your password.');
    if (mode === 'register' && password.length < 6) {
      return setError('Password must be at least 6 characters.');
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.login(email.trim(), password);
        onSuccess(res.user);
      } else {
        const res = await api.register(email.trim(), password, name.trim() || undefined);
        onSuccess(res.user);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8 transition-colors relative">
      {/* Theme Toggle Top-Right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <button
          onClick={onToggleTheme}
          className="btn-ghost h-9 w-9 !p-0 rounded-xl"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Logo & Title */}
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 mb-3 animate-pop">
            <BellRing className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Smart Reminders
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {mode === 'login'
              ? 'Sign in to access your reminders and receive pinned web push alerts.'
              : 'Create your account to sync reminders across all your devices.'}
          </p>
        </div>

        {/* Card Form */}
        <div className="card mt-6 p-6 sm:p-8 shadow-xl border-slate-200/80 dark:border-slate-800">
          {/* Sign In vs Register Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-semibold transition ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-semibold transition ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Your Name (optional)
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Alex"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input pl-10 text-xs sm:text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10 text-xs sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10 pr-10 text-xs sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-[11px] text-slate-400 mt-1">Must be at least 6 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center !py-2.5 text-sm font-semibold mt-2 shadow-md shadow-indigo-600/20"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'login' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Value Props & Benefits */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Encrypted push alerts even when browser tabs are closed</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Sync across your phone, tablet, and desktop</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span>Zero external trackers — data kept in private Cloudflare D1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
