import { type JSX } from "react";
import { useRouteLoaderData } from "react-router";
import bundledStrings from "~/strings/strings.json";
import type stringsShape from "~/strings/strings.json";

type Paths<T extends object> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends object
    ? `${K}.${Paths<T[K]>}`
    : never;
}[keyof T & string];

/** Union of every dot-delimited key present in strings.json.
 *  Exported so a key that must be computed at runtime can be kept strongly typed
 *  (type the variable as `StringKey`) or cast at the call site when you're
 *  confident it's valid: `<Text id={key as StringKey} />`. See CLAUDE.md
 *  "Editable Text". */
export type StringKey = Paths<typeof stringsShape>;

declare module "react-router" {
  interface AppLoadContext {
    /** Platform strings loaded before React Router renders — powers <Text> components. */
    strings: Record<string, unknown>;
  }
}

// ── Server utilities ──────────────────────────────────────────────────────────

export async function loadStringsFromStorage(
  env: { STORAGE: R2Bucket; IS_DRAFT?: string },
): Promise<Record<string, unknown>> {
  const key = env.IS_DRAFT === "true" ? "__stencil/strings.draft.json" : "__stencil/strings.json";
  const obj = await env.STORAGE.get(key);
  // R2 is the live source; fall back to the strings baked into the bundle when it
  // has no object (fresh app, or a failed strings push) so copy is never blank.
  return obj ? await obj.json() : bundledStrings;
}

/** Loader factory that injects platform strings into loader data.
 *  Optionally compose with additional loader logic:
 *  `export const loader = withStrings<Route.LoaderArgs>(({ context }) => ({ user: ... }))` */
export function withStrings<TArgs extends { context: { strings: Record<string, unknown> } }>(
  loader?: (args: TArgs) => Record<string, unknown> | Promise<Record<string, unknown>>,
) {
  return async (args: TArgs) => ({
    ...(loader ? await loader(args) : {}),
    strings: args.context.strings,
  });
}

// ── <Text> component ──────────────────────────────────────────────────────────

function getByPath(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

type TextProps = {
  /** Dot-delimited key into strings.json, e.g. "hero.title" */
  id: StringKey;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  /** Runtime values for {{var}} placeholders in the string template. */
  vars?: Record<string, unknown>;
  [key: string]: unknown;
};

/** Renders a platform-managed string by key. Copy lives in strings.json, never in JSX.
 *  Supports {{var}} interpolation via the vars prop — the raw template is stored in
 *  data-stencil-template so it can be edited in the Stencil editor.
 *  @example <Text id="hero.title" as="h1" className="text-4xl font-bold" />
 *  @example <Text id="cart.message" vars={{ count }} /> — strings.json: "You have {{count}} items" */
export function Text({ id, as: Tag = "span", vars, ...rest }: TextProps) {
  const data = useRouteLoaderData("root") as { strings?: Record<string, unknown> } | undefined;
  const resolved = getByPath(data?.strings ?? {}, id);
  if (resolved === undefined) {
    console.error(
      `<Text>: no string found for id "${id}" in strings.json — rendering empty. ` +
        `Add the key to app/strings/strings.json, or pass a valid key.`,
    );
  }
  const template = resolved ?? "";
  const value = vars ? interpolate(template, vars) : template;
  const Component = Tag as any;
  return (
    <Component
      data-stencil-text-key={id}
      data-stencil-vars={vars ? JSON.stringify(vars) : undefined}
      {...rest}
    >
      {value}
    </Component>
  );
}
