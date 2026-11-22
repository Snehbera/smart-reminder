import {
  Bell,
  CheckCircle2,
  Copy,
  Laptop,
  LogIn,
  LogOut,
  Moon,
  Send,
  ShieldCheck,
  Smartphone,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useState } from 'react';
import { getDeviceId } from '../lib/api';
import type { PushState } from '../lib/push';
import type { User } from '../lib/types';

interface Props {
  user: User | null;
  onOpenAuth: () => void;
  onLogout: () => Promise<void>;
  pushState: PushState;
  pushBusy: boolean;
  onEnablePush: () => Promise<void>;
  onTestPush: () => Promise<void>;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  totalReminders: number;
}

export function SettingsPage({
  user,
  onOpenAuth,
  onLogout,
  pushState,
  pushBusy,
  onEnablePush,
  onTestPush,
  theme,
  onToggleTheme,
  totalReminders,
}: Props) {
  const [copied, setCopied] = useState(false);
  const deviceId = getDeviceId();

  const handleCopyDevice = () => {
    navigator.clipboard.writeText(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl mx-auto">
      <div>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Settings & Account
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage your account, web push notifications, and device preferences
        </p>
      </div>

      {/* Account Section */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-indigo-500" />
          <span>Account & Multi-Device Sync</span>
        </h3>

        {user ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-900 dark:text-white">
                  {user.name || 'Account User'}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                  <ShieldCheck className="h-3 w-3" /> Synced
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>

            <button
              onClick={onLogout}
              className="btn-ghost text-xs text-red-600 hover:text-red-700 dark:text-red-400 !py-2 !px-3 self-start sm:self-auto"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> Sign Out
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50/60 to-purple-50/60 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5">
                <Laptop className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                  Sync across phone, tablet, and computer
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  You are currently using guest mode. Creating an account lets you access and receive alerts on any browser or device.
                </p>
              </div>
            </div>
            <button
              onClick={onOpenAuth}
              className="btn-primary !py-2 !px-4 text-xs font-semibold w-full sm:w-auto"
            >
              <LogIn className="h-3.5 w-3.5 mr-1.5" /> Sign In or Create Account
            </button>
          </div>
        )}
      </div>

      {/* Push Notifications Section */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Bell className="h-4 w-4 text-indigo-500" />
          <span>Web Push Notifications</span>
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                Notification Delivery Status
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                {pushState === 'active' ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Active & Registered
                  </span>
                ) : pushState === 'connecting' ? (
                  <span className="text-indigo-600 dark:text-indigo-400">Connecting...</span>
                ) : pushState === 'denied' ? (
                  <span className="text-red-600 dark:text-red-400">Blocked in Browser Settings</span>
                ) : pushState === 'needs-install' ? (
                  <span className="text-amber-600 dark:text-amber-400">Add to Home Screen (iOS)</span>
                ) : (
                  <span className="text-slate-500">Not enabled</span>
                )}
              </span>
            </div>

            {pushState !== 'active' && pushState !== 'denied' && (
              <button
                onClick={onEnablePush}
                disabled={pushBusy}
                className="btn-primary !py-2 !px-3.5 text-xs font-semibold"
              >
                Enable Push
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Test whether pinned alerts can reach this browser right now.
            </p>
            <button
              onClick={onTestPush}
              disabled={pushBusy}
              className="btn-ghost !py-2 !px-3.5 text-xs font-medium shrink-0 flex items-center justify-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5 text-indigo-500" />
              <span>Send Test Notification</span>
            </button>
          </div>
        </div>
      </div>

      {/* Appearance & Preferences */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sun className="h-4 w-4 text-amber-500" />
          <span>Appearance</span>
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 block">
              Color Theme
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Switch between Light and Dark mode
            </span>
          </div>

          <button
            onClick={onToggleTheme}
            className="btn-ghost !py-2 !px-3 text-xs font-semibold flex items-center gap-2"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-4 w-4 text-amber-500" /> <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-indigo-500" /> <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Device & Diagnostics Info */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-slate-500" />
          <span>Device Identity & Database</span>
        </h3>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Total Configured Reminders</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{totalReminders}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Database Engine</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">Cloudflare D1 (SQLite)</span>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="truncate max-w-[200px] sm:max-w-xs">
              <span className="text-slate-500 dark:text-slate-400 block">Device UUID</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate block">
                {deviceId}
              </span>
            </div>
            <button
              onClick={handleCopyDevice}
              className="btn-ghost !p-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white"
              title="Copy Device ID"
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
