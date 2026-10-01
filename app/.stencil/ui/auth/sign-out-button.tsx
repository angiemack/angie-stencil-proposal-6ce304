import type { PropsWithChildren } from "react";

/**
 * "Sign out" as a POST form to /logout. Sign-out must be a POST — a plain
 * <Link to="/logout"> lets history traversal and link prefetch end the session.
 */
export function SignOutButton({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <form method="post" action="/logout" className="contents">
      <button type="submit" className={className}>
        {children ?? "Sign out"}
      </button>
    </form>
  );
}
