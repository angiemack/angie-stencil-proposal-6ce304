import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { ActionFunctionArgs } from "react-router";
import { createAuth } from "../../auth/utils";
import * as authSchema from "../../auth/schema";
import { createBackendFetch, BACKEND_BASE } from "../../backend";
import { ensureMcpTables } from "../../mcp/ensure-tables";
import { loadMcpManifest } from "../../mcp/app-manifest";
import type { McpManifest, McpMember } from "../../mcp/manifest";

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

// A browser-based client must be able to read the JSON reply and the auth
// challenge cross-origin; `WWW-Authenticate` is invisible to it unless exposed.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function rpc(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS, ...headers } });
}

// RFC 9728: the challenge names where a client goes to authenticate. Without it
// an "add connector" flow cannot start OAuth and reports a bare failure.
function unauthorized(origin: string) {
  return rpc(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
    401,
    {
      "WWW-Authenticate":
        `Bearer error="invalid_token", ` +
        `error_description="Authentication required", ` +
        `resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    },
  );
}

function methodNotAllowed() {
  return rpc(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed" } },
    405,
    { Allow: "POST" },
  );
}

export async function loader() {
  return methodNotAllowed();
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return methodNotAllowed();

  const { env, ctx } = context.cloudflare;
  const origin = new URL(request.url).origin;

  // No tools declared means the app is not an MCP server, so the endpoint does
  // not exist — a 404 lets a client abandon it, where a 401 would loop on auth.
  const manifest = loadMcpManifest();
  if (!manifest) return new Response("Not found", { status: 404, headers: CORS });

  // Reject before touching auth or the database: this is a public endpoint that
  // will be scanned, and resolving a token that was never sent is free load.
  if (!request.headers.get("Authorization")?.startsWith("Bearer ")) {
    return unauthorized(origin);
  }

  // Token validation reads oauth_access_token, which apps created before MCP
  // shipped do not have yet.
  await ensureMcpTables(env);

  const auth = createAuth(env, false, ctx, request);
  // getMcpSession is added by the mcp plugin, which auth/utils.ts casts to
  // BetterAuthPlugin (to keep TS4058 out of createAuth's type); that cast drops
  // the plugin's endpoints from api, so re-assert the one this route calls.
  const mcpApi = auth.api as typeof auth.api & {
    getMcpSession: (ctx: { headers: Headers }) => Promise<{ userId: string | null } | null>;
  };
  const session = await mcpApi.getMcpSession({ headers: request.headers });
  if (!session?.userId) return unauthorized(origin);

  const db = drizzle(env.DB, { schema: authSchema });
  const [member] = await db
    .select({
      id: authSchema.user.id,
      name: authSchema.user.name,
      email: authSchema.user.email,
      emailVerified: authSchema.user.emailVerified,
      image: authSchema.user.image,
      createdAt: authSchema.user.createdAt,
      updatedAt: authSchema.user.updatedAt,
    })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, session.userId))
    .limit(1);
  if (!member) return unauthorized(origin);

  return dispatch(request, manifest, member, env, ctx);
}

/**
 * Usage telemetry only — the tool name and outcome, never arguments or results.
 * Fire-and-forget through the backend service; a telemetry failure must never
 * fail the tool call it measures.
 */
function reportToolCall(
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  call: { tool: string; memberId: string; outcome: "ok" | "error"; errorType?: string; durationMs: number },
) {
  const backendFetch = createBackendFetch(env);
  ctx.waitUntil(
    backendFetch(`${BACKEND_BASE}/analytics/mcp-tool-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: call.tool,
        outcome: call.outcome,
        error_type: call.errorType ?? null,
        duration_ms: call.durationMs,
        member_id: call.memberId,
      }),
    }).then(
      () => {},
      () => {},
    ),
  );
}

async function dispatch(
  request: Request,
  manifest: McpManifest,
  member: McpMember,
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
) {
  let req: JsonRpcRequest;
  try {
    req = await request.json();
  } catch {
    return rpc({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const id = req.id ?? null;
  const ok = (result: unknown) => rpc({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => rpc({ jsonrpc: "2.0", id, error: { code, message } });

  // A notification carries no id and must get no response body.
  if (req.method?.startsWith("notifications/")) return new Response(null, { status: 204, headers: CORS });

  if (req.method === "initialize") {
    const asked = req.params?.protocolVersion;
    return ok({
      protocolVersion: typeof asked === "string" ? asked : DEFAULT_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: manifest.name, version: "1.0.0" },
      ...(manifest.description ? { instructions: manifest.description } : {}),
    });
  }

  if (req.method === "tools/list") {
    return ok({
      tools: manifest.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: z.toJSONSchema(t.input),
      })),
    });
  }

  if (req.method === "tools/call") {
    const params = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    if (!params?.name) return fail(-32602, "Missing tool name");

    const tool = manifest.tools.find((t) => t.name === params.name);
    if (!tool) {
      reportToolCall(env, ctx, { tool: params.name, memberId: member.id, outcome: "error", errorType: "unknown_tool", durationMs: 0 });
      return fail(-32601, `Unknown tool: ${params.name}`);
    }

    const parsed = tool.input.safeParse(params.arguments ?? {});
    if (!parsed.success) {
      reportToolCall(env, ctx, { tool: tool.name, memberId: member.id, outcome: "error", errorType: "invalid_args", durationMs: 0 });
      return ok({ content: [{ type: "text", text: z.prettifyError(parsed.error) }], isError: true });
    }

    const started = Date.now();
    try {
      const result = await tool.handler(parsed.data, { env, member });
      reportToolCall(env, ctx, { tool: tool.name, memberId: member.id, outcome: "ok", durationMs: Date.now() - started });
      return ok({ content: [{ type: "text", text: JSON.stringify(result) }] });
    } catch (err) {
      // A tool failure is a result with isError (the model still reads it), not a
      // JSON-RPC error. The message may carry internals, so log it and stay generic.
      console.error("[mcp] tool handler failed", err);
      reportToolCall(env, ctx, { tool: tool.name, memberId: member.id, outcome: "error", errorType: "tool_error", durationMs: Date.now() - started });
      return ok({ content: [{ type: "text", text: "The tool failed to run." }], isError: true });
    }
  }

  return fail(-32601, "Method not found");
}
