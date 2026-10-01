import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationView } from "../../types/notifications";

export interface NotificationsBellProps {
  /** Overrides the trigger button's classes. */
  className?: string;
}

/** Compact relative age ("now", "5m", "3h", "2d"), falling back to a date. */
function age(createdAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d`;
  return new Date(createdAt).toLocaleDateString();
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

/**
 * The notification bell for the app header: unread count, latest rows, mark all
 * read on open, mark one read on click. Self-contained — it talks to
 * `/api/notifications/*`, so the app must spread `stencilNotificationRoutes` into `app/routes.ts`.
 */
export function NotificationsBell({ className }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /** Fetch the latest rows; returns the fetched unread count, or null on failure. */
  const refresh = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch("/api/notifications/list");
      if (!res.ok) return null;
      const data = (await res.json()) as {
        unread: number;
        notifications: NotificationView[];
      };
      setItems(data.notifications);
      setUnread(data.unread);
      return data.unread;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    // Refresh first so the panel shows what just arrived with its unread
    // styling, then clear the badge — opening the panel is reading it.
    const fetchedUnread = await refresh();
    if (fetchedUnread === null) return;
    setUnread(0);
    if (fetchedUnread > 0) {
      fetch("/api/notifications/read-all", { method: "POST" }).catch((err) =>
        console.error("notifications: mark-all-read failed", err),
      );
    }
  }

  function markRead(id: string) {
    fetch("/api/notifications/read", {
      method: "POST",
      body: new URLSearchParams({ id }),
      keepalive: true,
    }).catch((err) => console.error("notifications: mark-read failed", err));
    setItems((prev) =>
      prev
        ? prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? Date.now() } : n))
        : prev,
    );
  }

  // Nothing to show yet: SSR, first client render, or a signed-out visitor.
  if (items === null) return null;

  const trigger =
    className ??
    "relative inline-flex h-9 w-9 items-center justify-center rounded-full " +
      "text-foreground-secondary transition-colors hover:bg-surface-hover " +
      "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 " +
      "focus-visible:ring-focus-ring";

  return (
    <div ref={rootRef} className="relative" data-notifications-bell>
      <button
        type="button"
        onClick={() => void toggle()}
        className={trigger}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        data-notifications-trigger
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
            data-notifications-unread={unread}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          role="dialog"
          aria-label="Notifications"
          data-notifications-panel
        >
          <div className="border-b border-border-subtle px-4 py-2.5 text-sm font-semibold text-foreground">
            Notifications
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => {
                const body = (
                  <>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {n.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {age(n.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-foreground-secondary">
                      {n.body}
                    </span>
                  </>
                );
                const rowClass =
                  "block px-4 py-3 " +
                  (n.readAt === null ? "bg-primary-tint" : "") +
                  (n.link ? " transition-colors hover:bg-surface-hover" : "");
                return (
                  <li key={n.id} className="border-b border-border-subtle last:border-b-0">
                    {n.link ? (
                      <a href={n.link} className={rowClass} onClick={() => markRead(n.id)}>
                        {body}
                      </a>
                    ) : (
                      <div className={rowClass}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
