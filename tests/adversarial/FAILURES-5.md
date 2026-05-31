# Adversarial round 5 — comments and DML source handling

Rounds 1-4 are currently green. This round adds a focused suite for places
where SQL syntax is valid but the type-level parser still misreads the query:
comments around string/select boundaries, multi-column UPDATE assignment, and
DELETE ... USING table sources.

Running:

```sh
bun run typecheck
```

produces **5 errors**, all `TS2344: Type 'false' does not satisfy the
constraint 'true'`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| C1 | `SELECT '/* not a comment */' AS note FROM users` | `{ note: "/* not a comment */" }` | The block-comment stripper runs inside string literals, so the literal content is changed before typing. |
| C2 | `SELECT id -- keep id\nFROM users` | `{ id: number }` | The line comment remains in the select item after newline normalization, so `id` is not inferred as the projected column. |
| U1 | `UPDATE products SET (title, bogus_col) = ('x', 1) WHERE id = 1` | `false` | Row-assignment targets are skipped by the simple assignment parser, so `bogus_col` is silently accepted. |
| D1 | `DELETE FROM orders USING no_such_table WHERE orders.id = 1` | `false` | `USING` table sources are not collected, so a nonexistent USING table is not validated. |
| D2 | `DELETE FROM orders USING users u WHERE u.id = orders.user_id` | `true` | The valid USING alias `u` is not collected, so a valid delete predicate is rejected. |

Controls in `comments-dml-round5.test.ts` show the related surfaces that already
work: plain string literal projection, doubled single quotes in a literal,
ordinary UPDATE assignment, INSERT ... VALUES, INSERT ... SELECT projection
validation, and rejecting an invalid DELETE ... USING alias reference.

## Likely fix direction

1. Make comment stripping quote-aware and add line-comment stripping before
   whitespace collapse. Block comments inside `'...'` must be preserved.
2. Parse UPDATE `SET (a, b) = (...)` row-assignment targets as a column list
   instead of dropping them because the left side contains punctuation.
3. Teach the table and alias collectors that `USING` in DELETE is a table-source
   clause, similar to FROM/JOIN for validation purposes.
