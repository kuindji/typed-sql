# Adversarial round 8 — demonstrated failures of `@kuindji/typed-sql`

Rounds 1-7 are currently green. This eighth round targets quote-awareness and
clause-scope issues that remain after the previous fixes.

Running:

```sh
bun run typecheck
```

produces **8 errors**, all `TS2344: Type 'false' does not satisfy the
constraint 'true'`, from
`tests/adversarial/quoted-alias-returning-round8.test.ts`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| Q1 | `SELECT id AS "id, display", email FROM users` | `{ "id, display": number; email: string }` | The select-list splitter treats the comma inside the double-quoted alias as a projection separator. |
| Q2 | `SELECT id AS "id) display" FROM users` | `{ "id) display": number }` | Alias extraction rejects aliases containing `)`, even when the paren is inside a quoted identifier. |
| I1 | `SELECT id user_id FROM users` | `{ user_id: number }` | Bare implicit aliases are not recognized; the whole `id user_id` text is treated as the expression. |
| I2 | `SELECT count(*) total FROM users` | `{ total: number }` | Bare implicit function aliases are not recognized; `count(*) total` does not infer the output alias. |
| A1 | `SELECT id AS bogus_col FROM users WHERE bogus_col = 1 ORDER BY bogus_col` | `false` | ORDER BY alias support lets the same select-list alias satisfy an invalid WHERE reference. |
| F1 | `SELECT sum(price+bogus_col) AS total FROM products` | `false` | Compound function-argument scanning only detects arithmetic when spaces surround the operator. |
| R1 | `SELECT ' returning ' AS marker FROM users` | `{ marker: " returning " }` | `HasReturning` treats text inside a string literal as a real RETURNING clause. |
| R2 | `SELECT id AS "has returning value" FROM users` | `{ "has returning value": number }` | `HasReturning` treats text inside a double-quoted alias as a real RETURNING clause. |

Controls in `quoted-alias-returning-round8.test.ts` show the related valid cases
that still work: ordinary quoted aliases, explicit `AS` aliases, ORDER BY alias
references, the spaced version of the invalid aggregate argument, and quoted
aliases without the clause-looking token.

## Likely fix direction

1. Make `SplitTopLevel` double-quote-aware, mirroring
   `ExtractBeforeFromTopLevel`, so commas inside quoted identifiers do not split
   projection lists.
2. Let explicit quoted aliases contain SQL punctuation, including `)`, before
   applying the defensive "alias contains paren" rejection to unquoted aliases.
3. Add a conservative implicit bare alias path for simple columns and function
   calls, avoiding compound expressions where the trailing token is ambiguous.
4. Scope select-list alias resolution to ORDER BY instead of letting the alias
   set satisfy WHERE/GROUP/HAVING token scans.
5. Detect compound function arguments after operator padding/normalization, not
   by looking only for spaced arithmetic tokens.
6. Make RETURNING detection query-kind and quote-aware, so SELECT literals or
   quoted identifiers containing `returning` do not switch result inference to
   the RETURNING path.
