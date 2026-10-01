import type { Config } from "@react-router/dev/config";
import prerender from "./prerender";

const enabled = process.env.STENCIL_PRERENDER === "1" && prerender.length > 0;

export default {
  ssr: true,
  prerender: enabled ? prerender : false,
  future: { v8_viteEnvironmentApi: true, unstable_previewServerPrerendering: true },
} satisfies Config;
