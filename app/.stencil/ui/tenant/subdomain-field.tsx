import { useEffect, useRef, useState } from "react";

export interface SubdomainFieldProps {
  /** The app user's current subdomain, so the field opens on what they hold. */
  value?: string | null;
  /** Called after a successful save, with the word now held (empty when cleared). */
  onSaved?: (subdomain: string) => void;
  className?: string;
}

type Status =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "free"; preview: string }
  | { state: "taken"; reason: string }
  | { state: "saving" }
  | { state: "saved"; preview: string }
  | { state: "failed"; reason: string };

type CheckResult = { ok: boolean; reason?: string; preview?: string | null };

/**
 * The app user's own address, claimed in one field: type a word, see whether it
 * is free and what the address will be, save it.
 *
 * Self-contained — it talks to `/api/subdomain/*`, so the app must spread
 * `stencilTenantRoutes` into `app/routes.ts`. Drop it into a profile or
 * onboarding screen; never rebuild the claim flow by hand.
 */
export function SubdomainField({ value, onSaved, className }: SubdomainFieldProps) {
  const [word, setWord] = useState(value ?? "");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const latest = useRef(0);

  useEffect(() => {
    const trimmed = word.trim().toLowerCase();
    if (!trimmed || trimmed === (value ?? "")) {
      setStatus({ state: "idle" });
      return;
    }
    setStatus({ state: "checking" });
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      let result: CheckResult;
      try {
        const res = await fetch(`/api/subdomain/check?subdomain=${encodeURIComponent(trimmed)}`);
        result = (await res.json()) as CheckResult;
      } catch {
        result = { ok: false, reason: "Couldn't check that address just now." };
      }
      // A slower answer to an earlier keystroke must not overwrite a newer one.
      if (ticket !== latest.current) return;
      setStatus(
        result.ok
          ? { state: "free", preview: result.preview ?? "" }
          : { state: "taken", reason: result.reason ?? "That address can't be used." },
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [word, value]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = word.trim().toLowerCase();
    const preview = status.state === "free" ? status.preview : "";
    setStatus({ state: "saving" });
    let result: CheckResult;
    try {
      const res = await fetch("/api/subdomain/set", {
        method: "POST",
        body: new URLSearchParams({ subdomain: trimmed }),
      });
      result = (await res.json()) as CheckResult;
    } catch {
      result = { ok: false, reason: "Couldn't save that address just now." };
    }
    if (!result.ok) {
      setStatus({ state: "failed", reason: result.reason ?? "That address can't be used." });
      return;
    }
    setStatus({ state: "saved", preview });
    onSaved?.(trimmed);
  }

  const message =
    status.state === "checking"
      ? "Checking…"
      : status.state === "free"
        ? `Available — ${status.preview}`
        : status.state === "saved"
          ? `Saved — ${status.preview}`
          : status.state === "taken" || status.state === "failed"
            ? status.reason
            : "";
  const bad = status.state === "taken" || status.state === "failed";

  return (
    <form onSubmit={save} className={className}>
      <input
        name="subdomain"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={bad || undefined}
        aria-describedby="stencil-subdomain-message"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground aria-[invalid]:border-error"
      />
      <p
        id="stencil-subdomain-message"
        role="status"
        className={`mt-1 min-h-5 text-xs ${bad ? "text-error" : "text-muted-foreground"}`}
      >
        {message}
      </p>
      <button
        type="submit"
        disabled={status.state !== "free" || word.trim().toLowerCase() === (value ?? "")}
        className="mt-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        Save address
      </button>
    </form>
  );
}
