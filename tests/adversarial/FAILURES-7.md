# Adversarial round 7 — demonstrated failures of `@kuindji/typed-sql`

Rounds 1-6 are currently green. This seventh round targets three narrow
surfaces where valid SQL text is still misread or under-validated: normal
`UPDATE` expression refs, comment markers inside double-quoted identifiers, and
implicit output aliases.

Running:

```sh
bun run typecheck
```

produces **5 errors**, all `TS2344: Type 'false' does not satisfy the
constraint 'true'`.

| Test | Query | Expected | Observed failure |
|---|---|---|---|
| U1 | `UPDATE orders SET total = bogus_col WHERE id = 1` | `false` | Returns `true`; the normal UPDATE path validates SET target names but skips column refs inside SET RHS expressions. |
| U2 | `UPDATE orders SET total = 1 WHERE bogus_col = 1` | `false` | Returns `true`; normal UPDATE predicates are not scanned for unqualified invalid refs. |
| U3 | `UPDATE orders o SET total = 1 WHERE o.bogus_col = 1` | `false` | Returns `true`; normal UPDATE predicates are not scanned for qualified invalid refs either. |
| Q1 | `SELECT id AS "kept /* marker */ name" FROM users` | `{ "kept /* marker */ name": number }` | The return shape is not equal to the quoted alias; comment stripping treats `/* marker */` inside a double-quoted identifier as a real block comment. |
| Q2 | `SELECT id "implicit id" FROM users` | `{ "implicit id": number }` | The implicit alias is not recognized; return inference only handles explicit `AS` aliases. |

Controls in `update-quoted-alias-round7.test.ts` show the related valid cases
that already work: UPDATEs using real RHS/WHERE columns, a double-quoted alias
without comment markers, and the same output alias written with explicit `AS`.

## Likely fix direction

1. Add a bounded normal-UPDATE ref scan for RHS expressions and the top-level
   WHERE predicate, resolving columns against the update target table and alias.
2. Make `StripCommentsWalk` double-quote-aware, mirroring
   `LowercaseOutsideQuotes`, so comment markers inside quoted identifiers are
   preserved.
3. Extend projection alias parsing to recognize implicit output aliases
   (`expr alias`, including quoted aliases) without confusing function syntax or
   compound expressions for aliases.
