# Adversarial round 17 - CTE / derived-table exposed-row boundaries

Running:

```sh
bun run typecheck
```

currently produces assertion failures from
`tests/adversarial/cte-derived-surface-round17.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| CTE outer WHERE unprojected column | `WITH t AS (SELECT id FROM products) SELECT id FROM t WHERE status = 'active'` | `ValidateSQL` is `false` | The CTE shape validator checks the outer projection, but not the outer predicate, so `products.status` leaks through from the CTE body. |
| CTE outer WHERE qualified unprojected column | `WITH t AS (SELECT id FROM products) SELECT id FROM t WHERE t.status = 'active'` | `ValidateSQL` is `false` | The CTE relation is treated as exposing `status` even though its output row only contains `id`. |
| Derived outer WHERE unprojected column | `SELECT id FROM (SELECT id FROM products) dt WHERE status = 'active'` | `ValidateSQL` is `false` | The derived-table shape validator also skips outer predicate refs, so a non-exposed body column is accepted. |
| Derived outer WHERE qualified unprojected column | `SELECT id FROM (SELECT id FROM products) dt WHERE dt.status = 'active'` | `ValidateSQL` is `false` | Qualified derived-table refs are not constrained to the derived row outside the projection list. |
| CTE function argument unprojected column | `WITH t AS (SELECT id FROM products) SELECT upper(status) AS product_status FROM t` | `ValidateSQL` is `false` | A ref wrapped in a function is accepted because the shape check constrains only plain projected column reads. |
| Derived function argument unprojected column | `SELECT upper(dt.status) AS product_status FROM (SELECT id FROM products) dt` | `ValidateSQL` is `false` | Function arguments can read columns not exposed by the derived table. |

Controls keep the scope narrow: predicates over projected CTE/derived columns
remain valid. I did not add multi-CTE or CTE+join cases in this round because
the current implementation comments already identify those as broader fallback
territory; this file targets the special shape path that is already present.
