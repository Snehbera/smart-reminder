import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { BottomNav } from './components/BottomNav';
import { Navbar } from './components/Navbar';
import { PermissionBanner } from './components/PermissionBanner';
import type { CardAction } from './components/ReminderCard';
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
import { effectiveAt, formatDateTime } from './lib/time';
import type { NavPage, Reminder, ReminderInput, User } from './lib/types';
import { CompletedPage } from './pages/CompletedPage';
import { CreateReminderPage } from './pages/CreateReminderPage';
import { OverduePage } from './pages/OverduePage';
import { SettingsPage } from './pages/SettingsPage';
import { UpcomingPage } from './pages/UpcomingPage';

const POLL_MS = 60_000;

export default function App() {
  const { theme, toggle } = useTheme();

  // Navigation page state
  const [activePage, setActivePage] = useState<NavPage>('upcoming');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  // Reminders state
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, CardAction | undefined>>({});

  // Auth state
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Web push state
  const [pushState, setPushState] = useState<PushState>('loading');
  const [pushBusy, setPushBusy] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

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

  // Validate logged-in session on mount
  useEffect(() => {
    api
      .getMe()
      .then((u) => setUser(u))
      .catch(() => {
        // Not authenticated, fallback to guest
      });
  }, []);

  // Fetch reminders
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

  // Auto-sync reminders
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

  // Dev cron ticker
  useEffect(() => {
    const cronTimer = setInterval(() => {
      fetch('/api/cron').catch(() => {});
    }, 10_000);
    return () => clearInterval(cronTimer);
  }, []);

  // Calculate overdue count for badges
  const overdueCount = useMemo(() => {
    const now = Date.now();
    return reminders.filter((r) => {
      if (r.status === 'completed') return false;
      if (r.status === 'sent') return true;
      return effectiveAt(r).getTime() < now;
    }).length;
  }, [reminders]);

  // Handle URL highlight
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

  // Listen to Service Worker notifications
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

  // Push subscription management
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

  const handleEnablePush = async () => {
    setPushBusy(true);
    try {
      const permission = await enableNotifications();
      setPushState(permission === 'granted' ? 'active' : permission === 'denied' ? 'denied' : 'default');
      if (permission === 'granted') toast('Notifications enabled. Alerts will arrive even when the app is closed.');
    } catch (e) {
      console.error(e);
      setPushState('error');
      toast('Could not enable notifications: ' + errorMessage(e), 'error');
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
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
      if (result.sent > 0) toast('Test notification sent — check your device notifications.');
      else toast('The push service did not accept the notification. Check settings.', 'error');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setPushBusy(false);
    }
  };

  // Reminder CRUD actions
  const handleCreateReminder = async (input: ReminderInput) => {
    const created = await api.create(input);
    setReminders((list) => [...list, created]);
    setActivePage('upcoming');
    const when = formatDateTime(new Date(created.remindAt));
    toast(
      pushState === 'active'
        ? `Reminder scheduled for ${when}.`
        : `Reminder saved for ${when}. Enable push notifications in Settings to receive alerts.`,
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
    setEditingReminder(null);
    setActivePage('upcoming');
    toast('Reminder updated successfully.');
  };

  const handleAction = async (action: CardAction, r: Reminder) => {
    setBusy((b) => ({ ...b, [r.id]: action }));
    try {
      switch (action) {
        case 'test': {
          const res = await api.testReminder(r.id);
          if (res.sent > 0) toast('Test alert sent to your device.');
          else toast('Could not deliver test alert.', 'error');
          break;
        }
        case 'snooze':
          replace(await api.snooze(r.id, 10));
          toast('Snoozed for 10 minutes.');
          break;
        case 'done':
          replace(await api.markDone(r));
          toast(r.repeatInterval === 'none' ? 'Marked as completed.' : 'Done — rolled to next occurrence.');
          break;
        case 'restore':
          replace(await api.reopen(r.id, 10));
          toast('Restored — alerting in 10 minutes.');
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

  const handleStartEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setActivePage('create');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Navbar */}
      <Navbar
        activePage={activePage}
        onNavigate={(page) => {
          if (page !== 'create') setEditingReminder(null);
          setActivePage(page);
        }}
        overdueCount={overdueCount}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        theme={theme}
        onToggleTheme={toggle}
      />

      {/* Main Container */}
      <main className="mx-auto max-w-4xl px-3 sm:px-6 pt-4 pb-24 sm:pb-12">
        {/* Banner if notifications not enabled */}
        {pushState !== 'active' && activePage !== 'settings' && (
          <div className="mb-4">
            <PermissionBanner
              state={pushState}
              busy={pushBusy}
              onEnable={handleEnablePush}
              onRetry={() => {
                setPushBusy(true);
                void connect().finally(() => setPushBusy(false));
              }}
              onTest={handleTestPush}
            />
          </div>
        )}

        {/* Global Load Error */}
        {loadError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {loadError}
            </span>
            <button className="btn-ghost shrink-0" onClick={() => void refresh(true)}>
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        )}

        {/* Page Routing */}
        {activePage === 'upcoming' && (
          <UpcomingPage
            reminders={reminders}
            loading={loading}
            highlightId={highlightId}
            busy={busy}
            onAction={handleAction}
            onEdit={handleStartEdit}
            onNavigateCreate={() => {
              setEditingReminder(null);
              setActivePage('create');
            }}
          />
        )}

        {activePage === 'overdue' && (
          <OverduePage
            reminders={reminders}
            highlightId={highlightId}
            busy={busy}
            onAction={handleAction}
            onEdit={handleStartEdit}
          />
        )}

        {activePage === 'completed' && (
          <CompletedPage
            reminders={reminders}
            highlightId={highlightId}
            busy={busy}
            onAction={handleAction}
            onEdit={handleStartEdit}
          />
        )}

        {activePage === 'create' && (
          <CreateReminderPage
            initial={editingReminder}
            onSubmit={async (input, timeChanged) => {
              if (editingReminder) {
                await handleSaveEdit(editingReminder, input, timeChanged);
              } else {
                await handleCreateReminder(input);
              }
            }}
            onCancel={() => {
              setEditingReminder(null);
              setActivePage('upcoming');
            }}
          />
        )}

        {activePage === 'settings' && (
          <SettingsPage
            user={user}
            onOpenAuth={() => setAuthModalOpen(true)}
            onLogout={handleLogout}
            pushState={pushState}
            pushBusy={pushBusy}
            onEnablePush={handleEnablePush}
            onTestPush={handleTestPush}
            theme={theme}
            onToggleTheme={toggle}
            totalReminders={reminders.length}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        activePage={activePage}
        onNavigate={(page) => {
          if (page !== 'create') setEditingReminder(null);
          setActivePage(page);
        }}
        overdueCount={overdueCount}
        user={user}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          void refresh();
          toast(`Signed in as ${u.name || u.email}. Reminders are now synced across devices!`);
        }}
      />

      {/* Toast Notifications */}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
