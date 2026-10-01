import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { sourceTagger } from "./app/.stencil/vite/source-tagger";

export default defineConfig({
  build: {
    assetsDir: "static",
    reportCompressedSize: false,
    minify: process.env.NO_MINIFY === "1" ? false : "esbuild",
  },
  // Workaround: local dev might be inside another project and resolve the wrong react-router version
  resolve: {
    alias: { "react-router-dom": "react-router" },
    dedupe: ["react-router", "react", "react-dom"],
  },
  // Workaround: large SSR bundles break the Cloudflare plugin's manifest.
  // https://github.com/remix-run/react-router/issues/13226
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: {
            "server-build": "virtual:react-router/server-build",
            index: "./workers/app.ts",
          },
        },
      },
    },
  },
  plugins: [
    sourceTagger({ enabled: process.env.STENCIL_SOURCE_TAGS === "1" }),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
