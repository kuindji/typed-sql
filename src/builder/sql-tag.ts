// src/builder/sql-tag.ts

/** A non-select clause fragment (where/join/group/having/order/cte). */
export interface Frag {
    readonly id: string;
    readonly text: string;
}

/** A select fragment: raw rendered column-list text + conditional flag. */
export interface SelFrag {
    readonly id: string;
    readonly text: string; // e.g. "u.id, u.name" (cols already joined with ", ")
    readonly cond: boolean; // true = selectIf / applyIf-introduced
}

/** Lean type-level fragment tag: ordered fragment lists per clause. */
export interface SqlTag {
    readonly ctes: readonly Frag[];
    readonly selects: readonly SelFrag[];
    readonly from: string | null; // null = no FROM; `string` (non-literal) widens BuildSQL
    readonly joins: readonly Frag[];
    readonly wheres: readonly Frag[];
    readonly groupBys: readonly Frag[];
    readonly havings: readonly Frag[];
    readonly orderBys: readonly Frag[];
    readonly limit: number | null;
    readonly offset: number | null;
    readonly union: string | null;
}

/** Upper bound for "any builder" (replaces old AnyBuilderSqlTag/AnyBuilderStateTag). */
export type AnySqlTag = SqlTag;

export type EmptySqlTag = {
    readonly ctes: readonly [];
    readonly selects: readonly [];
    readonly from: null;
    readonly joins: readonly [];
    readonly wheres: readonly [];
    readonly groupBys: readonly [];
    readonly havings: readonly [];
    readonly orderBys: readonly [];
    readonly limit: null;
    readonly offset: null;
    readonly union: null;
};

// --- list mutation helpers (replace-by-id-or-push; matches runtime) ---
//
// GENERIC-BASE NOTE: the working element bound is `{ id: string; text: string }`,
// NOT just `{ id: string }`. When a builder is used generically
// (`fn<Schema, Sql extends SqlTag>(b)`), `Sql["wheres"]` is the symbolic
// `readonly Frag[]` and the auto id becomes a `where_${number}` pattern; the
// tuple recursion then matches a variadic `[...Frag[], X]` and TS widens the
// inferred head `H` to the declared bound. With the looser `{ id: string }` bound
// that widened element drops `text`, so the accumulated list is no longer
// assignable to `readonly Frag[]` and any downstream `Sql2 extends SqlTag` check
// (e.g. `setPeriod(b)`) fails. Both `Frag` AND `SelFrag` carry `id` + `text`, so
// the tighter bound keeps the widened element `Frag`-assignable while leaving
// concrete-tuple inference (every literal `EmptySqlTag` chain) unchanged — the
// bound is only an upper limit; exact element types are still inferred for real
// tuples.
type HasId<List extends readonly { id: string }[], Id extends string> =
    List extends readonly [infer H extends { id: string; text: string }, ...infer R extends readonly { id: string; text: string }[]]
        ? H["id"] extends Id ? true : HasId<R, Id>
        : false;

type ReplaceById<
    List extends readonly { id: string }[],
    Id extends string,
    Item,
> = List extends readonly [infer H extends { id: string; text: string }, ...infer R extends readonly { id: string; text: string }[]]
    ? H["id"] extends Id
        ? readonly [Item, ...R]
        : readonly [H, ...ReplaceById<R, Id, Item>]
    : readonly [];

type UpsertById<
    List extends readonly { id: string }[],
    Id extends string,
    Item extends { id: string },
> = HasId<List, Id> extends true
    ? ReplaceById<List, Id, Item>
    : readonly [...List, Item];

type FilterOutId<
    List extends readonly { id: string }[],
    Id extends string,
> = List extends readonly [infer H extends { id: string; text: string }, ...infer R extends readonly { id: string; text: string }[]]
    ? H["id"] extends Id
        ? FilterOutId<R, Id>
        : readonly [H, ...FilterOutId<R, Id>]
    : readonly [];

// --- type-level auto-id (mirrors runtime `select_${count}`, `join_${count}`, …) ---
// The next fragment id is the current fragment count, exactly as the runtime
// derives `select_${Object.keys(selectSql).length}`. O(1) — `length` on a
// readonly tuple is the literal element count.
export type AutoId<Prefix extends string, List extends readonly unknown[]> =
    `${Prefix}_${List["length"] & number}`;

// An explicit caller id wins; `undefined` → the clause's auto id.
export type ResolveId<
    Provided extends string | undefined,
    Prefix extends string,
    List extends readonly unknown[],
> = Provided extends string ? Provided : AutoId<Prefix, List>;

// --- per-clause `With*` helpers used by select.ts ---
//
// DEPTH NOTE: these MUST NOT be written as `Omit<Sql, K> & { K: New }`.
// `Omit<X,K>` is `Pick<X, Exclude<keyof X, K>>`, so a chain of N builder calls
// nests N `Omit`s and reading ANY field forces `keyof` over the whole
// `Omit`-of-`Omit`-of-… intersection — recomputed at every step. A ~17-call
// `.whereIf()` chain crosses TS's depth-100 guard (TS2589/TS2590), and the deep
// nest can also stop being recognised as a `SqlTag`. Instead each helper rebuilds
// a FLAT 11-field object, overriding only its one field and copying the other ten
// via direct indexed access (`Sql["<field>"]`) — O(1) depth per call. The
// produced type is structurally the same `SqlTag` (same fields + `readonly`).
//
// Each helper writes a FLAT 11-field literal directly: override the one field it
// owns, copy the other ten via direct indexed access. No generic patch-merge
// helper — a plain literal is the cheapest possible (no extra conditionals).

export type WithSelect<
    Sql extends SqlTag,
    Text extends string,
    Id extends string,
    Cond extends boolean,
> = {
    readonly ctes: Sql["ctes"];
    readonly selects: UpsertById<Sql["selects"], Id, { id: Id; text: Text; cond: Cond }>;
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithoutSelect<Sql extends SqlTag, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: FilterOutId<Sql["selects"], Id>;
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithFrom<Sql extends SqlTag, Text extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Text;
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithJoin<Sql extends SqlTag, Text extends string, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: UpsertById<Sql["joins"], Id, { id: Id; text: Text }>;
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithoutJoin<Sql extends SqlTag, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: FilterOutId<Sql["joins"], Id>;
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithoutWhere<Sql extends SqlTag, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: FilterOutId<Sql["wheres"], Id>;
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithWhere<Sql extends SqlTag, Text extends string, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: UpsertById<Sql["wheres"], Id, { id: Id; text: Text }>;
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithGroupBy<Sql extends SqlTag, Text extends string, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: UpsertById<Sql["groupBys"], Id, { id: Id; text: Text }>;
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithoutGroupBy<Sql extends SqlTag, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: FilterOutId<Sql["groupBys"], Id>;
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithHaving<Sql extends SqlTag, Text extends string, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: UpsertById<Sql["havings"], Id, { id: Id; text: Text }>;
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithoutHaving<Sql extends SqlTag, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: FilterOutId<Sql["havings"], Id>;
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithOrderBy<Sql extends SqlTag, Text extends string, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: UpsertById<Sql["orderBys"], Id, { id: Id; text: Text }>;
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithoutOrderBy<Sql extends SqlTag, Id extends string> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: FilterOutId<Sql["orderBys"], Id>;
    readonly limit: Sql["limit"];
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithLimit<Sql extends SqlTag, L extends number> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: L;
    readonly offset: Sql["offset"];
    readonly union: Sql["union"];
};

export type WithOffset<Sql extends SqlTag, O extends number> = {
    readonly ctes: Sql["ctes"];
    readonly selects: Sql["selects"];
    readonly from: Sql["from"];
    readonly joins: Sql["joins"];
    readonly wheres: Sql["wheres"];
    readonly groupBys: Sql["groupBys"];
    readonly havings: Sql["havings"];
    readonly orderBys: Sql["orderBys"];
    readonly limit: Sql["limit"];
    readonly offset: O;
    readonly union: Sql["union"];
};

// --- BuildSQL: assemble a literal mirroring assembleSelectSQL's ordering ---

export type BuildMode = "max" | "req" | "scope";

// Join a list of fragment texts with a separator (drops empties).
type JoinTexts<
    List extends readonly { text: string }[],
    Sep extends string,
    Acc extends string = "",
> = List extends readonly [infer H extends { text: string }, ...infer R extends readonly { text: string }[]]
    ? JoinTexts<R, Sep, Acc extends "" ? H["text"] : `${Acc}${Sep}${H["text"]}`>
    : Acc;

// Select fragments for a given mode: "req" keeps only cond=false.
type SelectsForMode<List extends readonly SelFrag[], Mode extends BuildMode> =
    Mode extends "req"
        ? FilterUncond<List>
        : List;

type FilterUncond<List extends readonly SelFrag[]> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? H["cond"] extends false
            ? readonly [H, ...FilterUncond<R>]
            : FilterUncond<R>
        : readonly [];

// SELECT clause text for a mode.
type SelectClause<Sql extends SqlTag, Mode extends BuildMode> =
    Mode extends "scope"
        ? "SELECT *"
        : SelectsForMode<Sql["selects"], Mode> extends infer Sel extends readonly SelFrag[]
            ? Sel extends readonly []
                ? "SELECT *"
                : `SELECT ${JoinTexts<Sel, ", ">}`
            : "SELECT *";

// Optional prefixed clause: "" when the list is empty.
type Clause<Kw extends string, List extends readonly { text: string }[], Sep extends string> =
    List extends readonly [] ? "" : ` ${Kw} ${JoinTexts<List, Sep>}`;

type FromClause<From extends string | null> =
    From extends null ? "" : ` FROM ${From & string}`;

type JoinClause<List extends readonly Frag[]> =
    List extends readonly [] ? "" : ` ${JoinTexts<List, " ">}`;

type WithClause<List extends readonly Frag[]> =
    List extends readonly [] ? "" : `WITH ${JoinTexts<List, ", ">} `;

type LimitClause<L extends number | null> =
    L extends number ? ` LIMIT ${L}` : "";

type OffsetClause<O extends number | null> =
    O extends number ? ` OFFSET ${O}` : "";

type UnionClause<U extends string | null> =
    U extends null ? "" : ` ${U & string}`;

// Raw literal assembly — mirrors assembleSelectSQL's clause ordering exactly.
type BuildSQLRaw<Sql extends SqlTag, Mode extends BuildMode> =
    `${WithClause<Sql["ctes"]>}${SelectClause<Sql, Mode>}${FromClause<Sql["from"]>}${JoinClause<Sql["joins"]>}${Clause<"WHERE", Sql["wheres"], " AND ">}${Clause<"GROUP BY", Sql["groupBys"], ", ">}${Clause<"HAVING", Sql["havings"], " AND ">}${Clause<"ORDER BY", Sql["orderBys"], ", ">}${LimitClause<Sql["limit"]>}${OffsetClause<Sql["offset"]>}${UnionClause<Sql["union"]>}`;

// Union of every participating fragment text (+ from / union clauses). If any
// member is the unconstrained `string`, the union contains `string`.
type AllTexts<Sql extends SqlTag> =
    | (Sql["from"] extends null ? never : Sql["from"])
    | Sql["selects"][number]["text"]
    | Sql["joins"][number]["text"]
    | Sql["wheres"][number]["text"]
    | Sql["groupBys"][number]["text"]
    | Sql["havings"][number]["text"]
    | Sql["orderBys"][number]["text"]
    | Sql["ctes"][number]["text"]
    | (Sql["union"] extends null ? never : Sql["union"]);

/**
 * Assemble the tag into a literal SQL string. Widens to `string` if any
 * participating fragment text is non-literal (e.g. from(dynamic)) — a template
 * with a `string` placeholder (`\`SELECT * FROM ${string}\``) is NOT itself
 * `string`, so we detect non-literal inputs up front and short-circuit.
 */
export type BuildSQL<Sql extends SqlTag, Mode extends BuildMode> =
    string extends AllTexts<Sql> ? string : BuildSQLRaw<Sql, Mode>;

// --- Row-oriented assembly --------------------------------------------------
//
// The projected ROW is a function of the SELECT list and the FROM/JOIN/CTE scope
// ONLY. The remaining clauses (WHERE / GROUP BY / HAVING / ORDER BY / LIMIT /
// OFFSET) never add or retype a projected column — they are row-neutral. But
// they are frequently built from non-literal `string` (a dynamic GROUP BY key, a
// runtime ORDER BY, an interpolated WHERE). If such a `string` clause text were
// allowed into the row SQL it would widen the WHOLE assembled string to `string`
// (`AllTexts` short-circuit), collapsing the row to `{}` even though the
// projection is fully literal. So `BuildRowSQL` (used only by
// `BuilderReturnTypeFor`) assembles the projection-relevant clauses verbatim and
// reduces the row-neutral clauses to a presence-preserving placeholder:
//   - GROUP BY: emitted as a literal `GROUP BY 1` when present, because grouping
//     PRESENCE (not its expressions) decides whole-aggregate nullability
//     (`ApplyUngroupedAggNull`).
//   - WHERE / HAVING / ORDER BY / LIMIT / OFFSET: dropped — they never affect the
//     row, so their text (literal or not) is irrelevant to inference.
// Validation still uses the full `BuildSQL`, so clause CONTENT is unaffected
// there; only row INFERENCE tolerates non-literal row-neutral clauses.
type GroupPresence<List extends readonly Frag[]> =
    List extends readonly [] ? "" : ` GROUP BY 1`;

// Row-affecting fragment texts ONLY — the guard set for the row SQL.
type RowAffectingTexts<Sql extends SqlTag> =
    | (Sql["from"] extends null ? never : Sql["from"])
    | Sql["selects"][number]["text"]
    | Sql["joins"][number]["text"]
    | Sql["ctes"][number]["text"]
    | (Sql["union"] extends null ? never : Sql["union"]);

type BuildRowSQLRaw<Sql extends SqlTag, Mode extends BuildMode> =
    `${WithClause<Sql["ctes"]>}${SelectClause<Sql, Mode>}${FromClause<Sql["from"]>}${JoinClause<Sql["joins"]>}${GroupPresence<Sql["groupBys"]>}${UnionClause<Sql["union"]>}`;

/**
 * SQL assembled for ROW INFERENCE (see the block comment above): projection
 * clauses verbatim, row-neutral clauses reduced to a presence placeholder. Only
 * widens to `string` if a ROW-AFFECTING text (SELECT/FROM/JOIN/CTE/UNION) is
 * non-literal — a dynamic WHERE/GROUP BY/ORDER BY no longer collapses the row.
 */
export type BuildRowSQL<Sql extends SqlTag, Mode extends BuildMode> =
    string extends RowAffectingTexts<Sql> ? string : BuildRowSQLRaw<Sql, Mode>;
