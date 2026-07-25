# @kuindji/typed-sql

**A compile-time SQL validator and result-type inferrer for TypeScript.**

You write SQL as a normal TypeScript string. The library parses and checks it
**entirely in the type system** — against a schema you describe as a type — and
infers the shape of the rows the query returns. Nothing runs at runtime for the
validation/inference: the work happens while `tsc` type-checks your code.

```ts
import type { ValidateSQL, GetReturnType, DatabaseSchema } from "@kuindji/typed-sql";

type Schema = {
  defaultSchema: "public";
  schemas: {
    public: {
      users: { id: number; email: string; name: string | null };
    };
  };
};

type Ok   = ValidateSQL<"select id, email from users", Schema>;        // true
type Bad  = ValidateSQL<"select id, nope from users", Schema>;         // false
type Rows = GetReturnType<"select id, name from users", Schema>;       // { id: number; name: string | null }
```

> **Target dialect: PostgreSQL.** Quoted identifiers (`"camelCase"`), `::` casts,
> `coalesce`, `distinct on`, `returning`, etc. are interpreted with Postgres
> semantics.

---

## What it IS

- **A type-level SQL parser.** Validation and row-type inference run in the
  TypeScript type system at compile time. The "parser" is a tower of conditional
  types, not runtime code.
- **A schema-checked SQL guard.** Given a `DatabaseSchema` type, it confirms that
  tables, columns, aliases, and references in a query actually exist, and rejects
  ones that don't.
- **A result-type inferrer.** `GetReturnType<Q, Schema>` produces the row object a
  `SELECT`/`RETURNING` query yields, including join nullability and casts.
- **A small runtime query builder** (`createSelectQuery`, `createConditionTree`,
  conditional-SQL helpers) that assembles a SQL **string + ordered params** and
  carries the inferred result type alongside it.

## What it is NOT

- **Not a runtime SQL parser or engine.** It does not parse SQL at runtime, does
  not execute queries, and does not connect to a database. `createSelectFn(driver)`
  takes **your** executor and just hands it the assembled `(sql, params)` — you
  bring the database client.
- **Not an ORM.** No models, no migrations, no relations, no lazy loading, no
  query DSL that hides SQL. You write SQL; it checks SQL.
- **Not a complete SQL grammar.** The parser is **intentionally shallow**. Many
  constructs are recognized just enough to extract tables/columns/result shape;
  anything it doesn't model is passed through leniently rather than rejected.
- **Not a linter / style enforcer.** It checks *existence and shape*, not
  formatting, performance, or SQL best practices.
- **Not a precise expression type-checker.** It does not attempt full SQL type
  inference. Ambiguous expressions are deliberately typed `unknown` (see below).

---

## Usage

### 1. Describe your schema as a type

```ts
type DatabaseSchema = {
  defaultSchema: string;
  schemas: Record<string /* schema */, Record<string /* table */, Record<string /* column */, /* TS type */ unknown>>>;
};
```

- A **nullable** column is encoded as `T | null` (e.g. `name: string | null`).
- Table/column/schema name matching is **case-insensitive**.
- Column types can be anything: scalars, `"a" | "b"` enums, arrays, nested
  JSON-shaped objects, `Record<string, unknown>`.

### 2. Validate and infer over plain SQL

```ts
type Valid = ValidateSQL<"update users set name = $1 where id = $2", Schema>; // true | false
type Row   = GetReturnType<"select id, name from users where id = $1", Schema>;

// DML helpers
type InsertCols = GetInsertTableColumns<"insert into users ...", Schema>;
type UpdateCols = GetUpdateTableColumns<"update users set ...", Schema>;
```

### 3. Or build queries with the runtime builder

```ts
import { createSelectQuery, createSelectFn } from "@kuindji/typed-sql";

const q = createSelectQuery<Schema>()
  .from("users u")
  .select("u.id")
  .where("u.id = :id")
  .withParams({ id: 42 });

q.toString();        // "SELECT u.id FROM users u WHERE u.id = $1"
[...q.getParams()];  // [42]   ← named params expanded to $1, $2… in order

// DISTINCT / DISTINCT ON (PostgreSQL). Neither changes the inferred row shape.
createSelectQuery<Schema>().from("users u").select("u.id").distinct().toString();
// "SELECT DISTINCT u.id FROM users u"
createSelectQuery<Schema>()
  .from("users u").select("u.id").distinctOn("u.email").orderBy("u.email").toString();
// "SELECT DISTINCT ON (u.email) u.id FROM users u ORDER BY u.email"

// Wire YOUR driver. The library never touches the DB itself.
const select = createSelectFn<Schema>((sql, params) => pg.query(sql, params));
const rows = await select(q); // rows typed from the builder's inferred result
```

Clause methods (`select`, `join`, `where`, `groupBy`, `having`, and `orderBy`)
accept an optional second `id` argument for later replacement, removal, or
introspection. When omitted, the rendered SQL text is used as the id, so
identical implicit fragments are idempotent. Pass an explicit id only when the
same logical slot needs to be replaced with different SQL.

### Write builders (INSERT / UPDATE / DELETE) with typed params

```ts
import { createInsertQuery, createMutateFn, createSql } from "@kuindji/typed-sql";

const q = createInsertQuery<Schema>()
  .into("orders")
  .value("userId", ":uid")     // :uid typed to orders.userId's exact (branded) type
  .value("amount", ":amt")
  .valueIf(hasNote, "note", ":note")   // conditional → :note optional in withParams
  .returning("id")
  .withParams({ uid, amt, ...(hasNote ? { note } : {}) });

q.toString();        // "insert into orders (userId, amount) values ($1, $2) returning id"
[...q.getParams()];  // [uid, amt]

// Raw typed SQL:
const sql = createSql<Schema>();
const d = sql("delete from orders where id = :id").withParams({ id });

// Executor — bring your driver; it returns the RETURNING rows (or [] when none):
const mutate = createMutateFn<Schema>((s, p) => pool.query(s, p).then(r => r.rows));
const rows = await mutate(q);   // typed from RETURNING

// Passing a plain string where a branded column is expected is a compile error.

// Multi-row inserts: pass row objects; placeholders and the column list are
// generated from the first row's keys (all rows must share the same keys;
// the __tsqlrow_ param-name prefix is reserved for this expansion).
const bulk = createInsertQuery<Schema>()
  .into("orders")
  .rows([
    { userId: u1, amount: 100 },
    { userId: u2, amount: 250 },
  ])
  .returning("id");
bulk.toString(); // insert into orders (userId, amount) values ($1, $2), ($3, $4) returning id
```

---

## Custom cast types

The built-in scalar map resolves the common Postgres targets (`::int`, `::text`,
`::numeric`, `::timestamptz`, …). For a cast whose target it *can't* resolve — a
`CREATE TYPE`/`CREATE DOMAIN` name, or the deliberately-uninformative
`json`/`jsonb` — teach it the TS type with one of two optional schema maps:

```ts
type Geometry = { type: "Point"; coordinates: number[] };

type Schema = {
  defaultSchema: "public";
  schemas: { public: { places: { id: number; geom: unknown } } };

  // Schema-wide: keyed by the cast TARGET name alone (case-insensitive,
  // unqualified). The per-schema counterpart to `PgTypeOverrides`.
  casts: {
    citext: string;
    geometry: Geometry;          // a custom CREATE TYPE
    // mood: "happy" | "sad",    // a DOMAIN / enum, etc.
  };

  // Per-function: a cast target determinate only in combination with a
  // specific call. Bare `ST_AsGeoJSON` returns GeoJSON *text*; the `::json`
  // cast parses it into an object.
  functions: {
    ST_AsGeoJSON: {
      returns: string,
      casts: { json: Geometry | null, jsonb: Geometry | null },
    },
  };
};

type A = GetReturnType<"select geom::geometry as g from places", Schema>;
//   { g: Geometry }
type B = GetReturnType<"select geom::geometry[] as g from places", Schema>;
//   { g: Geometry[] }   ← a `geometry` entry covers `geometry[]` automatically
type C = GetReturnType<"select ST_AsGeoJSON(geom)::json as g from places", Schema>;
//   { g: Geometry | null }
```

Resolution precedence for `expr::T`:

1. **Per-function cast** (`functions[fn].casts[T]`) — when `expr` is a call to
   that function. Most specific; **wins even over a built-in `T`** (so you can
   model `fn(x)::text` as a branded string). Carries its own nullability.
2. **Schema-global cast** (`casts[T]`) — only when the built-in map is
   *uninformative* for `T` (an unknown/custom name, or `json`/`jsonb`). This
   uninformative gate keeps built-ins authoritative: `casts` can name a custom
   type but **cannot silently redefine `::text`**.
3. **Built-in** — the usual scalar map (`PgTypeOverrides` ⊕ defaults).

`PgTypeOverrides` remains the lever for remapping a *built-in* pg type to suit a
differently-configured driver; `casts` is additive and names *custom* types —
the two are complementary.

**Nullability of a schema-global cast** is re-applied only as far as the existing
cast machinery already sees it: a join-nullable bare ref (`x.col::geometry` under
a `left join … x` → `Geometry | null`) and a schema-declared nullable function
inner propagate `| null`; **base-column** nullability is dropped by *any* cast
(custom or built-in), and a built-in-function / parenthesized / arithmetic inner
stays non-null. Recover precision with `coalesce`, a per-function entry, or a
nullable cast target — authoring the global entry as `Geometry | null` would
wrongly make *every* cast to that type nullable.

---

## Behavior notes

A few deliberate behaviors you'll observe when using the library:

- **Ambiguous expressions type as `unknown`.** The inferrer types an expression
  only when its type is unambiguous — unmodeled functions are
  `unknown` rather than a guess. `||` (string concat) → `string`, gaining
  `| null` when any operand may be NULL (`tracking || carrier` where
  `tracking` is nullable → `string | null` — SQL `NULL || x` is NULL). An
  operand from the nullable side of an outer join counts too, wherever it
  sits in the chain (`u.name || s.carrier` under `left join … s` →
  `string | null`).
  `extract(…)` → `number` (`number | null` when its source may be NULL). Strict scalar
  functions follow the same NULL-in-NULL-out rule: numeric ones
  (`length`, `char_length`, `round`, `floor`, `ceil`, `abs`, `trunc`, `sign`,
  `mod`, `power`, `sqrt`, `strpos`, …) → `number`, string ones (`trim` family,
  `replace`, `lpad`/`rpad`, `substr`/`substring`, `split_part`, `to_char`,
  `md5`, `upper`, `lower`, …) → `string`, each `| null` when an argument may
  be NULL. Aggregates follow SQL's two NULL paths: **argument nullability
  propagates** (`sum`/`avg`/`min`/`max`/`string_agg`/`bool_and`/`bool_or` over
  a nullable column are `| null` — an all-NULL group aggregates to NULL;
  `array_agg(col)` → `col-type[]`), and in a query with **no `GROUP BY`**
  every whole-aggregate projection except `count` gains `| null` — zero input
  rows produce one NULL row (`select sum(amount) from payments where …` is
  NULL when nothing matches), regardless of column nullability.
  `coalesce(sum(x), 0)` rescues it, in the types as in SQL. Top-level
  arithmetic `A op B` (`+`, `-`, `*`, `/`, `%`) → `number` when **both**
  operands type `number` (`| null` propagates from either side — SQL NULL
  arithmetic is NULL, and an operand from the nullable side of an outer join
  counts as nullable); operands can be columns, literals, function calls, or
  parenthesized arithmetic, and chains recurse (`a + b * 2`,
  `sum(price) / count(id)`). Anything else — a non-number operand, unary
  minus, unmodeled operators like `<<` or single `|` — stays `unknown`. An
  unaliased function/aggregate projection is named after the function
  (`count(*)` → `{ count: number }`); an unaliased `CASE` is named `case`.
- **`CASE` is typed from its branches.** A `CASE … END` is the union of its
  first `THEN` branch and its `ELSE` branch — SQL requires all branches to be
  union-compatible, so one `THEN` plus the `ELSE` captures the type. Branch
  exprs are typed exactly like a first-hand projection (literals widen,
  columns/casts/functions/nested `CASE` resolve). With **no `ELSE`**, unmatched
  rows are NULL, so `| null` is added (`case when … then name end` → `string |
  null`). A branch column from the nullable side of an outer join carries
  `| null` too (conditions don't count — only the `THEN`/`ELSE` results). An
  exotic shape the shallow branch-splitter can't cleanly read falls back to
  `unknown`. Only the first `THEN` and the `ELSE` are typed, so a nullable
  *non-first* `THEN` branch may not contribute its `| null` — wrap in
  `coalesce`/a cast when you need that precision. Wrap the whole expression in a
  cast (`(case … end)::text`) to force a concrete type.
- **Projected literals widen to their base type** — `select 'GBP' as cur` →
  `{ cur: string }`, `select 42 as n` → `{ n: number }`, not `{ cur: "GBP" }` /
  `{ n: 42 }`. Locked literal types reject every other value in mutable
  bindings, `useState`, props, etc.; add an explicit cast at the call site when
  you want the literal back.
- **Validation is intentionally lenient.** The parser models the common shape of
  real queries, not the full SQL grammar, and biases toward **never rejecting
  valid SQL** — which means some invalid constructs may pass as `true`. Very
  large/complex queries may fall back to `unknown`/`true` rather than failing
  (TypeScript's recursion limits put a hard ceiling on type-level parsing).
- **Join nullability:** outer joins add `| null` to columns sourced from the
  nullable side (`left join … x` ⇒ `x.col` becomes `T | null`). This applies
  inside `coalesce(...)` too: the result is nullable only if **every** argument
  is (Postgres semantics), so `coalesce(x, '')` stays non-null. It applies to
  `*` and `x.*` expansions as well, and it survives a CTE or subquery boundary:
  the row a `with j as (…)` / `from (…) d` source publishes is the row its body
  would produce standalone, `| null` included. Over a **self-join**, a bare `*`
  projects both instances under the same column names, so the shared table's
  columns are conservatively nullable — use `u.*` / `m.*` to resolve each side
  exactly.
- **An empty array in an `IN (...)` list is an error, not empty SQL.**
  `where id in (:ids)` with `ids: []` throws rather than emitting `in ()`
  (a PostgreSQL syntax error). There is no safe silent rewrite — `in (null)` is
  NULL rather than false, and it inverts `not in` — so guard the empty case
  (e.g. `whereIf(ids.length > 0, …)`) or bind a non-empty list. An empty array
  **outside** an IN list is fine: `= any(:ids)` binds it as one array parameter.
- **Multi-row `VALUES` params are typed per tuple.** In raw SQL,
  `insert into t (a, b) values (:a1, :b1), (:a2, :b2)` binds every `:param` to
  its column's type, tuple by tuple. Very long tuple lists degrade: beyond 12
  tuples (or an unparseable tail) the remaining params are accepted untyped
  rather than rejected.
- **Runtime lookup objects use own properties only.** Named params, conditional
  data (`/*if:path*/`), fragment ids, and `.rows()` cells never resolve through
  an object's prototype chain. Materialize inherited defaults/getters into an
  own-property object before passing them to the library.

---

## Conditional builder methods (`*If`) — runtime vs type-level

The builder's `*If` methods — `selectIf`, `whereIf`, `joinIf`, `groupByIf`,
`havingIf`, `orderByIf`, `limitIf`, `offsetIf`, and `applyIf` — take a **runtime
boolean** as their first argument. This creates a deliberate gap between what runs
and what the types say:

- **Runtime:** the fragment is included in the emitted SQL **only if the condition
  is truthy** at call time. `selectIf(false, "name")` adds nothing to the query.
- **Type-level:** TypeScript cannot see a runtime boolean's value, so the inferred
  result type does **not** branch on it. It infers from the **maximal** query —
  every `*If` fragment treated as present — and then marks columns that *might* be
  absent as **optional**.

Per method:

- **`selectIf` / `applyIf` that introduce a column** → that column becomes an
  **optional property** in the result row (`name?: T`, i.e. `T | undefined` at the
  use site). Unconditional `select`/`apply` columns stay **required**, regardless
  of call order.
- **If there is _no_ unconditional `select` at all**, the all-false runtime path
  emits `SELECT *`, so the whole row falls back to `Partial<…>` — **every** column
  optional.
- **Clause-only `*If`** (`whereIf`, `joinIf`, `groupByIf`, `havingIf`, `orderByIf`,
  `limitIf`, `offsetIf`) conditionally changes the **SQL text** at runtime but does
  **not** change the result column set — the type is computed as if the clause is
  present.

```ts
const dyn: boolean = /* computed at runtime */;
const q = createSelectQuery<Schema>()
  .from("users")
  .select("id")            // unconditional → required
  .selectIf(dyn, "name");  // conditional   → optional

type Row = BuilderReturnType<typeof q>;
// { id: number; name?: string }   ← id required; name is `string | undefined`
```

## Two kinds of "maybe missing": `| null` vs optional (`| undefined`)

These look similar but mean **different** things:

| | Source | Type shape | Meaning |
|---|---|---|---|
| **`\| null`** | `LEFT`/outer join (nullable side) | `col: T \| null` — **key always present** | The column is in every row, but its **value** can be SQL `NULL` (the join didn't match). |
| **optional (`\| undefined`)** | `selectIf` / `applyIf` conditional projection | `col?: T` — **key may be absent** | The column may **not be in the result object at all**, because it wasn't selected at runtime. |

A left-joined column that is *also* conditionally selected is **both**:
`col?: T | null`.

---

## Contributing

Contributing or reviewing? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the
design contracts, internals, and things that look like bugs but are intended.

## License

MIT © Ivan Kuindzhi
