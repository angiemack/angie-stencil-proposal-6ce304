import { mcp } from "~/mcp";
import type { McpManifest } from "./manifest";

/**
 * The app's MCP manifest, or null when it declares no tools — which is what
 * keeps `/mcp` and the OAuth discovery documents hidden for apps that don't use
 * MCP. `app/mcp.ts` always exists (the template ships it with `tools: []`), so
 * this is a plain static import.
 *
 * Deliberately NOT re-exported from `~stencil/mcp`. Apps import `tool` from that
 * barrel, so a barrel that reached back here would close a cycle
 * (app-manifest → app/mcp → mcp/index → app-manifest). Nothing outside the
 * route modules needs this function.
 */
export function loadMcpManifest(): McpManifest | null {
  if (!mcp || mcp.tools.length === 0) return null;
  return mcp;
}
