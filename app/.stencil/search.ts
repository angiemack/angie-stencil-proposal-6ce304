import { BACKEND_BASE, createBackendFetch } from "./backend";

export interface SearchResult {
  title: string | null;
  url: string;
  publishedDate?: string;
  author?: string;
  /** Present when you set includeText — the page's extracted text. */
  text?: string;
  /** Present when you set includeHighlights — the most relevant snippets. */
  highlights?: string[];
  /** Present when you set includeSummary — a short AI summary of the page. */
  summary?: string;
}

/**
 * Synthesized answer from the agentic "deep" search types (`deep`,
 * `deep-reasoning`). Standard searches don't produce this.
 */
export interface SearchOutput {
  /** The synthesized answer — a string by default, or a structured object when
   *  you passed `outputSchema`. */
  content: string | Record<string, unknown>;
  /** Field-level citations Exa used to ground the synthesized content. */
  grounding?: unknown;
}

/**
 * The result array, with an optional `output` attached for deep searches. It is
 * a plain `SearchResult[]` — iterate/map it as usual — plus `.output` carries the
 * synthesized answer when you used a `deep`/`deep-reasoning` type.
 */
export type SearchResults = SearchResult[] & { output?: SearchOutput };

export interface SearchOptions {
  /** How many results (default 10, up to 100). */
  numResults?: number;
  /**
   * Retrieval mode. Defaults to `"auto"` (Exa picks for you).
   * - `"fast"` / `"instant"` — lower latency, some quality trade-off.
   * - `"deep-lite"` / `"deep"` / `"deep-reasoning"` — agentic multi-source
   *   research that also synthesizes an answer (see `outputSchema` and the
   *   `output` field on the result). Costs ~2× a standard search and takes
   *   several seconds, so reserve it for explicit, user-invoked background
   *   research — never interactive (loader) or scheduled-handler paths.
   * - `"neural"` / `"keyword"` — LEGACY Exa modes, kept for back-compat; prefer
   *   `"auto"`.
   */
  type?:
    | "auto"
    | "fast"
    | "instant"
    | "deep-lite"
    | "deep"
    | "deep-reasoning"
    | "neural"
    | "keyword";
  /** Bias to a kind of page, e.g. "company", "news", "research paper", "pdf". */
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  /** Pull the page's content back inline so you don't need a second fetch. */
  includeText?: boolean;
  includeHighlights?: boolean;
  includeSummary?: boolean;
  /** JSON schema for `deep`/`deep-reasoning` structured synthesis. When set, the
   *  result's `output.content` is an object matching this schema instead of a
   *  string. Ignored by non-deep types. */
  outputSchema?: Record<string, unknown>;
}

/**
 * Web search for this app's runtime (Exa), proxied through the Stencil backend —
 * no API key needed in the app. Server-side only (loaders / actions / scheduled
 * handlers), never from the browser.
 *
 * Use this for **discovery** — when you do NOT have a URL and need to find pages
 * matching a query. Set `includeText`/`includeSummary` and it returns the page
 * content inline, so you usually don't need a separate fetch afterward. If you
 * already HAVE a URL and just want its content, use `createFetch` (~stencil/fetch).
 *
 * ```ts
 * const s = createSearch(env);
 * const leads = await s.search("podcasts booking female keynote speakers 2026", {
 *   numResults: 20, includeSummary: true, category: "company",
 * });
 * ```
 */
export function createSearch(env: Env) {
  const backendFetch = createBackendFetch(env);

  async function call(path: string, body: Record<string, unknown>): Promise<SearchResults> {
    const res = await backendFetch(`${BACKEND_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Web search failed: HTTP ${res.status}`);
    const data = (await res.json()) as { results?: SearchResult[]; output?: SearchOutput };
    const results = (data.results ?? []) as SearchResults;
    if (data.output !== undefined) results.output = data.output;
    return results;
  }

  return {
    /** Find pages matching a query. */
    search(query: string, opts: SearchOptions = {}) {
      return call("/search", { query, ...opts });
    },
    /** Find pages similar to a URL you already have (discovery from an example). */
    findSimilar(url: string, opts: SearchOptions = {}) {
      return call("/search/similar", { url, ...opts });
    },
  };
}

export type Search = ReturnType<typeof createSearch>;
