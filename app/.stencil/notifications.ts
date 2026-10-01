import type { NotificationView } from "./types/notifications";

export type { NotificationView } from "./types/notifications";

// The notification table ships in a new app's seed, but apps provisioned
// earlier have none. Create it on first use; the flag keeps it to one batch
// per isolate (same pattern as the OAuth tables in mcp/ensure-tables.ts).
const NOTIFICATION_DDL = [
  "CREATE TABLE IF NOT EXISTS `notification` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `title` text NOT NULL, `body` text NOT NULL, `link` text, `read_at` integer, `created_at` integer NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade);",
  "CREATE INDEX IF NOT EXISTS `notification_user_created_idx` ON `notification` (`user_id`, `created_at`);",
];

let ensured = false;

async function ensureNotificationTable(env: Env): Promise<void> {
  if (ensured) return;
  await env.DB.batch(NOTIFICATION_DDL.map((sql) => env.DB.prepare(sql)));
  ensured = true;
}

export interface SendNotificationParams {
  /** One of these picks the recipients — exactly one is required. */
  toUserId?: string;
  toUserIds?: string[];
  title: string;
  body: string;
  /** Same-origin path opened when the notification is clicked. */
  link?: string;
}

export interface SendNotificationResult {
  ok: true;
  /** Rows written — one per recipient that exists in the app's auth user table. */
  created: number;
  /**
   * `no_recipients` means no row was written: every targeted id was absent from
   * the auth user table. Treat it as a failure worth logging, not a success.
   */
  status: "created" | "no_recipients";
}

export interface ListNotificationsOptions {
  /** Newest-first page size. Defaults to 20, capped at 100. */
  limit?: number;
  /** Return only rows created strictly before this epoch-ms cursor. */
  before?: number;
}

type NotificationDbRow = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: number | null;
  created_at: number;
};

function toView(row: NotificationDbRow): NotificationView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * The in-app notification store: fixed-shape rows (title, body, link, read
 * state) per app user in the app's own database — the durable record next to
 * the fire-and-forget transports (`~stencil/push`, `~stencil/email`). Server-side only.
 */
export function createNotifications(env: Env) {
  return {
    /** Write one notification row per recipient. */
    async send(params: SendNotificationParams): Promise<SendNotificationResult> {
      const { toUserId, toUserIds, title, body, link } = params;
      if ((toUserId ? 1 : 0) + (toUserIds ? 1 : 0) !== 1) {
        throw new Error("Pass exactly one of toUserId or toUserIds");
      }
      if (!title || !body) throw new Error("title and body are required");

      const ids = [...new Set(toUserId ? [toUserId] : (toUserIds ?? []))];
      if (ids.length === 0) return { ok: true, created: 0, status: "no_recipients" };

      await ensureNotificationTable(env);
      // INSERT … SELECT against the auth user table, so an id that matches no
      // app user is skipped instead of failing the whole send on its FK.
      const placeholders = ids.map(() => "?").join(", ");
      const result = await env.DB.prepare(
        "INSERT INTO notification (id, user_id, title, body, link, created_at) " +
          "SELECT lower(hex(randomblob(16))), u.id, ?, ?, ?, ? " +
          `FROM user u WHERE u.id IN (${placeholders})`,
      )
        .bind(title, body, link ?? null, Date.now(), ...ids)
        .run();

      const created = result.meta.changes ?? 0;
      return { ok: true, created, status: created > 0 ? "created" : "no_recipients" };
    },

    /** One app user's notifications, newest first. */
    async list(userId: string, options?: ListNotificationsOptions): Promise<NotificationView[]> {
      await ensureNotificationTable(env);
      const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
      const before = options?.before;
      const result = await env.DB.prepare(
        "SELECT id, title, body, link, read_at, created_at FROM notification " +
          `WHERE user_id = ? ${before != null ? "AND created_at < ? " : ""}` +
          "ORDER BY created_at DESC, id DESC LIMIT ?",
      )
        .bind(...(before != null ? [userId, before, limit] : [userId, limit]))
        .all<NotificationDbRow>();
      return result.results.map(toView);
    },

    /** How many of one app user's notifications are unread. */
    async unreadCount(userId: string): Promise<number> {
      await ensureNotificationTable(env);
      const row = await env.DB.prepare(
        "SELECT count(*) AS n FROM notification WHERE user_id = ? AND read_at IS NULL",
      )
        .bind(userId)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    /** Mark one of the app user's notifications read. No-op if already read. */
    async markRead(userId: string, id: string): Promise<void> {
      await ensureNotificationTable(env);
      await env.DB.prepare(
        "UPDATE notification SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL",
      )
        .bind(Date.now(), id, userId)
        .run();
    },

    /** Mark all of the app user's notifications read. */
    async markAllRead(userId: string): Promise<void> {
      await ensureNotificationTable(env);
      await env.DB.prepare(
        "UPDATE notification SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
      )
        .bind(Date.now(), userId)
        .run();
    },
  };
}

export type Notifications = ReturnType<typeof createNotifications>;
