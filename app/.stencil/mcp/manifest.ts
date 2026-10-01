import type { z } from "zod";
import type { AuthUser } from "../types/auth";

/** The authenticated app user a tool call runs as — the same shape a loader
 *  gets from requireAuth, so a tool scopes its data the same way. */
export type McpMember = AuthUser;

/** Passed to every tool handler. Scope reads and writes to `member`. */
export interface McpToolContext {
  env: Env;
  member: McpMember;
}

export interface McpTool<S extends z.ZodType = z.ZodType> {
  /** Stable tool id the AI client calls, e.g. `"create_task"`. */
  name: string;
  /** One line telling the model what the tool does and when to reach for it. */
  description: string;
  /** Zod schema for the arguments; also published to clients as JSON Schema. */
  input: S;
  // Method (not arrow) so a heterogeneous `tools` array keeps each handler's
  // args inferred from its own schema instead of collapsing to `unknown`.
  handler(args: z.infer<S>, ctx: McpToolContext): unknown | Promise<unknown>;
}

export interface McpManifest {
  /** Server name shown to the connecting AI client. */
  name: string;
  description?: string;
  tools: McpTool[];
}

/** Declare a tool with its handler args inferred from `input`. */
export function tool<S extends z.ZodType>(t: McpTool<S>): McpTool<S> {
  return t;
}
