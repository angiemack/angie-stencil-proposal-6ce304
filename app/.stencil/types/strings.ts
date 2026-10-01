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
