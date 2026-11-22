import { AlarmClockPlus, AlertTriangle, BellRing, Moon, RefreshCw, Sun } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionBanner } from './components/PermissionBanner';
import type { CardAction } from './components/ReminderCard';
import { ReminderForm } from './components/ReminderForm';
import { ReminderList, tabOf, type Tab } from './components/ReminderList';
import { Toasts, type Toast } from './components/Toasts';
import { useTheme } from './hooks/useTheme';
import { ApiError, api } from './lib/api';
import {
  enableNotifications,
  initialPushState,
  pushSupported,
  registerServiceWorker,
  subscribeAndSync,
  type PushState,
} from './lib/push';
import { formatDateTime } from './lib/time';
import type { Reminder, ReminderInput } from './lib/types';

const POLL_MS = 60_000;

export default function App() {
  const { theme, toggle } = useTheme();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, CardAction | undefined>>({});

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
  // This is what makes "Mark Done" taken from the OS notification show up here immediately.
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

    // React to the user changing the permission in browser settings while the page is open.
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
        // The server has no subscription for this browser (e.g. it was purged): re-register once and retry.
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
    setTab('upcoming');
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
          setTab('upcoming');
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

  // ---- render ---------------------------------------------------------------
  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-5 px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight tracking-tight">Smart Reminders</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Alerts that find you, even when this tab is closed</p>
          </div>
        </div>
        <button
          onClick={toggle}
          className="btn-ghost h-10 w-10 !p-0"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

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

      <section className="card p-4 sm:p-5" aria-label="Create a reminder">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          <AlarmClockPlus className="h-4 w-4" /> New reminder
        </h2>
        <ReminderForm submitLabel="Add reminder" onSubmit={handleCreate} />
      </section>

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

      <ReminderList
        reminders={reminders}
        loading={loading}
        tab={tab}
        onTabChange={setTab}
        highlightId={highlightId}
        busy={busy}
        onAction={handleAction}
        onSaveEdit={handleSaveEdit}
      />

      <footer className="pt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        Your reminders are tied to this browser (no account needed). Clearing site data creates a new, empty identity.
      </footer>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
