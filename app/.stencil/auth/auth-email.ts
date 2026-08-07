/**
 * Themed transactional emails for the auth flow (password reset, email
 * verification). The generated app's login page renders in the app's own
 * design language; these emails match it by pulling the same design tokens out
 * of the app's live `/theme.css` and inlining them.
 *
 * Two constraints shape everything here:
 *  - Email clients don't support external stylesheets or CSS custom
 *    properties, so every token has to be resolved to a literal value and
 *    written as an inline `style` attribute.
 *  - Most clients (notably Gmail/Outlook) don't render `oklch()` — the color
 *    space the theme tokens are authored in — so colors are converted to sRGB
 *    hex before they're used.
 *
 * Platform-owned: this file is refreshed onto existing apps by the builder's
 * `refreshPlatformLibs` (see `sandbox/builder/scenarios/build/prepare.ts`).
 */

import { createEmail } from "../email";

/** Convert an `oklch(L C H[/a])` string to an sRGB hex color, or null if it
 *  doesn't parse. Implements the standard OKLab → linear sRGB → gamma pipeline. */
function oklchToHex(value: string): string | null {
  const m = value
    .trim()
    .match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return null;

  let L = parseFloat(m[1]);
  if (m[1].endsWith("%")) L /= 100;
  const C = parseFloat(m[2]);
  const H = parseFloat(m[3]);
  if (!Number.isFinite(L) || !Number.isFinite(C) || !Number.isFinite(H)) {
    return null;
  }

  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];

  const toByte = (x: number): string => {
    const srgb =
      x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    const clamped = Math.round(Math.max(0, Math.min(1, srgb)) * 255);
    return clamped.toString(16).padStart(2, "0");
  };

  return `#${linear.map(toByte).join("")}`;
}

/** Resolve a raw CSS color token to an email-safe value. Passes hex/rgb
 *  through, converts oklch, and returns null for anything it can't statically
 *  resolve (`color-mix()`, `var()`, …) so the caller uses a fallback. */
function resolveColor(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^rgba?\(/i.test(v)) return v;
  if (/^oklch\(/i.test(v)) return oklchToHex(v);
  return null;
}

interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  muted: string;
  border: string;
  radius: string;
  fontFamily: string;
}

const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const FALLBACK_PALETTE: Palette = {
  background: "#f4f4f5",
  foreground: "#18181b",
  card: "#ffffff",
  cardForeground: "#18181b",
  primary: "#18181b",
  primaryForeground: "#ffffff",
  muted: "#71717a",
  border: "#e4e4e7",
  radius: "8px",
  fontFamily: SYSTEM_FONT_STACK,
};

/** Extract the handful of tokens the email needs from an app's `theme.css`,
 *  resolving each independently and falling back per-token. Dark-mode overrides
 *  are ignored — transactional email renders on a light background. */
function paletteFromThemeCss(css: string): Palette {
  // Everything before the first `.dark` selector is the light-mode `:root`.
  const light = css.split(/\.dark\b/)[0] ?? css;
  const token = (name: string): string | undefined => {
    const m = light.match(new RegExp(`--${name}\\s*:\\s*([^;}]+)`));
    return m ? m[1].trim() : undefined;
  };
  const color = (name: string, fallback: string): string =>
    resolveColor(token(name)) ?? fallback;

  const fontDecl = token("font-sans") ?? token("font-display");

  return {
    background: color("background", FALLBACK_PALETTE.background),
    foreground: color("foreground", FALLBACK_PALETTE.foreground),
    card: color("card", FALLBACK_PALETTE.card),
    cardForeground: color("card-foreground", FALLBACK_PALETTE.cardForeground),
    primary: color("primary", FALLBACK_PALETTE.primary),
    primaryForeground: color(
      "primary-foreground",
      FALLBACK_PALETTE.primaryForeground,
    ),
    muted: color("muted-foreground", FALLBACK_PALETTE.muted),
    border: color("border", FALLBACK_PALETTE.border),
    radius: token("radius") ?? FALLBACK_PALETTE.radius,
    fontFamily: fontDecl
      ? `${fontDecl}, ${SYSTEM_FONT_STACK}`
      : FALLBACK_PALETTE.fontFamily,
  };
}

/** Fetch the app's live theme so the email matches its login page. Best-effort:
 *  any failure yields the neutral fallback palette rather than blocking send. */
async function loadPalette(origin: string | null): Promise<Palette> {
  if (!origin) return FALLBACK_PALETTE;
  try {
    const res = await fetch(`${origin}/theme.css`, {
      headers: { Accept: "text/css" },
    });
    if (!res.ok) return FALLBACK_PALETTE;
    return paletteFromThemeCss(await res.text());
  } catch {
    return FALLBACK_PALETTE;
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface AuthEmailParams {
  /** Origin of the app, used to load its theme. Null → neutral palette. */
  origin: string | null;
  heading: string;
  intro: string;
  /** Link mode (reset / verification / magic link): action button label + URL. */
  buttonLabel?: string;
  /** The action link built by Better Auth. Provide this OR `code`. */
  actionUrl?: string;
  /** Code mode (email OTP): a one-time code shown prominently instead of a link. */
  code?: string;
  footer: string;
}

export interface AuthEmail {
  subject: string;
  html: string;
  text: string;
}

/** Build a themed transactional email (subject/html/text) for an auth action. */
export async function buildAuthEmail(
  params: AuthEmailParams,
): Promise<AuthEmail> {
  const { heading, intro, buttonLabel, actionUrl, code, footer } = params;
  const p = await loadPalette(params.origin);

  // Two shapes: a link (button + copy-paste URL) or a one-time code block.
  const body = code
    ? `<div style="font-family:${p.fontFamily};font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;color:${p.cardForeground};background:${p.background};border:1px solid ${p.border};border-radius:${p.radius};padding:18px 12px;">${escapeHtml(code)}</div>`
    : `<table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:${p.radius};background:${p.primary};">
                    <a href="${escapeHtml(actionUrl ?? "#")}" style="display:inline-block;padding:12px 28px;font-family:${p.fontFamily};font-size:15px;font-weight:600;color:${p.primaryForeground};text-decoration:none;border-radius:${p.radius};">${escapeHtml(buttonLabel ?? "Continue")}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 8px;font-size:13px;line-height:1.6;color:${p.muted};">Or copy and paste this link into your browser:</p>
              <p style="margin:0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${escapeHtml(actionUrl ?? "#")}" style="color:${p.primary};">${escapeHtml(actionUrl ?? "")}</a></p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${p.background};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${p.background};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:${p.card};color:${p.cardForeground};border:1px solid ${p.border};border-radius:${p.radius};overflow:hidden;">
          <tr>
            <td style="padding:40px 40px 32px;font-family:${p.fontFamily};">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:${p.cardForeground};">${escapeHtml(heading)}</h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${p.muted};">${escapeHtml(intro)}</p>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid ${p.border};font-family:${p.fontFamily};">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${p.muted};">${escapeHtml(footer)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const action = code ? `Code: ${code}` : `${buttonLabel ?? "Continue"}: ${actionUrl ?? ""}`;
  const text = `${heading}\n\n${intro}\n\n${action}\n\n${footer}`;

  return { subject: heading, html, text };
}

/** Build a themed auth email and send it through the platform email path — the
 *  single entry point every Better Auth callback (reset, verify, magic link,
 *  OTP) uses instead of pairing `buildAuthEmail` with `createEmail(...).send`. */
export async function sendAuthEmail(
  env: Env,
  to: string,
  params: AuthEmailParams,
): Promise<void> {
  const email = await buildAuthEmail(params);
  await createEmail(env).send({ to, ...email });
}
