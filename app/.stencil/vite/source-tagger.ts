import { parse } from "@babel/parser";
import type { Node } from "@babel/types";
import MagicString from "magic-string";
import type { Plugin } from "vite";

/**
 * Tags every JSX element with `data-original-path="<project-relative file>"` so the
 * preview can map a rendered DOM node back to its source module. Injected as the first
 * attribute, so a component's spread props (carrying the usage site's tag) win on the DOM.
 */
export function sourceTagger(options: { enabled: boolean }): Plugin {
  let root = "";
  return {
    name: "stencil:source-tagger",
    // Must see the original TSX, before Vite's esbuild pass compiles the JSX away.
    enforce: "pre",
    apply: () => options.enabled,
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      if (id.includes("?") || !/\.[jt]sx$/.test(id)) return;
      if (!id.startsWith(`${root}/`) || id.includes("/node_modules/")) return;
      const relativePath = id.slice(root.length + 1);

      let ast: Node;
      try {
        ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
      } catch {
        // A file Babel can't parse still bundles via esbuild — leave it untagged.
        return;
      }

      const source = new MagicString(code);
      let tagged = false;
      walk(ast, (node) => {
        if (node.type !== "JSXOpeningElement") return;
        // After any generic type arguments (`<Foo<T> …>`), so the tag lands first
        // in the attribute list.
        const anchor = node.typeArguments ?? node.typeParameters ?? node.name;
        if (anchor.end == null) return;
        source.appendLeft(anchor.end, ` data-original-path=${JSON.stringify(relativePath)}`);
        tagged = true;
      });
      if (!tagged) return;

      return { code: source.toString(), map: source.generateMap({ hires: true }) };
    },
  };
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) walk(item, visit);
      }
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
