import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createProviderRegistry } from "ai";
import { BACKEND_BASE, createBackendFetch } from "./backend";

/** Create an AI provider registry proxied through the Stencil backend service. Supports `openai:*` and `anthropic:*` model IDs — no API keys required in the app. */
export function createAI(env: Env) {
  const backendFetch = createBackendFetch(env);

  const openai = createOpenAI({
    baseURL: `${BACKEND_BASE}/ai/openai/v1`,
    apiKey: "unused",
    fetch: backendFetch,
  });

  const anthropic = createAnthropic({
    baseURL: `${BACKEND_BASE}/ai/anthropic`,
    apiKey: "unused",
    fetch: backendFetch,
  });

  return createProviderRegistry({ openai, anthropic });
}

export type AI = ReturnType<typeof createAI>;
