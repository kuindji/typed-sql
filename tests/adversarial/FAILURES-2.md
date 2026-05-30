# Adversarial round 2 — demonstrated failures of `@kuindji/typed-sql`

Round 1 (`FAILURES.md`) drove the library from 60 failures to 0. This second
round probes new query situations. Running the type checker:

```
npx tsc --noEmit
```

produces **16 new errors** (`TS2344: Type 'false' does not satisfy the
constraint 'true'`) — 16 assertions where the library's inferred type or
validation result is wrong. Every actual value below was confirmed by probing
the compiler (a reveal-harness that assigns each result to `0` and reads the
printed type), not assumed.

The new files also carry **36 green control assertions** that pass, so the suite
stays honest rather than cherry-picked (two whole files —
`set-operations.test.ts` and `dml-extended.test.ts` — are fully green).

The failures cluster into the same three root causes as round 1.

## Root cause C — validation false-accepts (silent `true`)

The most dangerous class: the library reports a broken query as valid.

### C1. High-complexity bypass skips every non-SELECT-list clause

`IsHighComplexitySelect` (`src/validation.ts:161`) routes any query containing
`offset`, the literal token `snapshot_date`, or 5 joins + `order/group/limit` to
`ValidateSQLNormalizedLightSelect` (`src/validation.ts:128`), which validates
only the tables and the SELECT/RETURNING list. Invalid columns in
`WHERE` / `ORDER BY` / `GROUP BY` / `HAVING` are never checked. Round 1's `N`
tests only covered SELECT-list columns under the bypass.

| Test | Query (abridged) | Expected | Actual |
|------|------------------|----------|--------|
| `validation-bypass` B1 | `… WHERE bogus_col = 1 OFFSET 5` | `false` | **`true`** |
| `validation-bypass` B2 | `… WHERE p.bogus_col = 1 OFFSET 5` (qualified) | `false` | **`true`** |
| `validation-bypass` B3 | `… ORDER BY bogus_col OFFSET 5` | `false` | **`true`** |
| `validation-bypass` B4 | `… WHERE snapshot_date = 1` (nonexistent col) | `false` | **`true`** |
| `validation-bypass` B5 | `… GROUP BY bogus_col OFFSET 0` | `false` | **`true`** |
| `validation-bypass` B6 | `… GROUP BY category_id HAVING bogus_col > 1 OFFSET 0` | `false` | **`true`** |
| `validation-bypass` B7 | 5 joins + `WHERE bogus_col = 1 ORDER BY …` | `false` | **`true`** |
| `validation-bypass` B8 | 5 joins + `WHERE bogus_col = 1 LIMIT 10` | `false` | **`true`** |

Controls (correct, green): valid query under `offset` → `true` (C1); the same
invalid WHERE column with **no** bypass token → `false` (C2); a bypass token with
an invalid **table** → `false` (C3); a bypass token with an invalid **select**
column → `false` (C4). So the bypass — not loose matching — is the defect.

### C2. Columns inside `OVER(...)` / `FILTER(...)` are never validated

Even with no bypass. The select-list treats `fn() OVER (…)` as a function call,
so `NeedsTokenRefValidation` (`src/expressions.ts:247`) returns false and skips
token validation; the loose ref-scan only covers `RefScanSegment`
(`src/validation.ts:477`) = from-`FROM`-onward, so the pre-`FROM` window/filter
clause escapes entirely.

| Test | Query (abridged) | Expected | Actual |
|------|------------------|----------|--------|
| `window-functions` W1 | `row_number() OVER (PARTITION BY bogus_col)` | `false` | **`true`** |
| `window-functions` W2 | `row_number() OVER (ORDER BY bogus_col)` | `false` | **`true`** |
| `window-functions` W3 | `count(*) FILTER (WHERE bogus_col > 0)` | `false` | **`true`** |

Controls (green): valid `PARTITION BY name ORDER BY id` → `true`; valid
`FILTER (WHERE id > 0)` → `true`; a named `WINDOW w AS (…)` (clause after FROM, so
scanned) → `true`; the window result type stays `unknown` per the contract.

## Root cause A — expression typing loses the value (CTE inner-list leak)

`ExtractSelectList` (`src/parsing.ts:345`) greedily matches
`with ${string} select ${After}`, so the **inner** CTE select list leaks out as
the query result instead of the outer `SELECT … FROM cte` projection. Output
aliases and the `WITH t(a,b)` column-alias list are dropped.

| Test | Query (abridged) | Expected | Actual |
|------|------------------|----------|--------|
| `cte-advanced` T1 | `WITH t AS (SELECT id, name …) SELECT id FROM t` | `{ id: number }` | `{ id: number; name: string }` |
| `cte-advanced` T2 | `WITH t AS (SELECT id …) SELECT id AS uid FROM t` | `{ uid: number }` | `{ id: number }` (alias dropped) |
| `cte-advanced` T3 | `WITH t(a, b) AS (SELECT id, name …) SELECT a, b FROM t` | `{ a: number; b: string }` | `{ id: number; name: string }` (col list dropped) |
| `cte-advanced` T4 | `WITH t AS (SELECT id, name …) SELECT name AS label FROM t` | `{ label: string }` | `{ id: number; name: string }` |

Controls (green): `SELECT * FROM cte` → the inner row (correct by coincidence);
an invalid column in the CTE **body** → `false`.

## Root cause B — structural collapse to `never` (SQL comment)

The normalizer (`src/parsing.ts:3`) does not strip SQL comments. A block comment
inside the select list survives into an expression, which fails to resolve to a
column or function key; `MergeRow` then collapses the whole projected row.

| Test | Query (abridged) | Expected | Actual |
|------|------------------|----------|--------|
| `identifiers-literals` I6 | `SELECT id, /* note */ name FROM users` | `{ id: number; name: string }` | **`never`** |

(A trailing line comment — I7 `SELECT id FROM users -- trailing` — happens to
survive and stays green.)

## Summary

| Category file | Failing | Green controls |
|---|---|---|
| `validation-bypass.test.ts` | 8 | 4 |
| `window-functions.test.ts` | 3 | 4 |
| `cte-advanced.test.ts` | 4 | 2 |
| `identifiers-literals.test.ts` | 1 | 8 |
| `set-operations.test.ts` | 0 | 8 |
| `dml-extended.test.ts` | 0 | 10 |
| **Total** | **16** | **36** |

## What the library gets right (green controls)

- **Set operations**: `UNION` / `UNION ALL` / `INTERSECT` / `EXCEPT` take the
  first branch's shape, and an invalid column in any branch is rejected
  (`set-operations` U1–U8).
- **Extended DML**: `INSERT … SELECT` (valid + invalid source col),
  multi-row `VALUES`, `UPDATE … FROM`, `DELETE … USING`, `ON CONFLICT DO UPDATE`
  with `excluded.*`, and `RETURNING` aliases all validate/type correctly
  (`dml-extended` D1–D10).
- **Identifiers/literals**: double-quoted and back-ticked identifiers,
  case-insensitive table/column resolution, schema-qualified refs, qualified +
  quoted columns, trailing line comments, and precise string/boolean literal
  types (`identifiers-literals` I1–I5, I7–I9).
- **Validation/window controls** as noted under C1/C2 above.
