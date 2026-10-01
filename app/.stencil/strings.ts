import bundledStrings from "~/strings/strings.json";

// Published strings change only on publish, which deploys a new script version and
// so recycles this isolate; the TTL covers the window where a fresh isolate reads
// the object just before the publish promotes the draft copy over it.
const CACHE_TTL_MS = 60_000;
let cached: { key: string; strings: Record<string, unknown>; expiresAt: number } | null = null;

export async function loadStringsFromStorage(
  env: { STORAGE: R2Bucket; IS_DRAFT?: string; APP_ID?: string },
): Promise<Record<string, unknown>> {
  const isDraft = env.IS_DRAFT === "true";
  const key = isDraft ? "__stencil/strings.draft.json" : "__stencil/strings.json";
  const cacheKey = `${env.APP_ID}:${key}`;
  // Draft strings are edited live between builds (copy editing), so the draft
  // slot always reads from storage.
  if (!isDraft && cached?.key === cacheKey && cached.expiresAt > Date.now()) {
    return cached.strings;
  }
  const obj = await env.STORAGE.get(key);
  // R2 is the live source; fall back to the strings baked into the bundle when it
  // has no object (fresh app, or a failed strings push) so copy is never blank.
  const strings: Record<string, unknown> = obj ? await obj.json() : bundledStrings;
  if (!isDraft) cached = { key: cacheKey, strings, expiresAt: Date.now() + CACHE_TTL_MS };
  return strings;
}
