import { createRequestHandler } from "react-router";
import { loadStringsFromStorage } from "~stencil/strings";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
      strings: await loadStringsFromStorage(env),
    });
  },
} satisfies ExportedHandler<Env>;
