---
name: recurring-actions
description: Scheduled server-side work — "every morning", "daily/weekly/hourly/nightly", "each evening", cron, recurring reminders, digest or summary emails, periodic refresh/cleanup/expiry, polling an inbox or feed on a schedule. Use when the brief asks for anything that must run repeatedly without the user opening the app. Covers the app/schedules.ts manifest, the trusted scheduled route, the cadence contract, and idempotency.
metadata:
  title: Recurring Actions (scheduled server-side work)
---

# Recurring actions

Run server-side work **on a schedule** — "every morning refresh the events list", "email each user a weekly summary", "every hour expire stale rows" — with no cron plumbing. The platform evaluates every app's schedule and fires the ones that are due; you declare *when* and write *what happens*.

Only build one when the brief asks for scheduled/repeating work. Never fake scheduling with client-side timers, `setInterval`, or a "run now" button — those don't run when the app is closed.

## Start from the scaffold

```bash
cp /opt/design/scaffolds/recurring/schedules.ts app/schedules.ts
cp /opt/design/scaffolds/recurring/api.internal.scheduled.tsx app/routes/api.internal.scheduled.tsx
```

Then register the route in `app/routes.ts` at `api/internal/scheduled`. Both scaffolds are worked, idempotent examples — adapt them.

A recurring action is always **two edits that agree on a `name`**.

## 1. Declare it — `app/schedules.ts`

This manifest lists every recurring action. On each production deploy the platform reconciles it into its registry: new entries register, changed entries update in place keyed by `name`, removed entries stop firing.

```ts
export const schedules: ScheduleManifestEntry[] = [
  {
    name: "refresh-events",                 // stable identity — must match a handler
    cron: "0 7 * * *",                      // 5-field cron; 07:00
    description: "Fetch new events every morning and add them to the database",
    timezone: "America/New_York",           // optional — makes "morning" the user's morning
    // path?: "/api/internal/scheduled"     // optional — defaults to the trusted route below
  },
];
```

- **`name`** — required, stable identity. Ties the schedule to its handler and to the registry row; renaming it is "remove old, add new". Short kebab-case verb-noun (`refresh-events`, `send-weekly-summary`).
- **`cron`** — required, standard 5-field expression (`min hour day-of-month month day-of-week`).
- **`description`** — required, a human-readable one-liner of intent in the *user's* words ("Send each user a weekly summary"), never the implementation or a restatement of the cron. It's the label the owner's Automations panel surfaces.
- **`timezone`** — optional IANA zone. Set it whenever the user says "morning/evening/overnight/end of day" so it fires in *their* time, not UTC.
- **`path`** — optional; only set it if you route scheduled traffic to a custom route.

## 2. Do the work — `app/routes/api.internal.scheduled.tsx`

The trusted route the platform hits. Its bearer-secret authentication is **platform-managed — leave it and the `env.SCHEDULE_TRIGGER_SECRET` check exactly as shipped.** All you add is a handler in `SCHEDULE_HANDLERS`, keyed by the same `name` as the manifest entry:

```ts
const SCHEDULE_HANDLERS = {
  "refresh-events": async ({ env }) => {
    const db = createDb(env);
    // ...fetch and UPSERT (not insert) — see idempotency below.
  },
} satisfies Record<string, (args: ScheduleHandlerArgs) => Promise<void>>;
```

Inside a handler you have the app's normal server-side toolkit: `createDb` (`~stencil/db`), `createAI` (`~stencil/ai`), `createEmail` (`~stencil/email`), `createStorage` (`~stencil/storage`), `createSearch` (`~stencil/search`), `createFetch` (`~stencil/fetch`), and plain `fetch()`.

## Cadence contract — state and respect it

- **~5-minute floor.** The platform evaluates schedules on a 5-minute tick, so `* * * * *` still only fires about every 5 minutes. Sub-5-minute cadence isn't possible.
- **Timezone-aware** (see `timezone` above) — a genuine step past UTC-only cron.
- **Best-effort delivery with one retry.** A run can be missed; a transient dispatch failure (timeout, network, 5xx) is retried once, so a run can also arrive twice. A 4xx is never retried.
- **Handlers MUST be idempotent.** Prefer upsert/reconcile over blind insert, and guard against overlap (e.g. check and stamp a `last_run_at` row) if a run could still be in flight when the next arrives. For inbox/feed polling, mark items processed (`markRead`) so the next run skips them.
- **Return a real status code.** Every attempt is recorded; a non-2xx shows as a failed run in the owner's Automations panel.
- **One normal request.** A scheduled run must fit normal request/CPU limits — no long crawls or multi-minute batch jobs.

## Cadence is composer-set

In v1 the schedule is fixed at build time; the user changes it by asking you to rebuild ("make it hourly instead"), which edits `app/schedules.ts` and redeploys. There is **no in-app runtime settings screen** to view, pause, or edit schedules — do not build one. Never expose the manifest, the registry, or `SCHEDULE_TRIGGER_SECRET` in the app UI.
