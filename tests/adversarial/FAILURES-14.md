# Adversarial round 14 - CTE validation, WITH DML, and `ILIKE`

Running:

```sh
bun run typecheck
```

currently produces assertion failures from
`tests/adversarial/cte-dml-pattern-round14.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| CTE select | `WITH t AS (SELECT id FROM products) SELECT id FROM t` | `ValidateSQL` is `true` | Validation rejects the valid query, apparently because the outer `FROM t` CTE relation is treated as a missing base table. |
| WITH update result | `WITH changed AS (...) UPDATE products ... RETURNING id, status` | `{ id: number; status: "active" \| "inactive" }` | Return inference follows the CTE body's `SELECT id` path instead of the top-level DML `RETURNING` list. |
| ILIKE RHS | `SELECT id FROM products WHERE title ILIKE bogus_col` | `ValidateSQL` is `false` | The `ILIKE` RHS is not scanned as a column-bearing expression, so the unknown column is accepted. |

Controls keep the scope narrow: an invalid column inside a CTE body is still
expected to fail, and a literal `ILIKE 'pattern%'` predicate remains valid.
