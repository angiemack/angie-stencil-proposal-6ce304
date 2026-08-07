import type { Config } from "@react-router/dev/config";
import prerender from "./prerender";

export default {
  ssr: true,
  prerender,
  future: { v8_viteEnvironmentApi: true },
} satisfies Config;
