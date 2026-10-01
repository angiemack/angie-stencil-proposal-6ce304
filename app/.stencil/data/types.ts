/**
 * Types for the data SDK (`~stencil/data`) and its access-rule engine.
 *
 * The compiled access rules arrive from `app/generated/access-rules.ts`, written
 * by the platform from each entity's `x-access` rule. The layer never parses
 * rule strings — it only consumes this AST. Nothing here imports anything.
 */

// ---------------------------------------------------------------------------
// Compiled access rules (what the generated file carries)
// ---------------------------------------------------------------------------

/** A value on the right-hand side of a rule clause. `me` = the signed-in app user's id. */
export type AccessValue =
  | { kind: "me" }
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "list"; values: (string | number | boolean | null)[] };

export type AccessCompareOp = "=" | "!=" | "<" | "<=" | ">" | ">=" | "in";

export type AccessCompareClause = {
  kind: "compare";
  column: string;
  op: AccessCompareOp;
  value: AccessValue;
};

/**
 * One clause of a rule line. A `hop` is a single-level membership test on
 * another table: `column in table.targetColumn where <compare clauses>`.
 */
export type AccessClause =
  | AccessCompareClause
  | {
      kind: "hop";
      column: string;
      table: string;
      targetColumn: string;
      where: AccessCompareClause[];
    };

/**
 * One line of a rule. `anyone` = any signed-in app user; `public` = also
 * unauthenticated callers (read only); `nobody` = server-only; `all` = every
 * clause must hold.
 */
export type AccessCondition =
  | { kind: "anyone" }
  | { kind: "public" }
  | { kind: "nobody" }
  | { kind: "all"; clauses: AccessClause[] };

/** Per-action rule lines (OR'd) plus columns app users may never see or write. */
export type AccessRule = {
  read: AccessCondition[];
  create: AccessCondition[];
  update: AccessCondition[];
  delete: AccessCondition[];
  hidden: string[];
};

/** Storage type of a column. `integer` is only ever produced by a checkbox field, so it reads back as a boolean. */
export type ColumnType = "text" | "real" | "integer" | "json";

export type TableMeta = {
  slug: string;
  /** snake_case column name → storage type. */
  columns: Record<string, ColumnType>;
  /** snake_case foreign-key column → target table slug (from the field's `x-ref`). */
  refs: Record<string, string>;
  access: AccessRule;
};

/** The whole generated module: tables keyed by slug (snake_case). */
export type AccessRules = { version: 1; tables: Record<string, TableMeta> };

// ---------------------------------------------------------------------------
// Requests (what the SDK builds, what the engine verifies and runs)
// ---------------------------------------------------------------------------

export type WhereOp =
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "in"
  | "like"
  | "isNull"
  | "isNotNull";

/**
 * A where tree. Column names may be camelCase or snake_case; the engine
 * normalizes them to snake_case before validating and comparing.
 */
export type Where =
  | { and: Where[] }
  | { or: Where[] }
  | { column: string; op: WhereOp; value?: unknown }
  | {
      /** Engine-internal: produced from hop rules by `compileRule`. */
      column: string;
      op: "inSubquery";
      table: string;
      targetColumn: string;
      where: Where;
    };

export type OrderBy = { column: string; dir: "asc" | "desc" };

/** Expansion target: the row's `column` value is matched against `table.id`. */
export type Expand = Record<string, { table: string; column: string }>;

export type ListRequest = {
  kind: "list";
  table: string;
  select?: string[];
  where?: Where;
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
  expand?: Expand;
};

export type GetRequest = {
  kind: "get";
  table: string;
  id: string;
  select?: string[];
  /**
   * The verified where, exactly as on a list. The SDK places the compiled read
   * rule here so the engine can verify a get the same way it verifies a list.
   */
  where?: Where;
  expand?: Expand;
};

export type CreateRequest = {
  kind: "create";
  table: string;
  data: Record<string, unknown>;
};

export type UpdateRequest = {
  kind: "update";
  table: string;
  id: string;
  data: Record<string, unknown>;
};

export type DeleteRequest = { kind: "delete"; table: string; id: string };

export type DataRequest =
  | ListRequest
  | GetRequest
  | CreateRequest
  | UpdateRequest
  | DeleteRequest;

/**
 * Who is asking. `user` = a signed-in app user; `anon` = an unauthenticated
 * visitor (only `public` rule lines apply); `system` = server-only code that
 * bypasses rules (webhooks, crons, seeding).
 */
export type Caller =
  | { kind: "user"; id: string }
  | { kind: "anon" }
  | { kind: "system" };

/** A row as the SDK returns it: camelCase keys, booleans and parsed JSON. */
export type DataRow = Record<string, unknown>;

/** What each request kind resolves to. */
export type DataResult<R extends DataRequest> = R extends ListRequest
  ? DataRow[]
  : R extends GetRequest
    ? DataRow
    : R extends CreateRequest
      ? DataRow
      : R extends UpdateRequest
        ? DataRow
        : { id: string };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type DataAccessErrorCode =
  | "forbidden"
  | "notFound"
  | "unknownTable"
  | "unknownColumn"
  | "invalid";

/**
 * Thrown by the engine (and the SDK) when a request is rejected. In a loader
 * or action it surfaces as a thrown error → the route's error boundary.
 */
export class DataAccessError extends Error {
  readonly code: DataAccessErrorCode;
  constructor(code: DataAccessErrorCode, message: string) {
    super(message);
    this.name = "DataAccessError";
    this.code = code;
  }
}

export function isDataAccessError(e: unknown): e is DataAccessError {
  return (
    e instanceof DataAccessError ||
    (typeof e === "object" &&
      e !== null &&
      (e as { name?: unknown }).name === "DataAccessError" &&
      typeof (e as { code?: unknown }).code === "string")
  );
}
