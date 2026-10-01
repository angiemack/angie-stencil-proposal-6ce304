/**
 * The app user a request belongs to, when the app serves app-user subdomains.
 *
 * On a domain the app builder switched subdomains on for, the dispatcher serves
 * `<label>.<apex>` from this app and stamps the label and the apex on the
 * request. It strips any inbound copy first, so these headers are the platform's
 * word and the only thing worth trusting — never parse `Host` yourself, which
 * is caller-controlled and does not know whether subdomains are switched on.
 *
 * Which app user holds a label is this app's question alone. When nobody does,
 * `requireTenant` throws a response carrying the tenant-miss marker and the
 * dispatcher applies the app builder's setting for unclaimed subdomains.
 */

import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as authSchema from "./auth/schema";
import type { AuthUser } from "./types/auth";
import type { Tenant } from "./types/tenant";

export type { Tenant } from "./types/tenant";

/** The subdomain the request arrived on. */
const TENANT_HEADER = "x-stencil-tenant";
/** The domain app-user subdomains are served under. */
const TENANT_DOMAIN_HEADER = "x-stencil-tenant-domain";
/** Tells the dispatcher nobody holds the subdomain that was asked for. */
const TENANT_MISS_HEADER = "x-stencil-tenant-miss";

let ensured = false;

/**
 * Add the user columns and the released-word table that apps provisioned
 * before them lack. Runs once per isolate; a duplicate column is what an
 * already-migrated app looks like, so it is the expected path, not an error.
 */
export async function ensureTenantSchema(env: Env): Promise<void> {
  if (ensured) return;
  for (const column of ["subdomain", "signup_attribution"]) {
    try {
      await env.DB.prepare(`ALTER TABLE \`user\` ADD COLUMN \`${column}\` text`).run();
    } catch (err) {
      if (!/duplicate column name/i.test(String(err))) throw err;
    }
  }
  await env.DB.batch([
    env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS `user_subdomain_unique` ON `user` (`subdomain`);",
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS `released_subdomain` (`subdomain` text PRIMARY KEY NOT NULL, `user_id` text, `released_at` integer NOT NULL);",
    ),
  ]);
  ensured = true;
}

/**
 * The domain app-user subdomains are served under, or null when this request is
 * not on one. Read it rather than the Host: only the platform knows whether the
 * app builder switched subdomains on for the domain.
 */
export function tenantDomain(request: Request): string | null {
  return request.headers.get(TENANT_DOMAIN_HEADER);
}

/** One resolution per request, so several loaders on a page cost one query. */
const perRequest = new WeakMap<Request, Promise<Tenant | null>>();

/**
 * The app user whose subdomain this request arrived on.
 *
 * Null when the request is not on a subdomain at all (the domain itself, the
 * Stencil address, local dev) and when the label belongs to nobody.
 */
export function getTenant(request: Request, env: Env): Promise<Tenant | null> {
  const cached = perRequest.get(request);
  if (cached) return cached;
  const pending = resolveTenant(request, env);
  perRequest.set(request, pending);
  return pending;
}

async function resolveTenant(request: Request, env: Env): Promise<Tenant | null> {
  const subdomain = request.headers.get(TENANT_HEADER);
  const domain = request.headers.get(TENANT_DOMAIN_HEADER);
  if (!subdomain || !domain) return null;

  await ensureTenantSchema(env);
  const db = drizzle(env.DB, { schema: authSchema });
  const [row] = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.subdomain, subdomain))
    .limit(1);
  return row ? { subdomain, domain, user: row as AuthUser } : null;
}

/**
 * The app user this request belongs to, or a thrown tenant-miss response.
 *
 * Use it in a loader that only makes sense on someone's own address. The body
 * is the app's own 404 page; the marker on it is what lets the dispatcher send
 * the visitor to the domain instead, when the app builder asked for that.
 */
export async function requireTenant(request: Request, env: Env): Promise<Tenant> {
  const tenant = await getTenant(request, env);
  if (!tenant)
    throw new Response("Not found", {
      status: 404,
      headers: { [TENANT_MISS_HEADER]: "1" },
    });
  return tenant;
}

/**
 * The address of an app user's own space — the only sanctioned way to build one.
 *
 * Off a tenant domain (the Stencil address, local dev) there is no subdomain to
 * build, so it stays on the current origin and the app keeps working with one
 * set of links.
 */
export function tenantUrl(
  request: Request,
  tenant: Tenant | string,
  path = "/",
): string {
  const domain = request.headers.get(TENANT_DOMAIN_HEADER);
  const subdomain = typeof tenant === "string" ? tenant : tenant.subdomain;
  const base = domain
    ? `https://${subdomain}.${domain}`
    : new URL(request.url).origin;
  return new URL(path, base).toString();
}

/** A subdomain word: lowercase letters, digits and inner hyphens, 1–63 chars (a DNS label). */
export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** How long a released word stays blocked, so links to it don't land on someone else. */
const RELEASE_HOLD_DAYS = 30;

// Subdomains no app user may claim on any domain — the names people assume are
// the app builder's own, plus the ones mail and tooling reach for. Mirrors the
// platform's own list; this layer ships into app sandboxes and cannot import it.
const RESERVED = new Set([
  "www", "app", "apps", "mail", "email", "smtp", "imap", "pop", "webmail",
  "api", "admin", "administrator", "root", "help", "support", "status",
  "blog", "docs", "dev", "staging", "test", "static", "cdn", "assets",
  "billing", "account", "accounts", "login", "auth", "signup", "dashboard",
  "ftp", "ns1", "ns2", "mx", "autodiscover", "autoconfig", "_acme-challenge",
]);

/** The words the app builder blocked on the Domains card, written there by Stencil. */
const RESERVED_WORDS_KEY = "__stencil/reserved-subdomains.json";

/** Whether a word may be claimed, and why not when it may not. */
export type SubdomainCheck = { ok: true } | { ok: false; reason: string };

// A claim must never fail because of the file: no object, an unreadable one or
// a storage error all fall back to the built-in list alone.
async function reservedWords(env: Env): Promise<Set<string>> {
  try {
    const obj = await env.STORAGE.get(RESERVED_WORDS_KEY);
    if (!obj) return RESERVED;
    const words = (await obj.json()) as unknown;
    if (!Array.isArray(words)) return RESERVED;
    return new Set([...RESERVED, ...words.filter((w) => typeof w === "string")]);
  } catch {
    return RESERVED;
  }
}

/**
 * Whether `word` is free for `userId` to claim: right shape, not reserved, not
 * held by anyone else, and not released by someone else inside the hold window.
 * The word is lowercased first — an app user typing capitals means the same word.
 */
export async function checkSubdomain(
  request: Request,
  env: Env,
  word: string,
  userId: string,
): Promise<SubdomainCheck> {
  const subdomain = word.trim().toLowerCase();
  if (!SUBDOMAIN_RE.test(subdomain))
    return { ok: false, reason: "Use 1–63 letters, numbers or hyphens, starting and ending with a letter or number." };
  if ((await reservedWords(env)).has(subdomain))
    return { ok: false, reason: "That word is reserved." };

  await ensureTenantSchema(env);
  const db = drizzle(env.DB, { schema: authSchema });

  const [holder] = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.subdomain, subdomain))
    .limit(1);
  if (holder && holder.id !== userId) return { ok: false, reason: "That address is already taken." };

  const [released] = await db
    .select()
    .from(authSchema.releasedSubdomain)
    .where(eq(authSchema.releasedSubdomain.subdomain, subdomain))
    .limit(1);
  if (released && released.userId !== userId) {
    const free = released.releasedAt.getTime() + RELEASE_HOLD_DAYS * 86_400_000;
    if (free > Date.now())
      return {
        ok: false,
        reason: `That address was recently in use. It frees up on ${new Date(free).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}.`,
      };
  }
  return { ok: true };
}

/**
 * Give `userId` the subdomain `word`, or clear theirs when `word` is empty.
 *
 * Takes the app user id rather than reading the session, so an app's own admin
 * screen can set one on behalf of another app user — which means the caller
 * owns that authorization decision. The platform's own endpoint only ever
 * passes the signed-in app user's id.
 */
export async function setSubdomain(
  request: Request,
  env: Env,
  userId: string,
  word: string,
): Promise<SubdomainCheck> {
  const subdomain = word.trim().toLowerCase();
  if (subdomain) {
    const check = await checkSubdomain(request, env, subdomain, userId);
    if (!check.ok) return check;
  } else {
    await ensureTenantSchema(env);
  }

  const db = drizzle(env.DB, { schema: authSchema });
  const [current] = await db
    .select({ subdomain: authSchema.user.subdomain })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);
  if (current?.subdomain === subdomain) return { ok: true };

  // The word being given up goes on hold, and the one being taken comes off it:
  // an app user reclaiming their own former address should not wait out the hold
  // they started.
  if (current?.subdomain)
    await db
      .insert(authSchema.releasedSubdomain)
      .values({ subdomain: current.subdomain, userId, releasedAt: new Date() })
      .onConflictDoUpdate({
        target: authSchema.releasedSubdomain.subdomain,
        set: { userId, releasedAt: new Date() },
      });

  try {
    await db
      .update(authSchema.user)
      .set({ subdomain: subdomain || null })
      .where(eq(authSchema.user.id, userId));
  } catch (err) {
    // Two app users claiming the same word at once: the unique index decides.
    if (/UNIQUE constraint failed/i.test(String(err)))
      return { ok: false, reason: "That address is already taken." };
    throw err;
  }
  if (subdomain)
    await db
      .delete(authSchema.releasedSubdomain)
      .where(eq(authSchema.releasedSubdomain.subdomain, subdomain));
  return { ok: true };
}
