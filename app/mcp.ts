/**
 * Declarative MCP tool manifest for this app.
 *
 * Declaring one or more tools here turns the app into an MCP server: it exposes
 * a `/mcp` endpoint AI clients (claude.ai, ChatGPT) can connect to, plus the
 * OAuth discovery documents they use to sign the app user in. Declare nothing
 * and none of that surface exists — an app without tools advertises no MCP.
 *
 * Each tool has a zod `input` schema (published to the client as JSON Schema)
 * and a `handler`. The handler runs as the connected app user: `ctx.member`
 * is that member, so scope every read and write to it exactly as a loader does.
 *
 * Example:
 *
 *   import { z } from "zod";
 *   import { createDb } from "~stencil/db";
 *   import { tasks } from "~/generated/db-schema";
 *
 *   export const mcp: McpManifest = {
 *     name: "Tasks",
 *     description: "Create and list the member's tasks.",
 *     tools: [
 *       tool({
 *         name: "create_task",
 *         description: "Create a task for the signed-in member.",
 *         input: z.object({ title: z.string() }),
 *         handler: async ({ title }, { env, member }) => {
 *           const db = createDb(env);
 *           const now = new Date().toISOString();
 *           const [task] = await db
 *             .insert(tasks)
 *             .values({ id: crypto.randomUUID(), title, createdBy: member.id, createdAt: now, updatedAt: now })
 *             .returning();
 *           return task;
 *         },
 *       }),
 *     ],
 *   };
 */
import type { McpManifest } from "~stencil/mcp";

export const mcp: McpManifest = {
  name: "My App",
  tools: [],
};
