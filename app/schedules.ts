/**
 * Declarative schedule manifest for this app's recurring actions.
 *
 * This file is the *source of truth for what's declared*. Each entry describes a
 * recurring action the platform should fire on a schedule. After a successful
 * production deploy, the platform reads this manifest and reconciles it into its
 * registry — new entries are registered, changed entries are updated in place
 * (keyed by `name`), and removed entries stop firing. So editing this file and
 * redeploying is all it takes to change, add, or remove a schedule; there is no
 * separate cron config to keep in sync (this mirrors Vercel's `vercel.json`
 * crons).
 *
 * The manifest declares *when* an action fires and *what* it is. The actual work
 * — *what it does* — lives in `app/routes/api.internal.scheduled.tsx`, in the
 * handler keyed by the same `name`. The two must agree on `name`: the platform
 * sends it back in the `x-stencil-schedule-name` header so that one trusted route
 * can serve every schedule.
 *
 * Cadence contract (applies to every entry):
 *   - Finest granularity is ~5 minutes — the platform evaluates schedules on a
 *     5-minute tick, so anything finer is rounded up to that floor.
 *   - Timezone-aware: set `timezone` and "every morning" means the *user's*
 *     morning, not UTC. Leave it unset to evaluate the cron in platform-local
 *     time.
 *   - Best-effort delivery: a transient dispatch failure is retried once, so a
 *     run can be delivered twice (and can still be missed). Handlers must be
 *     idempotent (safe to run twice) and should guard against overlap.
 *   - A run is one normal app request and must fit normal request/CPU limits —
 *     no long crawls or multi-minute batch jobs.
 */
export type ScheduleManifestEntry = {
  /**
   * Stable identity of this schedule within the app (e.g. `"refresh-events"`).
   * It ties an edit here to the existing registry row rather than creating a new
   * one, and must match a handler key in `app/routes/api.internal.scheduled.tsx`.
   * Renaming it is treated as "remove the old schedule, add a new one."
   */
  name: string;
  /**
   * Standard 5-field cron expression (`minute hour day-of-month month
   * day-of-week`), e.g. `"0 7 * * *"` for 07:00 daily. Remember the ~5-minute
   * floor: `"*\/1 * * * *"` still only fires about every 5 minutes.
   */
  cron: string;
  /**
   * Human-readable, one-line statement of intent, e.g. `"Send each user a weekly
   * summary"`. Required. This is the label a future settings screen surfaces so
   * a person sees *what* the action does, not just its cron — write it from the
   * user's stated intent, not the implementation.
   */
  description: string;
  /**
   * Optional IANA timezone (e.g. `"America/New_York"`) the `cron` is evaluated
   * in. Unset → platform-local time.
   */
  timezone?: string;
  /**
   * Optional app route the platform hits when this schedule fires. Defaults to
   * `/api/internal/scheduled` (the trusted route the template ships). Only set
   * this if you route scheduled traffic somewhere custom.
   */
  path?: string;
};

/**
 * The app's declared recurring actions. Empty by default — add an entry (and a
 * matching handler in `app/routes/api.internal.scheduled.tsx`) to register one.
 *
 * Example:
 *
 *   export const schedules: ScheduleManifestEntry[] = [
 *     {
 *       name: "refresh-events",
 *       cron: "0 7 * * *",
 *       description: "Fetch new events every morning and add them to the database",
 *       timezone: "America/New_York",
 *     },
 *   ];
 */
export const schedules: ScheduleManifestEntry[] = [];
