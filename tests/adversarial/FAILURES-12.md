# Adversarial round 12 - quote-aware structural scans and typed literals

Running:

```sh
bun run typecheck
```

currently produces assertion failures from
`tests/adversarial/quote-aware-structural-round12.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| S1 | `SELECT ' over (bogus_col)' AS marker FROM products` | `true` | The `OVER` clause-body extractor scans inside string literals and validates `bogus_col` as a real column ref. |
| S2 | `SELECT ' filter (where bogus_col > 0)' AS marker FROM products` | `true` | The `FILTER` extractor scans literal text and rejects a valid string projection. |
| S3 | `SELECT ' within group (order by bogus_col)' AS marker FROM products` | `true` | The ordered-set aggregate extractor scans literal text and rejects a valid string projection. |
| S4 | `SELECT ' distinct on (bogus_col)' AS marker FROM products` | `true` | `DISTINCT ON` surfacing is raw substring-based and scans literal text. |
| S5 | `SELECT ' using (bogus_col)' AS marker FROM products` | `true` | `JOIN ... USING` validation sees the string contents as a real USING clause. |
| A1 | `SELECT id AS "window over (bogus_col)" FROM products` | `true` | Structural marker extraction also scans inside quoted output aliases when the marker is preceded by an alias-space. |
| R1 | `QueryResult<UPDATE products SET title = ' returning bogus_col' WHERE id = 1 RETURNING id>` | `{ id: number }` | `ExtractReturningList` starts at the first ` returning ` substring, even when it occurs in a string literal before the real clause, so the returned row shape is wrong. |
| E1 | `SELECT ' extract(year from created_at)' AS marker FROM products` | `{ marker: " extract(year from created_at)" }` | The `EXTRACT(...)` rewrite mutates string literal contents, so the inferred literal value no longer matches the SQL text. |
| L1 | `SELECT DATE '2026-05-31' AS d FROM products` | `true` | PostgreSQL typed string literal prefix `DATE` is treated as an unqualified column ref. |
| L2 | `SELECT TIMESTAMP '2026-05-31 12:34:56' AS ts FROM products` | `true` | PostgreSQL typed string literal prefix `TIMESTAMP` is treated as an unqualified column ref. |

Controls in the test file keep the failures scoped: real invalid `OVER` and
`RETURNING` columns are still expected to fail, and real `EXTRACT(field FROM
source)` syntax remains expected to pass.
