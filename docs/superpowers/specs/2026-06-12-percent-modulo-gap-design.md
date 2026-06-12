# Close the `%` (modulo) validation gap — design

**Date:** 2026-06-12
**Status:** Approved (Approach A — quote-aware `%` pad, narrow fix)

## Problem

Spaceless modulo arithmetic is falsely rejected by `ValidateSQL` while the
spaced form works:

- `select quantity % 2 from order_items` → `true`, types `number` ✓
- `select quantity%2 from order_items` → **`false`** ✗ (and `a%2` in
  WHERE/GROUP BY has the same problem)

This is the long-standing "`%`/HasSpecial gap" from the CONTRIBUTING gotchas
table. Per the lenient-parser contract ("never reject valid SQL"), the false
reject is a genuine bug, not intended leniency.

### Root cause

The **typing** path is already fine: `ExprType`'s arithmetic gate matches the
bare `%` character and `SplitTopLevelOp` splits on `%` without requiring
spaces, so `quantity%2` already types `number`. The gap is entirely on the
**validation** side, in two layers:

1. `HasSpecial` (`src/parsing/string-utils.ts`) does not include `%`, so
   expression-detectors built on it (`RefHasSpecial` in `partial.ts`,
   `IsSimpleRefPart` / `IsUnqualifiedColumnCandidate` in `columns.ts`, alias
   checks in `parsing/split.ts`, `parsing/extract.ts`) treat `quantity%2` as a
   single plain identifier.
2. The tokenizer (`src/parsing/tokenize.ts`) does not pad `%`
   (`PadOperators`), recognize it as an operator (`OperatorToken`), or strip
   it inside double-quoted identifiers (`DQuotedPunct`). So `quantity%2`
   survives `LooseScanView` as one token, reaches the ref-scan as a column
   candidate, fails the schema lookup, and flips `ValidateSQL` to `false`.

## Design

Make `%` behave symmetrically with `/` across validation, with one deliberate
exception (padding must be quote-aware). Four edits:

### 1. `HasSpecial` + `%` (`src/parsing/string-utils.ts`)

Add `S extends `${string}%${string}` ? true :` to the operator arms. Effect:
every `HasSpecial`-based detector now classifies a `%`-bearing token as an
expression (skipped / routed to expression handling), never as an
identifier/alias/simple ref. Unquoted SQL identifiers can never contain `%`,
so no valid identifier is misclassified.

### 2. `OperatorToken` + `%` (`src/parsing/tokenize.ts`)

Add `%` to the union. Effect: once padded, the `%` token is recognized as an
operator — `CanPrecedeColumn` blesses the following token, so
`a % bogus_col` validates (and rejects) its RHS exactly like `a / bogus_col`;
the `%` token itself is never mistaken for a column.

### 3. `DQuotedPunct` + `%` (`src/parsing/tokenize.ts`)

Add `%` to the union. Effect: `MaybeStripDQuotedPunct` removes `%` inside
double-quoted identifiers before padding, so `"a%b"` stays a single token
(`"ab"`) through the ref-scan instead of being split into bogus tokens.

### 4. Quote-aware `%` padding — new `MaybePadModulo` in `LooseScanView`

**Not** via the plain `PadOperator` chain. New pipeline stage in
`LooseScanView` (and only there — `TokenizeTables` / FROM-clause collection
never sees `%` in valid SQL):

```ts
LooseScanView<N> =
  CollapseSpaces<RestoreWildcards<PadOperators<ProtectWildcards<
    MaybePadModulo<MaybeMarkDQuotedSpaces<MaybeStripDQuotedPunct<N>>>
  >>>>
```

- Gate: `S extends `${string}%${string}`` — `%`-free queries (the
  overwhelming majority) short-circuit to identity.
- No single quote present → plain `PadOperator<S, "%">`.
- Otherwise a pairwise span-jump (same shape as `BlankSingleQuotedLiterals`):
  hop to the leftmost `'`, pad `%` in the preceding run via `ReplaceAll`,
  copy the `'…'` span verbatim, recurse on the tail. Leftmost `''`-escape
  pairing and unterminated-quote-to-EOF behavior mirror
  `BlankSingleQuotedLiterals`. Depth is O(number of literals), step-capped as
  a runaway backstop (cap ~300, matching siblings; on cap, append remainder
  unpadded — lenient direction).

**Why quote-aware:** `ShouldNeutralizeForScan` skips literal-blanking for
multi-line / over-length-budget queries, so on those paths `LooseScanView`
input still contains intact literals. Plain padding would turn
`LIKE '%smith%'` into `' % smith % '`, making `smith` a blessed
(`CanPrecedeColumn<"%">` = true) column candidate → **new false rejects on
the most common use of `%` in SQL**. Quote-aware padding never touches
literal interiors, on any path. Placement after `MaybeStripDQuotedPunct`
means `%` inside double-quoted identifiers is already gone before padding
runs; single quotes inside double-quoted identifiers are a pre-existing
non-tracked edge across all these walks (every `'` toggles) and stay that
way.

### Out of scope

- The pre-existing literal-leak for `(` `)` `,` on non-neutralized paths
  (Approach B — blanking literals inside `LooseScanView` itself) — separately
  verifiable follow-up, not needed to close this gap.
- `%` in `PadOperators` proper: deliberately NOT added (see "why
  quote-aware").
- Runtime builder changes: none needed — validation/typing types are shared.

## Error handling / lenient-contract conformance

- A `%` token whose operands the scan cannot resolve stays lenient (skip →
  `true`), matching the arithmetic-operand rule ("operand the core path
  cannot resolve types `unknown`, never `never`").
- On the `MaybePadModulo` step-cap, the remainder passes through unpadded —
  identical to today's behavior, never a new rejection.

## Testing

New type-level tests following the existing split —
`tests/validation/select/modulo-operator.test.ts` for the `ValidateSQL`
cases and `tests/query-result/select/modulo-operator.test.ts` for the
`GetReturnType` cases — all under the project's strict config (never
standalone `tsc` probes):

1. `select quantity%2 from order_items` → `ValidateSQL` `true`,
   `GetReturnType` `number` (spaceless, SELECT).
2. `quantity % 2` spaced — unchanged: `true` / `number`.
3. `a % bogus_col` (spaced) and `a%bogus_col` (spaceless) → `false`
   (full-symmetry rejection).
4. `where name like '%foo%'` — small (neutralized), multi-line, and
   over-budget (report-scale) variants all stay `true`.
5. `"a%b"` double-quoted identifier in a projection → not falsely rejected.
6. `%` in WHERE / GROUP BY (`where id % 2 = 0`, spaceless variant).
7. Modulo under a LEFT JOIN nullable side → `number | null`
   (`ArithRefJoinNullable` already handles `%`; pin it).
8. `value::numeric % 10` cast-operand chain stays lenient/typed.

Gates: `npm run typecheck` clean **×3** (depth-noise rule: trust only
repeated clean full-suite runs), `bun test` 442+/0, zero regressions across
the existing suite (commerce/netsec corpus included).

## Known risks

- `HasSpecial` is consumed in 8+ sites; flipping `%`-bearing tokens from
  "identifier" to "expression" could surface a hidden dependency. Mitigation:
  the full corpus suite; any token legitimately containing `%` would have to
  come from inside quotes, which steps 3–4 handle.
- Depth pressure: `MaybePadModulo` adds a gated walk to `LooseScanView`,
  which runs per-segment on hot validation paths. Gating on `%` presence
  keeps `%`-free queries at one pattern-match. Chunk budget follows the
  round-11 lesson (tail counts, not jumps).
