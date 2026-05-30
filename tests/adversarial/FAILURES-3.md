# Adversarial round 3 — demonstrated failures of `@kuindji/typed-sql`

Rounds 1 (`FAILURES.md`) and 2 (`FAILURES-2.md`) drove the type checker from
60 → 0 then 16 → 0 errors. This third round targets **query return types** and
**template-literal queries**. Running:

```
npx tsc --noEmit
```

produces **16 new errors** (`TS2344: Type 'false' does not satisfy the
constraint 'true'`) — 16 assertions where the library's inferred return type is
wrong. Every actual value below was confirmed by probing the compiler (a
reveal-harness that assigns each `GetReturnType<...>` to a sentinel and reads the
printed type, plus `IsNever<...>` checks), not assumed.

The new files also carry **7 green control assertions** that pass, so the suite
stays honest rather than cherry-picked.

| Category file | Failing | Green controls |
|---|---|---|
| `projection-naming.test.ts` | 13 | 3 |
| `template-literal-projection.test.ts` | 3 | 4 |
| **Total** | **16** | **7** |

## Root cause — a `never`-typed projection column poisons the whole row

For an **unaliased** projection expression that is a function call, arithmetic,
`CASE`, or string concat, the projection key resolves to `never`:

- `ExprKey` (`src/expressions.ts:65`) → `ColumnKeyFromExpr` → `ParseColumnRef`
  returns `never` (the expression isn't a plain column ref). The guard
  `ColumnKeyFromExpr<E> extends infer C extends string ? C : FunctionKeyFromExpr<E>`
  never reaches `FunctionKeyFromExpr`, because a `never` checked type makes the
  whole conditional distribute to `never`.
- `ExprToObject` (`src/expressions.ts:39`) then also short-circuits to `never`
  for the same reason (`ExprKey<...> extends infer Key ... ` over `never`).
- `MergeExprs` (`src/validation.ts:583`) folds each column with
  `MergeRow<Acc, Next> = Omit<Acc, keyof Next> & Next` (`src/validation.ts:599`).
  `Omit<Acc, keyof never> & never` = **`never`**.

So a single unnameable column collapses the **entire** projected row — valid
sibling columns included. Meanwhile the same query is reported **valid**:
`ValidateSQL<"select count(*) from users"> = true`. The library calls the query
valid and then types its result as `never`.

Postgres/MySQL assign deterministic output names to these expressions
(`count`, `sum`, `avg`, `min`, `max`, `upper`, `lower`, `coalesce`; an unaliased
`CASE` is named `case`), and the library *already* produces the correct value
type when the column is **aliased** (`count(*) AS c` → `{ c: number }`, a green
control). The defect is the missing auto-naming plus the `never`-collapse, not
the value typing.

### Unaliased aggregate / function / CASE columns (`projection-naming` R1–R9)

| Test | Query | Expected | Actual |
|------|-------|----------|--------|
| R1 | `select count(*) from users` | `{ count: number }` | **`never`** |
| R2 | `select sum(price) from products` | `{ sum: number }` | **`never`** |
| R3 | `select avg(price) from products` | `{ avg: number }` | **`never`** |
| R4 | `select min(price) from products` | `{ min: number }` | **`never`** |
| R5 | `select max(price) from products` | `{ max: number }` | **`never`** |
| R6 | `select upper(name) from products` | `{ upper: string }` | **`never`** |
| R7 | `select lower(email) from users` | `{ lower: string }` | **`never`** |
| R8 | `select coalesce(discount, 0) from products` | `{ coalesce: number \| null }` | **`never`** |
| R9 | `select case when is_active then 1 else 0 end from users` | `{ case: unknown }` | **`never`** |

### Blast radius — valid sibling columns annihilated (`projection-naming` B1–B4)

| Test | Query | Expected | Actual |
|------|-------|----------|--------|
| B1 | `select id, count(*) from users group by id` | `{ id: number; count: number }` | **`never`** |
| B2 | `select count(*), name from users` | `{ count: number; name: string }` | **`never`** |
| B3 | `select id, max(price) from products` | `{ id: number; max: number }` | **`never`** |
| B4 | `select id, price + 1 from products` | `{ id: number }` (sibling survives; unnamed col omitted) | **`never`** |

Controls (green): `count(*) AS c` → `{ c: number }`; `id, count(*) AS c … group by id`
→ `{ id: number; c: number }`; `upper(name) AS u` → `{ u: string }`.

## Template-literal return types (`template-literal-projection` R1–R3)

When the interpolated span is widened to `string` (a `let` binding or any
non-`const` value), the query carries a `${string}` fragment that is **not**
inferrable. Per the contract it should degrade to `unknown` / be dropped — not
collapse the row.

| Test | Query | Expected | Actual |
|------|-------|----------|--------|
| R1 | `` `select ${string} from products` `` | `{}` | **`never`** |
| R2 | `` `select ${string} as x from products` `` | `{ x: unknown }` | `{}` (named column dropped) |
| R3 | `` `select id, ${string} as y from products` `` | `{ id: number; y: unknown }` | `{ id: number }` (named col dropped) |

Controls (green, already correct): a concrete literal interpolation
`` `select ${"price"} from products` `` → `{ price: number }`; a literal inside
an aggregate `` `select count(${"id"}) as c …` `` → `{ c: number }`; a cast
rescues a fragment `` `select ${string}::int as n …` `` → `{ n: number }`; and a
concrete column beside an unknowable fragment `` `select ${"id"}, ${string} …` ``
→ `{ id: number }`.

## Suggested fix direction (out of scope this round)

1. **Auto-name unaliased columns** from the SQL rule: a function call → the
   function name; `CASE` → `case`. Use `FunctionKeyFromExpr` (already written but
   currently unreachable) as the fallback when `ColumnKeyFromExpr` is `never`.
2. **Make `MergeRow` `never`-safe**: treat a `never` / `{}` expr-object as a
   no-op so a single unnameable column can never poison the row (and an
   explicitly aliased fragment keeps its `{ alias: unknown }`).
