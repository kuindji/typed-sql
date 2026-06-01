# Adversarial round 15 - pattern operators and UPDATE `AS` aliases

Running:

```sh
bun run typecheck
```

currently produces assertion failures from
`tests/adversarial/pattern-update-alias-round15.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| SIMILAR TO RHS | `SELECT id FROM products WHERE title SIMILAR TO bogus_col` | `ValidateSQL` is `false` | The RHS after `SIMILAR TO` is not scanned as a column-bearing expression, so the unknown column is accepted. |
| LIKE ESCAPE expr | `SELECT id FROM products WHERE title LIKE 'shoe!%' ESCAPE bogus_col` | `ValidateSQL` is `false` | The expression after `ESCAPE` is not treated as a column position, so the unknown bareword is accepted. |
| UPDATE AS alias | `UPDATE products AS p SET status = CASE WHEN EXISTS (...) THEN ... END WHERE p.id = 1` | `ValidateSQL` is `true` | The high-complexity UPDATE alias parser treats `AS` as the alias, so the real alias `p` is rejected in the top-level `WHERE`. |

Controls keep the scope narrow: literal `SIMILAR TO` and `LIKE ... ESCAPE '!'`
patterns remain valid, and the same high-complexity UPDATE validates when the
target table uses a bare alias (`UPDATE products p ...`).
