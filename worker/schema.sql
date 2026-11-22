-- Smart Reminder Service — Cloudflare D1 schema
-- Apply with:  npx wrangler d1 execute smart-reminder-db --remote --file=./schema.sql
-- (use --local for the local dev database)
--
-- NOTE ON TIMESTAMPS: every timestamp the app writes is a fixed-width ISO-8601 UTC
-- string produced by JavaScript (e.g. 2026-11-22T09:30:00.000Z). Fixed-width ISO strings
-- sort lexicographically, so `remind_at_utc <= ?` comparisons are correct and index-friendly.
-- (Do NOT compare against SQLite's datetime('now'): it returns 'YYYY-MM-DD HH:MM:SS' with a
-- space instead of 'T', which breaks string comparison against ISO values.)

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  name          TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  user_id     TEXT,
  email       TEXT,                                   -- optional, reserved for fallback alerts
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_device ON subscriptions (device_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON subscriptions (user_id);

CREATE TABLE IF NOT EXISTS reminders (
  id               TEXT PRIMARY KEY,
  device_id        TEXT NOT NULL,
  user_id          TEXT,                              -- optional, linked when user is authenticated
  title            TEXT NOT NULL,
  notes            TEXT,
  category         TEXT NOT NULL DEFAULT 'General',
  remind_at_utc    TEXT NOT NULL,                     -- next scheduled occurrence (ISO UTC)
  anchor_utc       TEXT NOT NULL,                     -- original first occurrence; recurrence is computed from it (no drift, month-end safe)
  timezone         TEXT NOT NULL,                     -- IANA zone, e.g. Asia/Kolkata (recurrence keeps local wall-clock time across DST)
  repeat_interval  TEXT NOT NULL DEFAULT 'none'
                   CHECK (repeat_interval IN ('none','daily','weekly','monthly','yearly')),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sent','snoozed','completed')),
  nag_mode         INTEGER NOT NULL DEFAULT 0 CHECK (nag_mode IN (0,1)),
  badge_color      TEXT NOT NULL DEFAULT '#6366f1',
  channel          TEXT NOT NULL DEFAULT 'both' CHECK (channel IN ('push','email','both')),
  email            TEXT,                              -- target email address for email alerts
  email_offset_minutes INTEGER NOT NULL DEFAULT 0,    -- 0=at time of event, 5=5m before, 15=15m before, etc.
  email_sent_at    TEXT,                              -- ISO timestamp when email alert was dispatched
  snoozed_until    TEXT,                              -- when status='snoozed': time of the re-alert
  last_sent_at     TEXT,                              -- last successful push; drives the 15-minute nag cadence
  attempts         INTEGER NOT NULL DEFAULT 0,        -- consecutive transient push failures
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT
);

-- Cron hot paths (all run every minute)
CREATE INDEX IF NOT EXISTS idx_reminders_due      ON reminders (status, remind_at_utc);
CREATE INDEX IF NOT EXISTS idx_reminders_snoozed  ON reminders (status, snoozed_until);
CREATE INDEX IF NOT EXISTS idx_reminders_nag      ON reminders (status, nag_mode, last_sent_at);
-- Dashboard listing
CREATE INDEX IF NOT EXISTS idx_reminders_device   ON reminders (device_id, remind_at_utc);
CREATE INDEX IF NOT EXISTS idx_reminders_user     ON reminders (user_id, remind_at_utc);
