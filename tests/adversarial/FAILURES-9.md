# Adversarial round 9 — structural blind spots

Running:

```sh
bun run typecheck
```

currently produces 4 `TS2344` assertion failures from
`tests/adversarial/structural-blind-spots-round9.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| D1 | `SELECT DISTINCT ON (bogus_col) id FROM products` | `false` | `DISTINCT ON (...)` is stripped before validation, so `bogus_col` is never checked. |
| J1 | `orders JOIN users USING (status) JOIN products ...` | `false` | `USING(status)` is accepted because `status` exists on `orders` and unrelated later `products`, even though `users` lacks it. |
| U1 | high-complexity `UPDATE ... WHERE bogus_col IN (1, 2)` | `false` | Parenthesized high-complexity UPDATE predicates are skipped, so the bogus top-level column is accepted. |
| A1 | `SELECT id FROM users AS "u,1"` | `true` | The comma inside a quoted table alias is mistaken for a top-level FROM separator. |

The controls in the test file show the defects are scoped: ordinary invalid
projections still fail, unmasked invalid `USING` still fails, valid
parenthesized high-complexity updates still pass, and quoted aliases without a
comma still work.
