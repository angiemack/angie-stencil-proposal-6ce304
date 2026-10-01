/**
 * The MCP server SDK: declare tools in `app/mcp.ts` with `tool()` and the
 * platform serves them at `/mcp`.
 *
 * The routes that expose them are a separate, React Router-specific concern —
 * spread `stencilMcpRoutes` from `./.stencil/react-router/mcp/routes` into
 * `app/routes.ts`.
 */
export { ensureMcpTables } from "./ensure-tables";
export {
  tool,
  type McpManifest,
  type McpTool,
  type McpToolContext,
  type McpMember,
} from "./manifest";
