# Adversarial round 11 - function-local clauses and quoted alias punctuation

Running:

```sh
bun run typecheck
```

currently produces 6 `TS2344` assertion failures from
`tests/adversarial/function-clause-round11.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| F1 | `SELECT extract(year FROM created_at) AS y FROM products` | `true` | Valid PostgreSQL `EXTRACT(field FROM source)` syntax is rejected; the function-local keyword grammar is treated like ordinary refs. |
| F2 | `SELECT date_trunc('day', bogus_col) AS d FROM products` | `false` | Invalid bare column inside a comma-style function argument in the SELECT list is accepted. |
| A1 | `SELECT array_agg(bogus_col ORDER BY created_at) AS ids FROM products` | `false` | Aggregate-local `ORDER BY` keeps an invalid aggregate argument hidden from SELECT-list column validation. |
| A2 | `SELECT array_agg(id ORDER BY bogus_col) AS ids FROM products` | `false` | Aggregate-local sort expression is not validated as a column-ref surface. |
| W1 | `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY bogus_col) AS p FROM products` | `false` | Ordered-set aggregate `WITHIN GROUP` bodies are not surfaced like `OVER` / `FILTER` clause bodies. |
| Q1 | `SELECT "u-1".id FROM users AS "u-1"` | `{ id: number }` | Quoted alias punctuation resolves loosely during validation but result inference degrades the qualified column to `unknown`/record shape instead of the table column type. |

Controls in the test file confirm the same aggregate-local and ordered-set
forms pass with real columns, invalid `EXTRACT(... FROM bogus_col)` is still
rejected, and simple quoted aliases still infer correctly.
