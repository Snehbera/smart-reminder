import { BellRing, Loader2, RefreshCw, Send, ShieldAlert, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PushState } from '../lib/push';

interface Props {
  state: PushState;
  busy: boolean;
  onEnable: () => void;
  onRetry: () => void;
  onTest: () => void;
}

const BADGE: Record<PushState, { label: string; cls: string; dot: string }> = {
  loading: { label: 'Checking…', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  unsupported: { label: 'Not supported', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  'needs-install': { label: 'Install needed', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-500' },
  default: { label: 'Permission Needed', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-500' },
  denied: { label: 'Blocked in Browser', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', dot: 'bg-red-500' },
  connecting: { label: 'Connecting…', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', dot: 'bg-sky-500 animate-pulse' },
  active: { label: 'Push Active', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', dot: 'bg-emerald-500' },
  error: { label: 'Connection problem', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', dot: 'bg-red-500' },
};

export function PermissionBanner({ state, busy, onEnable, onRetry, onTest }: Props) {
  const badge = BADGE[state];

  let message: ReactNode;
  let action: ReactNode = null;

  switch (state) {
    case 'active':
      message = 'Reminders will reach this device even when this tab is closed. Send a test to see how the pinned alert looks.';
      break;
    case 'default':
      message = 'Turn on notifications so reminders can alert you even after you close this page.';
      action = (
        <button className="btn-primary" onClick={onEnable} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          Enable Notifications
        </button>
      );
      break;
    case 'denied':
      message = (
        <>
          Notifications are blocked for this site. To unblock: click the <strong>lock / tune icon</strong> in the address bar →{' '}
          <strong>Site settings</strong> → set <strong>Notifications</strong> to <strong>Allow</strong>, then reload this page.
          On Android, also check <em>Settings → Apps → your browser → Notifications</em>.
        </>
      );
      break;
    case 'needs-install':
      message = (
        <>
          On iPhone/iPad, push notifications only work for installed apps. Tap <strong>Share</strong> →{' '}
          <strong>Add to Home Screen</strong>, then open Smart Reminders from your Home Screen and enable notifications.
        </>
      );
      break;
    case 'unsupported':
      message = 'This browser does not support Web Push. Try the latest Chrome, Edge, Firefox or Safari (16.4+). Local HTTPS is required.';
      break;
    case 'error':
      message = 'Notifications are allowed, but this device could not be registered with the server.';
      action = (
        <button className="btn-ghost" onClick={onRetry} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Retry
        </button>
      );
      break;
    default:
      message = 'Setting things up…';
  }

  return (
    <section className="card p-4 sm:p-5" aria-label="Notification status">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            {state === 'denied' ? <ShieldAlert className="h-5 w-5" /> : state === 'needs-install' ? <Smartphone className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{message}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {action}
          {state === 'active' && (
            <button className="btn-ghost" onClick={onTest} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Test Notification
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
