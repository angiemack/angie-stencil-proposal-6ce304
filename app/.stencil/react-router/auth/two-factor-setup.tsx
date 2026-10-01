import { Form, data, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireAuth } from "../../auth/server";
import { createAuth } from "../../auth/utils";
import { forwardCookies, postToAuth, startTwoFactorEnrollment } from "../../auth/two-factor";
import { qrSvgPath } from "../../auth/qr";

type Step =
  | { step: "verify"; totpUri: string; manualKey: string; error?: string }
  | { step: "done"; backupCodes: string[] };

/** /auth/two-factor/setup — a signed-in app user enrols an authenticator app: scan
 *  the QR code, confirm one code, save the backup codes. Apps link here from their
 *  own account settings. */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  return { enabled: Boolean(user.twoFactorEnabled) };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const form = await request.formData();
  const auth = createAuth(env, false, undefined, request);

  if (form.get("intent") === "verify") {
    const totpUri = String(form.get("totpUri") ?? "");
    const manualKey = String(form.get("manualKey") ?? "");
    const code = String(form.get("code") ?? "").trim();
    const res = await postToAuth(auth, request, "/two-factor/verify-totp", { code });
    if (!res.ok) {
      return data<Step>(
        { step: "verify", totpUri, manualKey, error: "That code didn't match. Try the next one your app shows." },
        { status: 400 },
      );
    }
    // Verifying enabled the second factor and rotated the session; the new
    // cookie has to travel with this page's response.
    const { backupCodes } = await auth.api.viewBackupCodes({ body: { userId: user.id } });
    return data<Step>({ step: "done", backupCodes }, { headers: forwardCookies(res) });
  }

  if (user.twoFactorEnabled) throw new Response("Two-factor authentication is already on", { status: 409 });
  const issuer = new URL(request.url).hostname;
  const { totpUri, manualKey } = await startTwoFactorEnrollment(auth, user, issuer);
  return { step: "verify", totpUri, manualKey } satisfies Step;
}

export default function TwoFactorSetup() {
  const { enabled } = useLoaderData() as { enabled: boolean };
  const result = useActionData() as Step | undefined;
  const busy = useNavigation().state !== "idle";

  if (result?.step === "done") return <BackupCodes codes={result.backupCodes} />;
  if (result?.step === "verify") return <Verify {...result} busy={busy} />;

  return (
    <Shell title="Two-factor authentication">
      {enabled ? (
        <>
          <p className="mt-2 text-muted-foreground">
            Two-factor authentication is on. Every sign-in asks for a code from your authenticator
            app or one of your backup codes.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Lost your device and your backup codes? Ask whoever runs this app to reset it, then set
            it up again here.
          </p>
        </>
      ) : (
        <Form method="post">
          <p className="mt-2 text-muted-foreground">
            Add a second step to signing in: a code from an authenticator app such as Google
            Authenticator, 1Password or Authy. You will also get backup codes for when your device
            is not at hand.
          </p>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Preparing…" : "Set up two-factor authentication"}
          </button>
        </Form>
      )}
    </Shell>
  );
}

function Verify({
  totpUri,
  manualKey,
  error,
  busy,
}: {
  totpUri: string;
  manualKey: string;
  error?: string;
  busy: boolean;
}) {
  const qr = qrSvgPath(totpUri);
  return (
    <Shell title="Scan the QR code">
      <p className="mt-2 text-muted-foreground">
        Open your authenticator app, scan this code, then enter the six-digit code it shows.
      </p>
      <svg
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        role="img"
        aria-label="QR code for your authenticator app"
        className="mx-auto mt-6 h-48 w-48 rounded-md bg-white p-2 text-black"
        shapeRendering="crispEdges"
      >
        <path d={qr.path} fill="currentColor" />
      </svg>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Can't scan? Enter this key by hand: <code className="select-all break-all">{manualKey}</code>
      </p>
      <Form method="post" className="mt-6">
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="totpUri" value={totpUri} />
        <input type="hidden" name="manualKey" value={manualKey} />
        <label htmlFor="code" className="block text-sm font-medium">
          Six-digit code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          autoFocus
          required
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-center text-lg tracking-widest"
        />
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Checking…" : "Turn on"}
        </button>
      </Form>
    </Shell>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");
  return (
    <Shell title="Save your backup codes">
      <p className="mt-2 text-muted-foreground">
        Two-factor authentication is on. Each of these codes signs you in once if you can't reach
        your authenticator app. Keep them somewhere safe — they won't be shown again.
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-2 rounded-md border border-border bg-muted p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex gap-3">
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download="backup-codes.txt"
          className={secondaryButton}
        >
          Download
        </a>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(text)}
          className={secondaryButton}
        >
          Copy
        </button>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <a href="/" className="hover:underline">
          Done
        </a>
      </p>
    </Shell>
  );
}

const primaryButton =
  "mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";
const secondaryButton =
  "flex-1 rounded-md border border-border px-4 py-2 text-center text-sm font-medium hover:bg-muted";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-medium">{title}</h1>
      {children}
    </main>
  );
}
