// Internal plumbing — use createAI, createEmail, etc. instead. Never import this directly in app code.
export const BACKEND_BASE = "https://backend.hellostencil.com";

/** Returns a fetch function that routes requests through the Stencil backend service with bearer auth. */
export function createBackendFetch(env: Env) {
  return function backendFetch(input: RequestInfo | URL, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (env.BACKEND_SERVICE_API_KEY) {
      headers.set("Authorization", `Bearer ${env.BACKEND_SERVICE_API_KEY}`);
    }
    const req = new Request(input, { ...init, headers });
    return env.BACKEND_SERVICE ? env.BACKEND_SERVICE.fetch(req) : fetch(req);
  };
}
