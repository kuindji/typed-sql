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

// Wire YOUR driver. The library never touches the DB itself.
const select = createSelectFn<Schema>((sql, params) => pg.query(sql, params));
const rows = await select(q); // rows typed from the builder's inferred result
```

---

## Design contracts

These are deliberate rules. Behavior that follows them is **correct by design**,
even when it looks conservative or incomplete.

### Conservative typing — ambiguous ⇒ `unknown`

The inferrer types an expression **only when its type is unambiguous**. When it
isn't, the result is `unknown` rather than a guess.

- `||` (string concat) → `string`.
- **String literals widen to `string`** — `select 'GBP' as cur` → `{ cur: string }`,
  *not* `{ cur: "GBP" }`. (This is a deliberate choice; do not "fix" it back to a
  literal type.)
- **Numeric and boolean literals are preserved** (`1` → `1`, `true` → `true`).
- `CASE`, unmodeled functions, and other ambiguous expressions → `unknown`.
- An unaliased function/aggregate projection is named after the function
  (`count(*)` → `{ count: number }`, `coalesce(...)` → `{ coalesce: … }`); an
  unaliased `CASE` is named `case`.

### Shallow & lenient parsing — false-negatives over false-positives

The parser models the common shape of real queries, not the full SQL grammar. Its
bias is to **never reject valid SQL**, even if that means **not catching every
invalid construct**. So:

- A construct that isn't validated is usually **intentional leniency**, not a
  missed bug. Adding strictness that risks rejecting valid SQL is a regression.
- Large/complex queries may route through a more lenient normalization path and
  fall back to `unknown`/`true` rather than failing.

### Nullability model

- Column nullability comes from the schema (`T | null`).
- **Outer joins** add `| null` to columns sourced from the nullable side
  (`left join … x` ⇒ `x.col` becomes `T | null`).
- This join-nullability is applied to projected columns **and** to columns nested
  inside `coalesce(...)`: `coalesce(a, b, c)` is nullable if **every** argument is
  nullable (Postgres semantics — `coalesce` is `NULL` only when all args are), so a
  non-null literal (`coalesce(x, '')`) keeps the result non-null.

### TS recursion depth (`TS2589`) is a hard constraint

The entire design is shaped by TypeScript's instantiation/recursion limits.

- Type-level char-walks are **chunked** and step-capped on purpose. The fix for a
  depth error is almost never "raise the cap" — caps near ~1000 iterations *cause*
  `TS2589`. Use the chunked-driver pattern (a bounded worker that yields its state,
  re-invoked with a fresh step counter) instead.
- Some precision is intentionally traded away on very wide/long queries to stay
  under the limit.

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

These look similar but mean **different** things — keep them distinct in review:

| | Source | Type shape | Meaning |
|---|---|---|---|
| **`\| null`** | `LEFT`/outer join (nullable side) | `col: T \| null` — **key always present** | The column is in every row, but its **value** can be SQL `NULL` (the join didn't match). |
| **optional (`\| undefined`)** | `selectIf` / `applyIf` conditional projection | `col?: T` — **key may be absent** | The column may **not be in the result object at all**, because it wasn't selected at runtime. |

A left-joined column that is *also* conditionally selected is **both**:
`col?: T | null`.

---

## Reviewer / contributor gotchas

Things that **look like bugs but are intended**. Please don't "fix" these without
reading the contracts above:

| Observation | Verdict |
|---|---|
| `select 'GBP' as c` types `c` as `string`, not `"GBP"` | **Intended.** String literals widen to `string`. |
| A `CASE` / unknown function projects as `unknown` | **Intended.** Conservative typing — ambiguous ⇒ `unknown`. |
| Some invalid-looking SQL is reported `true` by `ValidateSQL` | **Often intended.** Lenient parser biases away from false rejections. |
| A column inside `coalesce(...)` under a left join is `T \| null` | **Intended & correct.** Coalesce is nullable iff all args are. |
| Numeric/boolean literals stay literal but strings don't | **Intended asymmetry.** |
| A step cap is hit and the result widens on a huge query | **Intended.** Depth-limit guard, not a parse failure. |
| "Why not just recurse deeper / raise `Steps extends N`?" | Doing so blows `TS2589`. Use the chunked-driver pattern. |
| `selectIf(cond, "x")` makes `x` optional even when `cond` is clearly true | **Intended.** Types can't read a runtime boolean; conditional ⇒ optional (max view). |
| A `joinIf` table's columns are typed as present though the join is conditional | **Intended.** Clause-`*If` infers the max view; only conditional *selects* optionalize columns. |
| `\| null` (join) and `?:` / `\| undefined` (`selectIf`) treated as interchangeable | **No.** present-but-`null` ≠ maybe-absent. See "Two kinds of maybe missing". |
| All-`selectIf` builder (no plain `select`) types every column optional | **Intended.** The all-false runtime path is `SELECT *` → `Partial<…>`. |

### Verifying nullability when probing types

Running `tsc` on a standalone probe file **disables `strictNullChecks`**, which
collapses `string | null` to `string` and makes every null assertion lie. Always
probe under the project's strict config — e.g. add a temp test and run the full
`npx tsc --noEmit` — not a one-off `tsc probe.ts`.

## License

MIT © Ivan Kuindzhi
