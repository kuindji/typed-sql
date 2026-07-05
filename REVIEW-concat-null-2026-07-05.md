# Adversarial review — `||` concat NULL propagation + never-poisoning fix

**Date:** 2026-07-05
**Scope:** the uncommitted change in `src/expressions.ts` (`ConcatStringResult` /
`ConcatChainNullable` / `ConcatLeftArrayType`, plus the `ArithViaScan` `||` arm
and the `Steps` threading through `ConcatType`), its pins A28–A35 in
`tests/query-result/select/arithmetic-expressions.test.ts`, and the README /
CONTRIBUTING doc updates.

## Verification (all re-run first-hand, not trusted from session notes)

| Check | Result |
|---|---|
| `tsc --noEmit` (full project) | 0 errors |
| `bun test` | 466 pass / 0 fail |
| `npm run perf` | instantiations **+0.19%**, types +0.10%, symbols +0.11% — all within the +10% budget |

The `reporting-v2-link-sums-depth.test.ts` regression the old ConcatType COST
NOTE was built to protect (`(array_agg(a || ' ' || b))[1]` inside a heavy union
query) did **not** re-trigger despite the nullability walk now running full
`ExprType` on each `||` operand. (The earlier "+0.03%" figure predates the
final pins; +0.19% is the number for the reviewed state.)

## Finding 1 — join-null concat is asymmetric and unsound on the right (MEDIUM)

Probe-confirmed against `WideSchema` with `LEFT JOIN shipments s` (`carrier` is
`string` non-null in the schema, `s` is the nullable join side):

```ts
// join-nullable ref LEFTMOST — caught (by accident):
QueryResult<"SELECT s.carrier || u.name AS v FROM users u LEFT JOIN shipments s ON …">
// → { v: string | null }  ✓

// join-nullable ref NOT leftmost — MISSED:
QueryResult<"SELECT u.name || s.carrier AS v FROM users u LEFT JOIN shipments s ON …">
// → { v: string }  ✗ UNSOUND — the value can be SQL NULL at runtime
```

This is the same unsoundness class the diff fixes for schema nullability,
reintroduced from the join side — and structurally the same shape as the
pre-round-12 arithmetic gap ("RefQualifier leftmost-dot accident, PARTIAL").

Root cause (three coordinated blockers):

1. `ApplyProjectionNull` only enters the operand-walk branch when
   `[T] extends [number | null]` (`src/expressions.ts` ~line 170) — a concat
   projection types `string`/`string | null`, so it never gets there and falls
   through to plain `ApplyJoinNull`, whose `RefQualifier` sees only the
   leftmost `x.` — hence the asymmetry.
2. `ArithRefJoinNullable` explicitly short-circuits `Op extends "||" ? false`
   (~line 206) — correct when `||` typed bare `string`, now a hole.
3. `ConcatChainNullable` itself cannot see join nullability: operand `ExprType`
   returns schema types; the join-null overlay is layered on later by the
   post-pass.

**Suggested fix:** a concat-aware branch in the `ApplyProjectionNull` post-pass
mirroring what round 12 did for arithmetic — when `T` is string-ish, under a
non-empty `Nullable` set, with a `||` present, walk the operands
(`ArithRefJoinNullable` minus the `||` short-circuit, or a small concat
variant). Cost is gated the same way the arith branch is: join-free queries and
plain projections pay nothing.

## Finding 2 — docs overclaim (LOW)

The new README / CONTRIBUTING wording says `||` gains `| null` "when any
operand may be NULL", unscoped. A join-nullable operand "may be NULL" but only
propagates when it happens to be the leftmost ref. Either fix Finding 1 or
scope the wording to schema (base-column) nullability.

## Attacks that did NOT land (probe-verified — don't re-flag)

- **Mis-split over-null:** `carrier || ' || '` (a literal containing `||`),
  `(carrier || carrier) || carrier` (paren left operand), and
  `coalesce(carrier || carrier, '') || upper(carrier)` (nested `||` in a
  function arg before the top-level one) all correctly type `string`. The
  textual leftmost-`||` split does produce garbage fragments, but they resolve
  to `never` (→ `null extends never` is false), not `unknown` — so no false
  `| null`.
- **Array concat preserved:** `prices || prices` → `number[]`; the array branch
  returns before the null walk. That is also semantically right: Postgres array
  `||` is not strict (`NULL || arr` → `arr`), so string-style NULL propagation
  there would have been wrong.
- **Never-poisoning fix holds:** `upper(carrier) || carrier` → `{ v: string }`
  (pins A34/A35).

## Accepted-by-contract behaviors touched by this change (not regressions)

- An unmodeled operand (`carrier || some_fn(x)`) types `unknown` →
  conservatively contributes `| null`. Deliberate, documented in the
  `ConcatChainNullable` comment; consistent with the `extract()` precedent.
- A cast strips base-column nullability (`carrier || tracking::text` →
  `string`) — the documented "any cast drops base-column nullability" contract.
- Chains beyond 20 `||` operands keep the historical non-null `string`
  (`Walk` cap). A `Steps`-budget exhaustion deep inside a huge query degrades
  an operand to `unknown` and therefore flips the concat to `string | null` —
  the opposite degrade direction from the Walk cap, but inherent to the
  unknown-⇒-null choice and only reachable near the depth ceiling.

## Verdict

Sound to commit as-is **if** Finding 1 is acceptable as a known gap (it is
strictly no worse than the pre-change behavior, which typed all of these
non-null); otherwise close the right-operand join-null hole first and add
LEFT-JOIN pins for both operand positions.
