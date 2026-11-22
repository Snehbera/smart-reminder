import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  LogIn,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { PermissionBanner } from './components/PermissionBanner';
import type { CardAction } from './components/ReminderCard';
import { ReminderList, tabOf, type Tab } from './components/ReminderList';
import { ReminderModal } from './components/ReminderModal';
import { Toasts, type Toast } from './components/Toasts';
import { useTheme } from './hooks/useTheme';
import { ApiError, api, getStoredUser } from './lib/api';
import {
  enableNotifications,
  initialPushState,
  pushSupported,
  registerServiceWorker,
  subscribeAndSync,
  type PushState,
} from './lib/push';
import { formatDateTime } from './lib/time';
import type { Reminder, ReminderInput, User } from './lib/types';

const POLL_MS = 60_000;

export default function App() {
  const { theme, toggle } = useTheme();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, CardAction | undefined>>({});

  // Auth state
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Reminder Modal state
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  const [pushState, setPushState] = useState<PushState>('loading');
  const [pushBusy, setPushBusy] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // ---- toasts -------------------------------------------------------------
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, kind: Toast['kind'] = 'success') => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-2), { id, kind, message }]);
      setTimeout(() => dismissToast(id), kind === 'error' ? 6000 : 3500);
    },
    [dismissToast],
  );
  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

  // ---- Check current authenticated user on mount ---------------------------
  useEffect(() => {
    api
      .getMe()
      .then((u) => setUser(u))
      .catch(() => {
        // Not authenticated with valid session, keep guest or null
      });
  }, []);

  // ---- data ---------------------------------------------------------------
  const refresh = useCallback(async (showError = false) => {
    try {
      setReminders(await api.list());
      setLoadError(null);
    } catch (e) {
      if (showError || e instanceof ApiError) setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const replace = (updated: Reminder) => setReminders((list) => list.map((r) => (r.id === updated.id ? updated : r)));

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  // Auto-sync: tab becomes visible again / window focused / network back / every minute while visible.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    const timer = setInterval(sync, POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      clearInterval(timer);
    };
  }, [refresh]);

  // In local development, trigger the cron checker every 10s so due reminders fire immediately
  useEffect(() => {
    const cronTimer = setInterval(() => {
      fetch('/api/cron').catch(() => {});
    }, 10_000);
    return () => clearInterval(cronTimer);
  }, []);

  // ---- highlight (?highlight=<id> from a notification click, or a message from the service worker) -------------
  const focusReminder = useCallback((id: string) => {
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 5000);
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('highlight');
    if (id) {
      focusReminder(id);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [focusReminder]);

  const switchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightId || switchedFor.current === highlightId) return;
    const target = reminders.find((r) => r.id === highlightId);
    if (target) {
      switchedFor.current = highlightId;
      setTab(tabOf(target));
    }
  }, [highlightId, reminders]);

  // ---- service worker messages ----------------------------------------------
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const msg = event.data as { type?: string; id?: string } | undefined;
      if (!msg?.type) return;
      if (msg.type === 'push-received' || msg.type === 'reminders-changed') void refresh();
      if (msg.type === 'highlight' && msg.id) {
        void refresh();
        focusReminder(msg.id);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [refresh, focusReminder]);

  // ---- push state -----------------------------------------------------------
  const connect = useCallback(async () => {
    setPushState('connecting');
    try {
      await subscribeAndSync();
      setPushState('active');
    } catch (e) {
      console.error('Push registration failed', e);
      setPushState('error');
    }
  }, []);

  useEffect(() => {
    const initial = initialPushState();
    setPushState(initial);
    if (initial === 'connecting') void connect();
    else if (initial === 'default' && pushSupported()) void registerServiceWorker().catch(() => undefined);

    let status: PermissionStatus | null = null;
    const onChange = () => {
      const next = initialPushState();
      setPushState(next);
      if (next === 'connecting') void connect();
    };
    navigator.permissions
      ?.query({ name: 'notifications' as PermissionName })
      .then((s) => {
        status = s;
        s.onchange = onChange;
      })
      .catch(() => undefined);
    return () => {
      if (status) status.onchange = null;
    };
  }, [connect]);

  const handleEnable = async () => {
    setPushBusy(true);
    try {
      const permission = await enableNotifications();
      setPushState(permission === 'granted' ? 'active' : permission === 'denied' ? 'denied' : 'default');
      if (permission === 'granted') toast('Notifications enabled. You will be alerted even when this tab is closed.');
    } catch (e) {
      console.error(e);
      setPushState('error');
      toast('Could not enable notifications: ' + errorMessage(e), 'error');
    } finally {
      setPushBusy(false);
    }
  };

  const handleTest = async () => {
    setPushBusy(true);
    try {
      let result;
      try {
        result = await api.testPush();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          await subscribeAndSync();
          result = await api.testPush();
        } else throw e;
      }
      if (result.sent > 0) toast('Test notification sent — look for the pinned alert.');
      else toast('The push service did not accept the notification. Try "Retry" or re-enable notifications.', 'error');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setPushBusy(false);
    }
  };

  // ---- reminder actions -------------------------------------------------------
  const handleCreate = async (input: ReminderInput) => {
    const created = await api.create(input);
    setReminders((list) => [...list, created]);
    const when = formatDateTime(new Date(created.remindAt));
    toast(
      pushState === 'active'
        ? `Reminder set for ${when}.`
        : `Reminder saved for ${when}. Enable notifications to be alerted.`,
    );
  };

  const handleSaveEdit = async (reminder: Reminder, input: ReminderInput, timeChanged: boolean) => {
    const patch: Record<string, unknown> = {
      title: input.title,
      notes: input.notes,
      category: input.category,
      badgeColor: input.badgeColor,
      repeatInterval: input.repeatInterval,
      nagMode: input.nagMode,
      timezone: input.timezone,
    };
    if (timeChanged) patch.remindAt = input.remindAt;
    replace(await api.update(reminder.id, patch));
    toast('Reminder updated.');
  };

  const handleAction = async (action: CardAction, r: Reminder) => {
    setBusy((b) => ({ ...b, [r.id]: action }));
    try {
      switch (action) {
        case 'test': {
          const res = await api.testReminder(r.id);
          if (res.sent > 0) toast('Test alert sent — check your notifications.');
          else toast('The push service did not accept the test alert.', 'error');
          break;
        }
        case 'snooze':
          replace(await api.snooze(r.id, 10));
          toast('Snoozed for 10 minutes.');
          break;
        case 'done':
          replace(await api.markDone(r));
          toast(r.repeatInterval === 'none' ? 'Marked as done.' : 'Done — next occurrence is scheduled.');
          break;
        case 'restore':
          replace(await api.reopen(r.id, 10));
          toast('Restored — it will alert in 10 minutes.');
          break;
        case 'delete':
          await api.remove(r.id);
          setReminders((list) => list.filter((x) => x.id !== r.id));
          toast('Reminder deleted.');
          break;
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
      void refresh();
    } finally {
      setBusy((b) => ({ ...b, [r.id]: undefined }));
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    toast('Logged out successfully.');
    void refresh();
  };

  // ---- render ---------------------------------------------------------------
  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-5 px-3 sm:px-6 pb-28 pt-4 sm:pt-8">
      {/* Top Navigation Bar */}
      <header className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800/80">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <BellRing className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                Smart Reminders
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Persistent push alerts across your devices
              </p>
            </div>
          </div>

          {/* Mobile Theme Toggle */}
          <div className="flex sm:hidden items-center gap-1.5">
            <button
              onClick={toggle}
              className="btn-ghost h-9 w-9 !p-0"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center justify-end gap-2 flex-wrap sm:flex-nowrap">
          {/* User Account / Profile */}
          {user ? (
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 pl-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200 truncate max-w-[150px] sm:max-w-[200px]">
                <UserIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">{user.name || user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="btn-ghost !p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="btn-secondary !py-2 !px-3 text-xs flex items-center gap-1.5 font-semibold"
            >
              <LogIn className="h-3.5 w-3.5 text-indigo-500" />
              <span>Sign In / Register</span>
            </button>
          )}

          {/* Desktop Theme Toggle */}
          <button
            onClick={toggle}
            className="btn-ghost hidden sm:flex h-9 w-9 !p-0"
            aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Primary "+ Add Reminder" Button */}
          <button
            onClick={() => {
              setEditingReminder(null);
              setReminderModalOpen(true);
            }}
            className="btn-primary !py-2 !px-3.5 text-xs sm:text-sm font-semibold shadow-md shadow-indigo-500/20"
          >
            <Plus className="h-4 w-4 mr-1" />
            <span>Add Reminder</span>
          </button>
        </div>
      </header>

      {/* Web Push Permission Banner */}
      <PermissionBanner
        state={pushState}
        busy={pushBusy}
        onEnable={handleEnable}
        onRetry={() => {
          setPushBusy(true);
          void connect().finally(() => setPushBusy(false));
        }}
        onTest={handleTest}
      />

      {/* Error state alert */}
      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {loadError}
          </span>
          <button className="btn-ghost shrink-0" onClick={() => void refresh(true)}>
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {/* Main Reminders View with Separated Sections & Frequency Filters */}
      <ReminderList
        reminders={reminders}
        loading={loading}
        tab={tab}
        onTabChange={setTab}
        highlightId={highlightId}
        busy={busy}
        onAction={handleAction}
        onSaveEdit={handleSaveEdit}
        onOpenAddModal={() => {
          setEditingReminder(null);
          setReminderModalOpen(true);
        }}
        onEditInModal={(r) => {
          setEditingReminder(r);
          setReminderModalOpen(true);
        }}
      />

      {/* Footer */}
      <footer className="pt-6 text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
        {user ? (
          <p className="flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Reminders and alerts are synced to your account ({user.email}).
          </p>
        ) : (
          <p>
            Reminders are saved to this browser.
            <button
              onClick={() => setAuthModalOpen(true)}
              className="ml-1 text-indigo-600 hover:underline dark:text-indigo-400 font-medium"
            >
              Sign in or create an account
            </button>{' '}
            to sync across multiple devices.
          </p>
        )}
      </footer>

      {/* Mobile Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-5 sm:hidden z-30">
        <button
          onClick={() => {
            setEditingReminder(null);
            setReminderModalOpen(true);
          }}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-indigo-600/30 active:scale-95 transition"
        >
          <Plus className="h-5 w-5" />
          <span>New Reminder</span>
        </button>
      </div>

      {/* Add / Edit Reminder Modal */}
      <ReminderModal
        isOpen={reminderModalOpen}
        initial={editingReminder || undefined}
        onClose={() => {
          setReminderModalOpen(false);
          setEditingReminder(null);
        }}
        onSubmit={async (input, timeChanged) => {
          if (editingReminder) {
            await handleSaveEdit(editingReminder, input, timeChanged);
          } else {
            await handleCreate(input);
          }
        }}
      />

      {/* Login & Registration Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          void refresh();
          toast(`Welcome back, ${u.name || u.email}! Your reminders are now synced.`);
        }}
      />

      {/* Floating notification toasts */}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
