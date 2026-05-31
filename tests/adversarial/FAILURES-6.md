# Adversarial round 6 — demonstrated failures of `@kuindji/typed-sql`

Rounds 1-5 are currently green. This sixth round targets three narrow surfaces
where valid SQL text is still misread by the type-level parser: complex
SELECT-list expression validation, no-space window/filter clauses, `JOIN ...
USING` semantics, and double-quoted aliases containing clause-looking text.

Running:

```sh
bun run typecheck
```

produces **6 errors**, all `TS2344: Type 'false' does not satisfy the
constraint 'true'`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| F1 | `SELECT sum(price + bogus_col) AS total FROM products` | `false` | Returns `true`; wrapping the invalid arithmetic expression in a function skips token-level validation of `bogus_col`. |
| F2 | `SELECT sum(CASE WHEN bogus_col = 1 THEN price ELSE 0 END) AS total FROM products` | `false` | Returns `true`; a complex aggregate argument hides invalid refs inside the `CASE` expression. |
| W1 | `SELECT row_number() OVER(PARTITION BY bogus_col) AS rn FROM users` | `false` | Returns `true`; no-space `OVER(...)` is not scanned by the window-clause extractor. |
| W2 | `SELECT count(*) FILTER(WHERE bogus_col > 0) AS c FROM users` | `false` | Returns `true`; no-space `FILTER(...)` is not scanned by the filter-clause extractor. |
| U1 | `SELECT * FROM users u JOIN orders o USING (user_id)` | `false` | Returns `true`; `USING(user_id)` is accepted because `user_id` exists on one joined table, but SQL requires it on both sides. |
| Q1 | `SELECT id AS "came from import" FROM users` | `{ "came from import": number }` | Returns `{ "\"came": number }`; select-list extraction treats ` from ` inside the quoted alias as the real `FROM` boundary. |

Controls in `select-list-clause-round6.test.ts` show the related surfaces that
already work: the same invalid arithmetic expression outside a function,
valid complex aggregate arguments, no-space window/filter clauses with real
columns, an equivalent valid `ON` join predicate, `USING(id)` where both tables
have the column, and a quoted alias with spaces but no ` from ` token.

## Likely fix direction

1. Make function argument validation recurse through token-level column-ref
   validation for complex expressions, not only `ExprType`.
2. Recognize both `OVER (` / `FILTER (` and `OVER(` / `FILTER(` when extracting
   window and filter bodies.
3. Add a dedicated `JOIN ... USING (...)` validation path that checks each
   listed column against every participating table source for that join.
4. Make `ExtractBeforeFromTopLevel` double-quote-aware, not only single-quote
   and parenthesis-aware.
