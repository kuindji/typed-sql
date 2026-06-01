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

type HasId<List extends readonly { id: string }[], Id extends string> =
    List extends readonly [infer H extends { id: string }, ...infer R extends readonly { id: string }[]]
        ? H["id"] extends Id ? true : HasId<R, Id>
        : false;

type ReplaceById<
    List extends readonly { id: string }[],
    Id extends string,
    Item,
> = List extends readonly [infer H extends { id: string }, ...infer R extends readonly { id: string }[]]
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
> = List extends readonly [infer H extends { id: string }, ...infer R extends readonly { id: string }[]]
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

export type WithSelect<
    Sql extends SqlTag,
    Text extends string,
    Id extends string,
    Cond extends boolean,
> = Omit<Sql, "selects"> & {
    readonly selects: UpsertById<Sql["selects"], Id, { id: Id; text: Text; cond: Cond }>;
};

export type WithoutSelect<Sql extends SqlTag, Id extends string> =
    Omit<Sql, "selects"> & { readonly selects: FilterOutId<Sql["selects"], Id> };

export type WithFrom<Sql extends SqlTag, Text extends string> =
    Omit<Sql, "from"> & { readonly from: Text };

export type WithJoin<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "joins"> & {
        readonly joins: UpsertById<Sql["joins"], Id, { id: Id; text: Text }>;
    };

export type WithoutJoin<Sql extends SqlTag, Id extends string> =
    Omit<Sql, "joins"> & { readonly joins: FilterOutId<Sql["joins"], Id> };

export type WithWhere<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "wheres"> & {
        readonly wheres: UpsertById<Sql["wheres"], Id, { id: Id; text: Text }>;
    };

export type WithGroupBy<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "groupBys"> & {
        readonly groupBys: UpsertById<Sql["groupBys"], Id, { id: Id; text: Text }>;
    };

export type WithHaving<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "havings"> & {
        readonly havings: UpsertById<Sql["havings"], Id, { id: Id; text: Text }>;
    };

export type WithOrderBy<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "orderBys"> & {
        readonly orderBys: UpsertById<Sql["orderBys"], Id, { id: Id; text: Text }>;
    };

export type WithLimit<Sql extends SqlTag, L extends number> =
    Omit<Sql, "limit"> & { readonly limit: L };

export type WithOffset<Sql extends SqlTag, O extends number> =
    Omit<Sql, "offset"> & { readonly offset: O };

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
