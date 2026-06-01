# Adversarial round 16 - relation scope and alias boundaries

Running:

```sh
bun run typecheck
```

currently produces assertion failures from
`tests/adversarial/scope-resolution-round16.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| Aliased table base qualifier | `SELECT products.id FROM products p ...` | `ValidateSQL` is `false` | Once `products` is aliased as `p`, the base table name should no longer qualify columns at that query level, but the validator still resolves it. |
| Outer WHERE scope leak | `SELECT id FROM products WHERE email = 'x' AND EXISTS (SELECT 1 FROM users)` | `ValidateSQL` is `false` | The whole-query table scan lets `users.email` satisfy an unqualified outer `email` reference even though `users` only exists inside the subquery. |
| Derived table validation | `SELECT id FROM (SELECT id FROM products) dt` | `ValidateSQL` is `true` | Result inference supports this derived-table shape, but validation still rejects the derived source/query. |
| CTE output surface | `WITH t AS (SELECT id FROM products) SELECT status FROM t` | `ValidateSQL` is `false` | The outer query should see only the CTE's projected row, but the validator resolves `status` through the CTE body's base `products` table. |
| CTE column alias list | `WITH t(product_id) AS (SELECT id FROM products) SELECT product_id FROM t` | `ValidateSQL` is `true` | The CTE output alias is not treated as the exposed column name, so the valid outer read is rejected. |
| CTE column alias hiding | `WITH t(product_id) AS (SELECT id FROM products) SELECT id FROM t` | `ValidateSQL` is `false` | The inner projected name leaks through despite the CTE column alias list renaming it. |

Controls keep the scope narrow: alias-qualified access through `p.id`, a normal
correlated `EXISTS`, and the already-supported plain CTE projected-column read
remain valid.
