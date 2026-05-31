# Adversarial round 10 - SQL casing and structural token blind spots

Running:

```sh
bun run typecheck
```

currently produces 5 `TS2344` assertion failures from
`tests/adversarial/sql-casing-structural-round10.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| C1 | long `SELECT ... 'MiXeD' AS "CaseSensitiveValue" FROM users` | `{ CaseSensitiveValue: "MiXeD", ... }` | After the 120-character normalization cap, the remainder is lowercased wholesale, including quoted/literal text. |
| A1 | `SELECT id AS "Order ID" FROM users ORDER BY "Order ID"` | `true` | ORDER BY alias resolution tokenizes the quoted alias on its internal space. |
| A2 | `SELECT "user alias".id FROM users AS "user alias"` | `true` | Table alias collection treats the quoted alias as multiple tokens instead of one identifier. |
| O1 | `SELECT id FROM products WHERE status IS DISTINCT FROM 'active'` | `true` | The `from` in the comparison operator is collected as a table-source boundary. |
| O2 | `SELECT id FROM products WHERE status IS NOT DISTINCT FROM 'active'` | `true` | Same `IS [NOT] DISTINCT FROM` table-tokenization issue. |

Controls in the test file confirm ordinary mixed-case SQL syntax still works,
unquoted ORDER BY aliases still resolve, simple quoted table aliases still pass,
and invalid columns near `IS DISTINCT FROM` are still rejected.
