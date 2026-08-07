---
name: ai-sdk
description: Use when writing or editing AI features — useChat, streamText, generateText, generateObject, embed, chat persistence, tool calls. Covers the correct @ai-sdk/react v3 / ai v6 API.
---

# AI SDK Reference (`ai` v6 / `@ai-sdk/react` v3)

## Setup

`createAI` from `~stencil/ai` returns a provider registry. Server-side only. No API keys needed.

```ts
import { createAI } from "~stencil/ai";
const ai = createAI(context.cloudflare.env);
```

---

## Server-side

### Chat stream

```ts
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { createAI } from "~stencil/ai";

export async function action({ request, context }: Route.ActionArgs) {
  const { messages }: { messages: UIMessage[] } = await request.json();
  const ai = createAI(context.cloudflare.env);

  const result = streamText({
    model: ai.languageModel("anthropic:claude-sonnet-4-6"),
    system: "...",
    messages: await convertToModelMessages(messages), // UIMessage[] → ModelMessage[]
  });

  // Call consumeStream() so onFinish fires even if the client disconnects
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    onFinish: async ({ messages }) => {
      // messages: UIMessage[] — full conversation including the new response
      // persist to D1 here
    },
  });
}
```

### `toUIMessageStreamResponse` options

```ts
result.toUIMessageStreamResponse({
  onFinish: async ({ messages }) => { ... }, // UIMessage[] — full conversation
  generateMessageId: () => crypto.randomUUID(),
  originalMessages: messages, // enables persistence mode (auto message ID)
  messageMetadata: ({ part }) => ({ createdAt: Date.now() }),
  sendReasoning: true,   // default true
  sendSources: false,    // default false
  onError: (error) => "An error occurred.",
});
```

### Generate text (non-streaming)

```ts
import { generateText } from "ai";
const { text } = await generateText({
  model: ai.languageModel("anthropic:claude-sonnet-4-6"),
  prompt: "...",
});
```

### Structured output

```ts
import { generateObject } from "ai";
import { z } from "zod";
const { object } = await generateObject({
  model: ai.languageModel("anthropic:claude-sonnet-4-6"),
  schema: z.object({ name: z.string(), score: z.number() }),
  prompt: "...",
});
```

### Embeddings

```ts
import { embed } from "ai";
const { embedding } = await embed({
  model: ai.textEmbeddingModel("openai:text-embedding-3-small"),
  value: "...",
});
```

---

## Client-side: `useChat`

### Basic usage

```tsx
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const { messages, sendMessage, status, stop, error } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
});

// status: "submitted" | "streaming" | "ready" | "error"
const isLoading = status === "submitted" || status === "streaming";

sendMessage({ text: input });           // send text
sendMessage({ text: input, files });    // send with file attachments
```

### Seed from DB (persistence)

```tsx
// Use `messages` option — NOT `initialMessages` (that's the old v2 API, removed in v3)
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
  messages: loaderData.history, // UIMessage[] loaded from DB in the loader
});
```

### All `useChat` options

| Option | Description |
|---|---|
| `transport` | `new DefaultChatTransport({ api, headers, body, credentials })` |
| `messages` | Seed initial messages (e.g. from DB) |
| `id` | Unique chat ID (auto-generated if omitted) |
| `onToolCall` | Fires when a client-side tool is invoked |
| `onFinish` | Fires when streaming completes |
| `onError` | Error handler |
| `onData` | Fires when a data part is received |
| `sendAutomaticallyWhen` | `({ messages }) => boolean` — auto-resubmit condition |
| `generateId` | Custom ID generator for messages |

### All `useChat` return values

| Value | Description |
|---|---|
| `messages` | `UIMessage[]` — full conversation |
| `setMessages` | Replace history programmatically |
| `sendMessage({ text, files?, metadata?, messageId? })` | Submit a message |
| `regenerate()` | Regenerate last assistant message |
| `stop()` | Abort current stream |
| `status` | `"submitted" \| "streaming" \| "ready" \| "error"` |
| `error` | Last error (if any) |
| `clearError()` | Reset error state |
| `addToolOutput(toolCallId, output)` | Return tool result to the model |

### `DefaultChatTransport` options

```ts
new DefaultChatTransport({
  api: "/api/chat",
  headers: () => ({ Authorization: `Bearer ${token}` }), // static or fn
  body: { sessionId },
  credentials: "same-origin",
})
```

---

## `UIMessage` shape

Text lives in `parts` — there is no top-level `content` field.

```ts
{
  id: string,
  role: "user" | "assistant" | "system",
  parts: [
    { type: "text", text: string, isStreaming?: boolean },
    { type: "reasoning", reasoning: string },
    { type: `tool-${toolName}`, state: "input-streaming" | "input-available" | "output-available" | "output-error", input?, output?, errorText? },
    { type: "file", filename: string, mimeType: string, url: string },
    { type: `data-${customType}`, data: any },
  ],
  metadata?: any,
}

// Extract text content:
const text = message.parts
  .filter(p => p.type === "text")
  .map(p => p.text)
  .join("");
```

---

## Full persistence pattern

```ts
// Loader — fetch history from D1
export async function loader({ context }: Route.LoaderArgs) {
  const db = createDb(context.cloudflare.env);
  const rows = await db
    .select()
    .from(chatMessages)
    .orderBy(asc(chatMessages.createdAt));
  return { history: rows };
}

// Component — seed useChat
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
  messages: loaderData.history,
});

// Action — save in onFinish
const result = streamText({
  model: ai.languageModel("anthropic:claude-sonnet-4-6"),
  messages: await convertToModelMessages(messages),
});

result.consumeStream(); // ensure onFinish fires even on client disconnect

return result.toUIMessageStreamResponse({
  onFinish: async ({ messages }) => {
    const now = new Date().toISOString();
    for (const msg of messages) {
      const content = msg.parts
        .filter(p => p.type === "text")
        .map(p => p.text)
        .join("");
      await db
        .insert(chatMessages)
        .values({ id: msg.id, role: msg.role, content, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: chatMessages.id, set: { content, updatedAt: now } });
    }
  },
});
```
