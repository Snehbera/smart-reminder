# Smart Reminder Service

Schedule one-time or recurring reminders (minutes → years ahead). A **Cloudflare Worker cron job runs every minute**, reads **D1**, and sends an encrypted **Web Push** to every subscribed browser/device — so alerts arrive as persistent, pinned notifications with **✓ Mark Done** and **⏰ Snooze 10m** buttons even when the tab is closed and the user never returns to the site.

- **Frontend:** React 18 + Vite + Tailwind CSS + Lucide, native service worker (`frontend/public/sw.js`) → Cloudflare Pages
- **Backend:** Cloudflare Worker + Hono, D1 (SQLite), cron `* * * * *`
- **Web Push:** written from scratch on the Web Crypto API (VAPID ES256 + RFC 8291 `aes128gcm`); no Node-only `web-push`, zero crypto dependencies

```
smart-reminder/
├─ package.json                 convenience scripts (npm run vapid, deploy:worker, …)
├─ worker/
│  ├─ wrangler.jsonc            cron trigger, D1 binding, vars
│  ├─ schema.sql                D1 schema + indexes
│  ├─ scripts/generate-vapid.mjs
│  ├─ .dev.vars.example
│  ├─ src/
│  │  ├─ index.ts               REST API (Hono) + scheduled() entry
│  │  ├─ scheduled.ts           cron: due / snoozed / nag processing, state machine
│  │  ├─ notify.ts              payload builders, delivery, stale-subscription cleanup
│  │  ├─ push.ts                Web Crypto VAPID + aes128gcm sender
│  │  ├─ recurrence.ts          timezone-aware next-occurrence maths
│  │  └─ types.ts
│  └─ test/logic.test.mjs       15 tests (push crypto round-trip, recurrence, scheduler)
└─ frontend/
   ├─ public/ sw.js, manifest, icons, _headers
   └─ src/ App.tsx, components/{PermissionBanner,ReminderForm,ReminderList,ReminderCard,Toasts}.tsx,
           lib/{push,api,time,types}.ts, hooks/
```

---

## 1. Prerequisites

- Node.js 20+ and a free Cloudflare account
- `npx wrangler login` (once)

```bash
cd smart-reminder
npm run install:all
```

## 2. Generate VAPID keys

```bash
npm run vapid
```

Prints a public and a private key. Keep the private key secret.

## 3. Create the D1 database and apply the schema

```bash
cd worker
npx wrangler d1 create smart-reminder-db
```

Copy the printed `database_id` into `worker/wrangler.jsonc` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`). Then:

```bash
npx wrangler d1 execute smart-reminder-db --remote --file=./schema.sql   # production
npx wrangler d1 execute smart-reminder-db --local  --file=./schema.sql   # local dev (npm run db:local)
```

Also set `VAPID_SUBJECT` in `wrangler.jsonc` to a real `mailto:you@yourdomain.com` (push services reject fake subjects).

## 4. Run locally

```bash
cp worker/.dev.vars.example worker/.dev.vars     # paste your VAPID keys into it
npm run dev:worker                               # terminal 1 → http://127.0.0.1:8787
npm run dev:frontend                             # terminal 2 → http://localhost:5173 (proxies /api to the worker)
```

`localhost` counts as a secure context, so push works in dev. To trigger the cron manually:

```bash
curl "http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*"
```

Run the logic tests any time with `npm test`.

## 5. Deploy

**Worker (API + cron):**

```bash
cd worker
npx wrangler secret put VAPID_PUBLIC_KEY      # paste public key
npx wrangler secret put VAPID_PRIVATE_KEY     # paste private key
npx wrangler deploy                           # prints https://smart-reminder-api.<you>.workers.dev
```

**Frontend (Cloudflare Pages):**

```bash
cd ../frontend
echo "VITE_API_URL=https://smart-reminder-api.<you>.workers.dev" > .env.production
npx wrangler pages project create smart-reminder --production-branch main    # first time only
npm run deploy                                                                # build + upload
```

**Lock down CORS:** set `ALLOWED_ORIGIN` in `worker/wrangler.jsonc` to your Pages URL (e.g. `https://smart-reminder.pages.dev`) and run `npx wrangler deploy` again.

Open the Pages URL → **Enable Notifications** → **Send Test Notification** → create a reminder “In 1 min” and close the tab. It will still arrive.

---

## What I added beyond your prompt

| Gap / risk in the original spec | What the project does |
|---|---|
| `remind_at_utc <= datetime('now')` silently breaks: SQLite returns `YYYY-MM-DD HH:MM:SS`, stored values are ISO `…T…Z`, and `'T' > ' '`, so reminders would fire up to a day late | All comparisons use a JS-generated fixed-width ISO string bound as a parameter (documented in `schema.sql`) |
| Anyone who guesses an id could PATCH/DELETE a reminder | Every request needs the browser's unguessable UUID `X-Device-Id`; all queries are scoped to it |
| Recurring maths in plain UTC drifts across DST and month ends | `anchor_utc` + `timezone` columns; occurrences are computed in the user's zone (daily 9:00 stays 9:00 across DST; monthly on the 31st → 28th → 31st; Feb 29 handled) |
| Snoozing a recurring reminder would overwrite its schedule | Separate `snoozed_until`; the series is untouched |
| Nag mode only worked for one-time reminders | Recurring + nag waits for *Mark Done*, then rolls to the next occurrence |
| Overlapping cron runs / user edits mid-send could double-fire or clobber | Optimistic `WHERE` guards on every state update |
| A push-service outage would lose reminders | Transient failures (429/5xx/network) retry for up to 5 minutes (`attempts` column); `404/410` subscriptions are deleted |
| Worker could be abused as an open HTTP relay via fake `endpoint`s | Endpoints must be `https` on known push-service hosts (FCM, Mozilla, Apple, WNS) |
| Input limits | Title/notes length, max 500 active reminders, max 20 years ahead, max 10 subscriptions per device, IANA timezone and hex-colour validation |
| Service worker has no access to `localStorage` | API base + device id are passed in the SW registration URL |
| Offline “Mark Done” from the notification fails silently | One retry, then a visible “Could not update reminder” notification |
| Browser rotates its push subscription | `pushsubscriptionchange` handler re-subscribes; app also re-syncs on every load and handles rotated VAPID keys |
| iOS only supports push for Home-Screen web apps | Banner detects iOS Safari and explains “Add to Home Screen”; PWA manifest + icons included |
| Extras | `/api/test` for the banner’s test button, `/api/unsubscribe`, hourly cleanup of reminders completed > 90 days ago, light/dark theme, auto-refresh on tab focus **and** when a push arrives |

## Behaviour notes

- **Mark Done on a recurring reminder** completes *that occurrence* and keeps the series; delete the reminder to stop it entirely.
- **Reopen** a completed reminder from the Completed tab (“Restore”) or by editing its date.
- **Identity is the browser:** reminders follow the `device_id` in `localStorage`. Clearing site data starts a fresh, empty identity (an `email` column exists on `subscriptions` for adding fallback alerts or accounts later).
- **Action buttons** (`Mark Done` / `Snooze`) are shown by Chrome, Edge and Android; Safari and Firefox show the notification without buttons — clicking the body opens the app.
- **Limits:** each cron tick handles up to 40 reminders (backlog drains next minute), which stays within Workers free-plan limits. Raise `MAX_PER_TICK` in `scheduled.ts` on a paid plan.
- **Changing VAPID keys** invalidates old subscriptions; the app re-subscribes automatically the next time each user opens it.
- Dependencies could not be installed in the environment this was generated in, so `npm run install:all` is the first thing to run; the worker's logic and crypto were tested (`npm test`), and the frontend/worker type-check (`npm run typecheck` in each folder) should be run once after install.
