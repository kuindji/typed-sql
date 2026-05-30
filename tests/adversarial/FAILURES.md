# Adversarial test results — demonstrated failures of `@kuindji/typed-sql`

Each test under `tests/adversarial/` is a pure type assertion of the **correct**
Postgres/MySQL semantics. Running the type checker:

```
npx tsc --noEmit
```

produces **60 errors**, all `TS2344: Type 'false' does not satisfy the
constraint 'true'` — i.e. 60 assertions where the library's inferred type or
validation result is wrong. Every actual value below was confirmed by probing
the compiler, not assumed.

> The suite is deliberately honest: many assertions stay green because the
> library genuinely handles them (see "What the library gets right" at the end).
> The failures cluster into three root causes.

## Root cause A — expression typing falls back to `unknown`

`ExprType` only understands bare columns, literals, casts, and a 9-function
whitelist (`count|sum|avg|min|max|upper|lower|concat|coalesce`). Everything else
resolves to `unknown`. Aliases/keys survive, but the value type is lost.

| Test | Query (abridged) | Expected | Actual |
|------|------------------|----------|--------|
| `expressions-arithmetic` A1–A10, A12 | `price * quantity`, `a + b`, `name \|\| '!'`, `-price`, `quantity << 1`, … | `number` / `string` | `unknown` |
| `functions` F1–F17, F19–F20 | `round`, `length`, `substring`, `abs`, `ceil`, `now`, `date_trunc`, `extract`, `to_char`, `nullif`, `greatest`, `least`, `string_agg`, `array_agg`, `json_build_object`, `row_number`, `rank`, `trim`, `position` | precise scalar/array | `unknown` |
| `case-expressions` C1–C5 | `CASE WHEN … THEN … END` (searched, simple, nested, no-ELSE, column branches) | union of branch types | `unknown` |
| `casting` K1, K2, K8 | `prices::int[]`, `metadata::text[]`, `CAST(prices AS int[])` | `number[]` / `string[]` | `unknown` (array suffix not parsed) |
| `casting` K3 | `quantity::int::text` (chained cast) | `string` (last cast wins) | `unknown` (`CastTypeName` becomes `int::text`) |
| `deep-schema` D2, D4 | `metadata->>'brand'`, `metadata#>>'{specs,weight}'` | `string` | `unknown` (no JSON operators) |
| `subqueries-ctes` S1 | scalar subquery `(SELECT count(*) …) AS pay_count` | `number` | `unknown` |
| `window-group-agg` W2 | `row_number() OVER (…) AS rn` | `number` | `unknown` |
| `lengthy-queries` L1, L2 | long select list ending/leading with a scalar subquery | subquery → `number`/`number` | subquery col → `unknown` (all 25 keys survive; the 350-char `ExtractBeforeFromTopLevel` cap did not truncate here, but the scalar subquery is untyped) |

## Root cause B — structural collapse to `never`

When the parser cannot model the FROM/projection shape, or two outputs collide,
the **entire result row** (or the whole query type) becomes `never` — every
column is silently lost.

| Test | Query (abridged) | Expected | Actual |
|------|------------------|----------|--------|
| `many-joins` J1 (status/total/title) | `SELECT * FROM orders JOIN products …` (both have a `status` column) | merged row with all columns | **`never`** — the colliding `status` poisons `UnionToIntersection`, collapsing the whole `SELECT *` row |
| `many-joins` J2 | `oi.quantity * oi.unit_price AS line_total` across a join | `{ line_total: number }` | `{ line_total: unknown }` (root cause A) |
| `many-joins` J5 | `o.status AS s, p.status AS s` (duplicate output key) | one `s` column | **`{ s: never }`** (intersection of the two unions) |
| `subqueries-ctes` S2 | derived table `FROM (SELECT count(*) AS cnt FROM orders) t` | `{ cnt: number }` | **`never`** — the subquery alias `t` is not a known table, so `Tables` → `never` |
| `window-group-agg` W5 | `SELECT DISTINCT ON (user_id) user_id, total …` | `{ user_id: number; total: number }` | **`never`** — `StripDistinct` removes only the leading `distinct`, leaving `on (user_id) …` in the projection |
| `casting` K10 | `SELECT not_a_col::text AS x` (invalid column, cast) | rejected / `{}` | `{ x: never }` — invalid column silently accepted as a `never` field |

## Root cause C — validation false-accepts (silent `true`)

`ValidateSQLNormalized` short-circuits to `true` for "high complexity" queries.
Any query containing `offset`, the literal token `snapshot_date`, or 5+ joins
combined with `order/group/limit`; and any UPDATE containing `case … select`
or `case … exists (` — skips ALL table/column validation. Invalid identifiers
pass. **These are the most dangerous: the library reports a broken query as
valid.**

| Test | Query (abridged) | Expected | Actual |
|------|------------------|----------|--------|
| `validation-negative` N1 | `SELECT nonexistent_col FROM products OFFSET 5` | `false` | **`true`** |
| `validation-negative` N2 | `SELECT id FROM no_such_table OFFSET 1` (invalid table) | `false` | **`true`** |
| `validation-negative` N3 | `… WHERE snapshot_date = 1` with `bogus_col` | `false` | **`true`** |
| `validation-negative` N4 | 5 joins + `ORDER BY`, invalid select column | `false` | **`true`** |
| `validation-negative` N5 | 5 joins + `GROUP BY`, invalid qualified column | `false` | **`true`** |
| `validation-negative` N6 | `UPDATE … SET … = CASE … (SELECT …) …, bogus_col = 5` | `false` | **`true`** |
| `validation-negative` N7 | `UPDATE … CASE … EXISTS (SELECT …) … WHERE bogus_col = 1` | `false` | **`true`** |
| `template-literal` V2 | `SELECT ${"id"\|"nonexistent_col"} FROM products` | `boolean` (one branch invalid) | **`false`** — union validation does not distribute as a per-branch result |

Control `validation-negative` N8 (`SELECT nonexistent_col FROM products`, no
bypass trigger) is correctly `false` — proving the bypass, not loose matching,
is the defect.

## Summary

| Category file | Failing assertions |
|---|---|
| `expressions-arithmetic.test.ts` | 11 |
| `functions.test.ts` | 19 |
| `case-expressions.test.ts` | 5 |
| `casting.test.ts` | 5 |
| `deep-schema.test.ts` | 2 |
| `template-literal-queries.test.ts` | 1 |
| `many-joins.test.ts` | 5 |
| `subqueries-ctes.test.ts` | 2 |
| `window-group-agg.test.ts` | 2 |
| `lengthy-queries.test.ts` | 2 |
| `validation-negative.test.ts` | 6 |
| **Total** | **60** |

## What the library gets right (green assertions — kept as controls)

These passed, so the suite stays credible rather than cherry-picked:

- Single-table `SELECT *`, nested JSON object / array / nullable-object columns,
  fully-qualified `schema.table.column` (`deep-schema` D1, D3, D5–D9).
- Deep multi-table **qualified** projections and **self-joins**
  (`many-joins` J3, J4).
- Single, multiple, and **recursive** CTEs, and `UNION` result shape
  (`subqueries-ctes` S3–S6), plus correctly **rejecting** invalid columns in a
  UNION's second branch / a WHERE subquery (S7, S8).
- Aggregate/coalesce wrapping even around unsupported inner expressions
  (`sum(price)/count(id)`, `sum(CASE …)`, `coalesce(status,'active')`,
  `sum(...) OVER (...)`, `count(*) FILTER (...)`) — `functions` F18,
  `expressions-arithmetic` A11, `case-expressions` C6, `window-group-agg` W1,
  W3, W4, W6, W7.
- Numeric/text scalar casts incl. `numeric(p,s)`, `CAST(x AS varchar)`, and
  cast-of-expression (`casting` K4–K7, K9).
- **Template-literal union queries**: a column/table drawn from a literal union
  distributes to the correct union of result rows
  (`template-literal` T1–T5, V1).
