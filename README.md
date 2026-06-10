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
// Multi-row VALUES is rejected in the typed path — use the untyped driver call.
```

---

## Behavior notes

A few deliberate behaviors you'll observe when using the library:

- **Ambiguous expressions type as `unknown`.** The inferrer types an expression
  only when its type is unambiguous — `CASE` and unmodeled functions are
  `unknown` rather than a guess. `||` (string concat) → `string`. An unaliased
  function/aggregate projection is named after the function (`count(*)` →
  `{ count: number }`); an unaliased `CASE` is named `case`.
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
  is (Postgres semantics), so `coalesce(x, '')` stays non-null.

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
