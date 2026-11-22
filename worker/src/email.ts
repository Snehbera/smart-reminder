import type { Env, ReminderRow } from './types.ts';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  mock?: boolean;
}

/**
 * Sends an email via Resend's REST API.
 * Uses native Web Fetch API (ideal for Cloudflare Workers).
 * If RESEND_API_KEY is not set, logs the email details in dev mode without throwing.
 */
export async function sendEmail(env: Env, options: SendEmailOptions): Promise<EmailResult> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim() || 'Smart Reminders <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(
      `[Resend Email Mock] RESEND_API_KEY not configured. Simulated sending to: ${options.to}\nSubject: ${options.subject}`,
    );
    return { ok: true, id: 'mock-' + crypto.randomUUID(), mock: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
      }),
    });

    const data = (await res.json()) as { id?: string; message?: string; name?: string };

    if (!res.ok) {
      const err = data.message || `HTTP ${res.status}`;
      console.error('[Resend Error]', err);
      return { ok: false, error: err };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Resend Network Error]', message);
    return { ok: false, error: message };
  }
}

/**
 * Formats a clean, modern HTML email for reminder alerts.
 */
export function buildReminderEmailHtml(
  reminder: ReminderRow,
  type: 'due' | 'early' | 'overdue',
  earlyMinutes?: number,
): { subject: string; html: string } {
  const title = reminder.title;
  const category = reminder.category || 'General';
  const color = reminder.badge_color || '#6366f1';
  const notes = (reminder.notes || '').trim();

  let subjectPrefix = '⏰ Reminder:';
  let bannerText = 'Scheduled Alert';
  let bannerBg = '#eef2ff';
  let bannerColor = '#4338ca';

  if (type === 'early' && earlyMinutes) {
    subjectPrefix = `🔔 Upcoming in ${earlyMinutes}m:`;
    bannerText = `Upcoming Alert (starts in ${earlyMinutes} minutes)`;
    bannerBg = '#eff6ff';
    bannerColor = '#1d4ed8';
  } else if (type === 'overdue') {
    subjectPrefix = '⚠️ Overdue Reminder:';
    bannerText = 'Action Required: This reminder is overdue';
    bannerBg = '#fef2f2';
    bannerColor = '#b91c1c';
  }

  const subject = `${subjectPrefix} ${title}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <tr>
      <td style="padding: 24px 28px 16px 28px; border-bottom: 1px solid #f1f5f9;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <span style="font-weight: 800; font-size: 18px; color: #4f46e5; letter-spacing: -0.5px;">⚡ Smart Reminders</span>
            </td>
            <td align="right">
              <span style="display: inline-block; background-color: ${color}22; color: ${color}; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px;">
                ${escapeHtml(category)}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Status Banner -->
    <tr>
      <td style="padding: 12px 28px; background-color: ${bannerBg}; border-bottom: 1px solid #e2e8f0;">
        <span style="font-size: 13px; font-weight: 600; color: ${bannerColor};">
          ${bannerText}
        </span>
      </td>
    </tr>

    <!-- Body Content -->
    <tr>
      <td style="padding: 28px;">
        <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
          ${escapeHtml(title)}
        </h1>

        <p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b; line-height: 1.5;">
          Scheduled for: <strong>${escapeHtml(new Date(reminder.remind_at_utc).toLocaleString('en-US', { timeZone: reminder.timezone || 'UTC', dateStyle: 'full', timeStyle: 'short' }))}</strong>
          ${reminder.timezone ? ` (${escapeHtml(reminder.timezone)})` : ''}
        </p>

        ${
          notes
            ? `<div style="margin: 20px 0; padding: 14px 18px; background-color: #f8fafc; border-left: 4px solid ${color}; border-radius: 6px; font-size: 14px; color: #334155; line-height: 1.6;">
                <strong>Notes:</strong><br>${escapeHtml(notes)}
               </div>`
            : ''
        }

        ${
          reminder.nag_mode === 1
            ? `<p style="margin: 16px 0 0 0; font-size: 12px; color: #d97706; font-weight: 500;">
                🔔 Nag Mode is enabled. Alerts will repeat until marked done in the app.
               </p>`
            : ''
        }
      </td>
    </tr>

    <!-- Action Button -->
    <tr>
      <td style="padding: 0 28px 28px 28px;">
        <a href="http://localhost:5173/?highlight=${encodeURIComponent(reminder.id)}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 10px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);">
          Open in Smart Reminders →
        </a>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 16px 28px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; text-align: center;">
        Sent automatically by Smart Reminders because you configured email alerts for this item.
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
