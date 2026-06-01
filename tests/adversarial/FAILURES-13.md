# Adversarial round 13 - returning literals and `IS DISTINCT FROM`

Running:

```sh
bun run typecheck
```

currently produces assertion failures from
`tests/adversarial/returning-distinct-from-round13.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| R1 | `UPDATE products SET title = 'x' WHERE id = 1 RETURNING ' returning bogus_col' AS marker, id` | `{ marker: " returning bogus_col"; id: number }` | `ExtractReturningList` effectively anchors on a later ` returning ` substring inside the returned string literal, so the inferred row shape is wrong even though validation accepts the statement. |
| D1 | `SELECT id FROM products WHERE price IS DISTINCT FROM bogus_col` | `false` | The column scanner treats the `FROM` keyword inside the comparison operator as if it were a table/source boundary, so the invalid RHS column is not surfaced. |
| D2 | `SELECT id FROM products WHERE price IS NOT DISTINCT FROM bogus_col` | `false` | Same `IS [NOT] DISTINCT FROM` issue as D1; the RHS expression after operator-local `FROM` escapes validation. |

Controls in the test file keep the scope narrow: validation still accepts a
valid `RETURNING` literal query, a real invalid `RETURNING bogus_col` still
fails, and `price IS DISTINCT FROM price` remains valid.
