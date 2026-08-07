import { BACKEND_BASE, createBackendFetch } from "./backend";

export interface FetchedPage {
  /** The page's main content as clean markdown. */
  markdown: string;
  /** Internal links found on the page (same host). */
  links: string[];
}

/**
 * Fetch one known URL's content as clean markdown (Firecrawl), proxied through
 * the Stencil backend — no API key needed in the app. Server-side only.
 *
 * Use this when you already HAVE a URL and want its content (e.g. read/monitor a
 * specific page). To discover pages you do NOT have URLs for, use `createSearch`
 * (~stencil/search) instead — and note that search can already return page content
 * inline, so you rarely need to fetch a result it gave you.
 *
 * ```ts
 * const web = createFetch(env);
 * const { markdown } = await web.page("https://example.com/call-for-speakers");
 * ```
 */
export function createFetch(env: Env) {
  const backendFetch = createBackendFetch(env);

  return {
    /** Fetch a single URL and return its main content as markdown. */
    async page(url: string): Promise<FetchedPage> {
      const res = await backendFetch(`${BACKEND_BASE}/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
      const data = (await res.json()) as { markdown?: string; links?: string[] };
      return { markdown: data.markdown ?? "", links: data.links ?? [] };
    },
  };
}

export type Fetch = ReturnType<typeof createFetch>;
