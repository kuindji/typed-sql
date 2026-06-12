# Close the `%` (Modulo) Validation Gap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ValidateSQL` accepts spaceless modulo (`quantity%2`) and rejects bogus operands around `%` (`a % bogus_col`), with zero new false rejects on `LIKE '%…%'` literals or `%`-bearing quoted identifiers.

**Architecture:** Validation-only change (the typing path already splits on the bare `%` char). Four edits make `%` symmetric with `/`: add `%` to `HasSpecial`, `OperatorToken`, and `DQuotedPunct`, plus a new quote-aware `MaybePadModulo` stage in `LooseScanView` — deliberately NOT the plain `PadOperator` chain, because `LooseScanView` also runs on non-neutralized inputs (multi-line / over-budget queries skip literal-blanking) where plain padding would leak `LIKE`-pattern words as blessed column candidates.

**Tech Stack:** TypeScript type-level programming. Spec: `docs/superpowers/specs/2026-06-12-percent-modulo-gap-design.md`.

---

## Critical project rules (read before starting)

- **Typecheck command:** `npm run typecheck` (runs `tsc --noEmit` with the 8 GB heap flag baked in; takes ~45–60 s). This is the ONLY way to evaluate type-level tests. **NEVER** run `tsc` on a standalone file — it disables `strictNullChecks` and lies.
- **Depth-noise rule:** in-project `ValidateSQL` results are depth-sensitive; trust only the full-suite typecheck. The final gate is typecheck clean **three times in a row**.
- **Runtime tests:** `bun test` (the new files are type-only; they must still compile and not break the suite — currently 442 pass / 0 fail).
- **Lenient contract:** never reject valid SQL. If a step's typecheck shows failures in PRE-EXISTING test files (not the new modulo files), STOP — that is a regression, not expected fallout. Investigate before proceeding.
- Tests are plain `.test.ts` files of type aliases; "passing" = the file compiles. `RequireTrue<AssertEqual<X, Y>>` errors when `X ≠ Y`.

## File map

| File | Action | Responsibility |
|---|---|---|
| `tests/validation/select/modulo-operator.test.ts` | Create | `ValidateSQL` cases + `LooseScanView` padding unit pins |
| `tests/validation/select/index.ts` | Modify | register the new test file (export convention) |
| `tests/query-result/select/modulo-operator.test.ts` | Create | `QueryResult` typing pins (spaceless, join-nullability) |
| `src/parsing/string-utils.ts` | Modify (~line 64) | `HasSpecial` + `%` arm |
| `src/parsing/tokenize.ts` | Modify (~lines 162, 170, 290, 299) | `OperatorToken`/`DQuotedPunct` + `%`; new `MaybePadModulo`; rewire `LooseScanView` |
| `CONTRIBUTING.md` | Modify | drop the "Known pre-existing gap" gotcha row |

---

### Task 1: Failing tests — validation side

**Files:**
- Create: `tests/validation/select/modulo-operator.test.ts`
- Modify: `tests/validation/select/index.ts`

- [ ] **Step 1: Verify the barrel export for `LooseScanView`**

Run: `grep -n "tokenize" src/parsing.ts`
Expected: a re-export line like `export type * from "./parsing/tokenize.js"` (parsing.ts is a thin barrel). If `LooseScanView` is NOT reachable via `src/parsing.js`, import it from `../../../src/parsing/tokenize.js` in the test below instead.

- [ ] **Step 2: Write the validation test file**

Create `tests/validation/select/modulo-operator.test.ts`:

```ts
/**
 * Modulo (%) operator validation — closes the spaceless `%` gap.
 *
 * Before this round, `%` was absent from HasSpecial and the tokenizer
 * (PadOperators/OperatorToken/DQuotedPunct), so `quantity%2` parsed as a
 * single bogus identifier (false reject) while `a % bogus_col` was silently
 * accepted (the `%` token never blessed its RHS for validation).
 *
 * `%` padding is QUOTE-AWARE (MaybePadModulo): `LIKE '%foo%'` literal
 * interiors are never padded, on any dispatch path. Pinned directly via
 * LooseScanView unit assertions below.
 *
 * If this file compiles without errors, all tests pass.
 */

import type { LooseScanView } from "../../../src/parsing.js";
import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/validation-schemas.js";

// ============================================================================
// Spaceless modulo — was falsely rejected (the gap)
// ============================================================================

// Test: spaceless modulo in the SELECT list validates
type V_SpacelessSelect = ValidateSQL<"SELECT id%2 AS parity FROM users", TestSchema>;
type _M1 = RequireTrue<AssertEqual<V_SpacelessSelect, true>>;

// Test: spaced modulo keeps validating (regression pin)
type V_SpacedSelect = ValidateSQL<"SELECT id % 2 AS parity FROM users", TestSchema>;
type _M2 = RequireTrue<AssertEqual<V_SpacedSelect, true>>;

// Test: spaceless modulo in WHERE validates
type V_SpacelessWhere = ValidateSQL<"SELECT id FROM users WHERE id%2 = 0", TestSchema>;
type _M3 = RequireTrue<AssertEqual<V_SpacelessWhere, true>>;

// Test: spaceless modulo in GROUP BY validates
type V_SpacelessGroupBy = ValidateSQL<"SELECT count(*) AS n FROM users GROUP BY id%2", TestSchema>;
type _M4 = RequireTrue<AssertEqual<V_SpacelessGroupBy, true>>;

// ============================================================================
// Full symmetry — bogus operands around % are now caught
// ============================================================================

// Test: spaced bogus RHS is rejected (was a silent accept before this round:
// `%` was not an OperatorToken, so CanPrecedeColumn never blessed the RHS)
type V_BogusRhsSpaced = ValidateSQL<"SELECT id % bogus_col AS x FROM users", TestSchema>;
type _M5 = RequireTrue<AssertEqual<V_BogusRhsSpaced, false>>;

// Test: spaceless bogus RHS is rejected. NOTE: this is `false` today too,
// but for the WRONG reason (the whole `id%bogus_col` token fails a column
// lookup). It must STAY false once padding splits it properly.
type V_BogusRhsSpaceless = ValidateSQL<"SELECT id%bogus_col AS x FROM users", TestSchema>;
type _M6 = RequireTrue<AssertEqual<V_BogusRhsSpaceless, false>>;

// ============================================================================
// LIKE patterns — % inside string literals must never be padded
// ============================================================================

// Test: small quoted query (neutralized path: literal is blanked upstream)
type V_LikeSmall = ValidateSQL<"SELECT id FROM users WHERE name LIKE '%foo%'", TestSchema>;
type _M7 = RequireTrue<AssertEqual<V_LikeSmall, true>>;

// Test: LIKE pattern and a spaceless modulo in the same WHERE
type V_LikeAndModulo = ValidateSQL<
    "SELECT id FROM users WHERE name LIKE '%foo%' AND id%2 = 0",
    TestSchema
>;
type _M8 = RequireTrue<AssertEqual<V_LikeAndModulo, true>>;

// Test: multi-line UPDATE with LIKE + spaceless modulo stays valid
type V_LikeMultilineUpdate = ValidateSQL<
    "UPDATE users\nSET name = 'x'\nWHERE name LIKE '%foo%' AND id%2 = 0",
    TestSchema
>;
type _M9 = RequireTrue<AssertEqual<V_LikeMultilineUpdate, true>>;

// Test: report-scale (>500 chars, exceeds the length budget so literal
// blanking is SKIPPED — ShouldNeutralizeForScan is false) SELECT with a LIKE
// pattern stays valid. Guards the non-neutralized dispatch path end to end.
type V_LikeReportScale = ValidateSQL<
    "SELECT id AS c01, id AS c02, id AS c03, id AS c04, id AS c05, id AS c06, id AS c07, id AS c08, id AS c09, id AS c10, id AS c11, id AS c12, id AS c13, id AS c14, id AS c15, id AS c16, id AS c17, id AS c18, id AS c19, id AS c20, id AS c21, id AS c22, id AS c23, id AS c24, id AS c25, id AS c26, id AS c27, id AS c28, id AS c29, id AS c30, id AS c31, id AS c32, id AS c33, id AS c34, id AS c35, id AS c36, id AS c37, id AS c38, id AS c39, id AS c40, id AS c41, id AS c42, id AS c43, id AS c44, id AS c45, id AS c46, id AS c47, id AS c48 FROM users WHERE name LIKE '%foo%'",
    TestSchema
>;
type _M10 = RequireTrue<AssertEqual<V_LikeReportScale, true>>;

// ============================================================================
// Quoted identifiers containing % — must not be split by padding
// ============================================================================

// Test: a double-quoted alias containing % stays a single token. Without the
// DQuotedPunct strip, padding would explode `"mod%2"` into bogus tokens and
// falsely reject. (The strip rewrites it to `"mod2"` — same treatment as the
// existing `"u,1"` -> `"u1"` behavior.)
type V_QuotedAliasWithPercent = ValidateSQL<
    'SELECT id AS "mod%2" FROM users',
    TestSchema
>;
type _M11 = RequireTrue<AssertEqual<V_QuotedAliasWithPercent, true>>;

// ============================================================================
// Cast-operand chain — stays lenient (never a new rejection)
// ============================================================================

// Test: a cast as the LHS operand of % keeps validating (the `::` routes the
// expression away from token-ref validation; the % padding must not break it)
type V_CastOperandChain = ValidateSQL<"SELECT id::numeric % 10 AS x FROM users", TestSchema>;
type _M12 = RequireTrue<AssertEqual<V_CastOperandChain, true>>;

// ============================================================================
// LooseScanView unit pins — quote-aware padding, precisely
// ============================================================================

// Pin: % is padded OUTSIDE literals, never inside them
type _P1 = RequireTrue<AssertEqual<
    LooseScanView<"where name like '%foo%' and id%2 = 0">,
    "where name like '%foo%' and id % 2 = 0"
>>;

// Pin: %-free input is untouched (gate short-circuits)
type _P2 = RequireTrue<AssertEqual<
    LooseScanView<"where id = 1">,
    "where id = 1"
>>;

// Pin: quote-free input with % gets plain padding
type _P3 = RequireTrue<AssertEqual<
    LooseScanView<"id%2">,
    "id % 2"
>>;

// Pin: unterminated literal — the tail after the opener is copied verbatim
// (lenient: no padding inside what is textually a string literal)
type _P4 = RequireTrue<AssertEqual<
    LooseScanView<"name like '%foo">,
    "name like '%foo"
>>;

// All modulo validator tests pass if this file compiles
export type ModuloValidatorTestsPass = true;
```

- [ ] **Step 3: Register the file in the index**

In `tests/validation/select/index.ts`, add after the `PartialValidatorTestsPass` export line:

```ts
export type { ModuloValidatorTestsPass } from "./modulo-operator.test.js";
```

- [ ] **Step 4: Run the full typecheck to verify the expected RED set**

Run: `npm run typecheck`
Expected FAILURES, all inside `tests/validation/select/modulo-operator.test.ts` ONLY:
- `_M1` (spaceless SELECT — currently false)
- `_M3` (spaceless WHERE — currently false)
- `_M4` (spaceless GROUP BY — currently false)
- `_M5` (spaced bogus RHS — currently silently accepted, so `true ≠ false`)
- `_M8`, `_M9` (contain `id%2` — currently false)
- `_P1`, `_P3` (LooseScanView does not pad `%` yet)

Expected PASSES: `_M2`, `_M6`, `_M7`, `_M10`, `_M11`, `_M12`, `_P2`, `_P4`, and every pre-existing test file. If any OTHER file fails, STOP and investigate (depth-noise or a real interaction) before continuing.

Note: exact RED membership for `_M4`/`_M8`/`_M9`/`_M10` may differ slightly (different dispatch paths have different leniency today). Record the actual RED set in the commit message; what matters is (a) all failures are in the new file, (b) `_M1`/`_M3`/`_M5`/`_P1`/`_P3` are definitely red.

- [ ] **Step 5: Commit the red tests**

```bash
git add tests/validation/select/modulo-operator.test.ts tests/validation/select/index.ts
git commit -m "test(validation): red tests for the spaceless % (modulo) gap"
```

---

### Task 2: Failing/pin tests — typing side

**Files:**
- Create: `tests/query-result/select/modulo-operator.test.ts`

- [ ] **Step 1: Check the query-result index convention**

Run: `tail -5 tests/query-result/select/index.ts`
If it re-exports per-file markers (like the validation index), plan to add the matching export line in Step 3; if it doesn't exist or doesn't re-export, skip Step 3.

- [ ] **Step 2: Write the typing test file**

Create `tests/query-result/select/modulo-operator.test.ts`:

```ts
/**
 * Modulo (%) operator TYPING pins — spaceless and join-nullability.
 *
 * The typing path (SplitTopLevelOp) splits on the bare `%` character and
 * does not require spaces, so these are expected to pass BEFORE the
 * validation fix lands — they pin that property so the validation-side
 * changes (HasSpecial / tokenizer) cannot regress it.
 *
 * If this file compiles without errors, all tests pass.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema, WideSchema } from "../../fixtures/parser-schemas.js";

// spaceless modulo types number (both operands number)
type R1 = QueryResult<"SELECT quantity%2 AS parity FROM products", DeepSchema>;
type _R1 = RequireTrue<AssertEqual<R1, { parity: number }>>;

// spaced modulo — existing behavior, symmetry pin
type R2 = QueryResult<"SELECT quantity % 2 AS parity FROM products", DeepSchema>;
type _R2 = RequireTrue<AssertEqual<R2, { parity: number }>>;

// modulo on the nullable side of a LEFT JOIN -> number | null
type R3 = QueryResult<
    "SELECT o.total % 2 AS parity FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _R3 = RequireTrue<AssertEqual<R3, { parity: number | null }>>;

// spaceless variant under the LEFT JOIN -> number | null
type R4 = QueryResult<
    "SELECT o.total%2 AS parity FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _R4 = RequireTrue<AssertEqual<R4, { parity: number | null }>>;

export type ModuloOperatorTypingTestsPass = true;
```

- [ ] **Step 3: Register in the index (only if the convention exists per Step 1)**

Add to `tests/query-result/select/index.ts`:

```ts
export type { ModuloOperatorTypingTestsPass } from "./modulo-operator.test.js";
```

- [ ] **Step 4: Run the full typecheck**

Run: `npm run typecheck`
Expected: the SAME failure set as Task 1 Step 4 — the new typing file should be fully green already (typing path needs no fix). If `_R1`–`_R4` fail, that is a FINDING (the typing path does not handle the case after all): record which, and treat it as in-scope — the arithmetic dispatcher gate in `src/expressions.ts` (~line 181) and `ArithRefJoinNullable` adjacency (~line 232) already list `%`, so a failure here means an operand-resolution detail to fix in Task 3/4, not a new design.

- [ ] **Step 5: Commit**

```bash
git add tests/query-result/select/modulo-operator.test.ts tests/query-result/select/index.ts
git commit -m "test(types): typing pins for % modulo (spaceless + join nullability)"
```

---

### Task 3: `HasSpecial` + `%`

**Files:**
- Modify: `src/parsing/string-utils.ts:64-78`

- [ ] **Step 1: Add the `%` arm to `HasSpecial`**

In `src/parsing/string-utils.ts`, the current definition:

```ts
export type HasSpecial<S extends string> =
    S extends `${string} ${string}` ? true :
    S extends `${string}(${string}` ? true :
    S extends `${string})${string}` ? true :
    S extends `${string}+${string}` ? true :
    S extends `${string}-${string}` ? true :
    S extends `${string}*${string}` ? true :
    S extends `${string}/${string}` ? true :
    S extends `${string}=${string}` ? true :
    S extends `${string}<${string}` ? true :
    S extends `${string}>${string}` ? true :
    S extends `${string},${string}` ? true :
    S extends `${string}::${string}` ? true :
    S extends `${string}||${string}` ? true :
    false;
```

Add one arm after the `/` line (keep operator arms together):

```ts
    S extends `${string}/${string}` ? true :
    S extends `${string}%${string}` ? true :
    S extends `${string}=${string}` ? true :
```

- [ ] **Step 2: Run the full typecheck — expect a PARTIAL green flip plus one transient red**

Run: `npm run typecheck`
Expected changes vs Task 2's run, all still confined to `tests/validation/select/modulo-operator.test.ts`:
- `_M1`, `_M3`, `_M4`, `_M8` flip GREEN (the `id%2` token is now classified as an expression and skipped by the ref-scan — lenient accept; `_M9`'s flip depends on its dispatch path, either state is fine at this checkpoint).
- `_M6` flips RED **transiently**: `id%bogus_col` is now skipped too (lenient `true`), and the test asserts `false`. This is expected and is fixed by Task 4's padding (the token gets split and `bogus_col` validated). Do NOT weaken the test.
- `_M5`, `_P1`, `_P3` stay RED (need the tokenizer).
- Pre-existing files: ZERO new failures. `HasSpecial` is consumed by ~8 sites (`RefHasSpecial`, `IsSimpleRefPart`, `IsUnqualifiedColumnCandidate`, alias checks in `parsing/split.ts:360,404`, `parsing/extract.ts:308`, `columns.ts:73,145,417`); a failure in any pre-existing test means one of those sites depended on `%`-bearing tokens being treated as identifiers — STOP and investigate that site specifically.

- [ ] **Step 3: Commit**

```bash
git add src/parsing/string-utils.ts
git commit -m "feat(types): % is a special char — %-bearing tokens are expressions, not identifiers"
```

---

### Task 4: Tokenizer — `OperatorToken`, `DQuotedPunct`, quote-aware `MaybePadModulo`

**Files:**
- Modify: `src/parsing/tokenize.ts:162-163` (LooseScanView), `:170-171` (DQuotedPunct), `:290-297` (OperatorToken), near `:299` (new types)

- [ ] **Step 1: Add `%` to `OperatorToken`**

Current (`src/parsing/tokenize.ts:290`):

```ts
export type OperatorToken =
    | "(" | ")" | "," | "=" | "<" | ">" | "+" | "-" | "*" | "/" | "|" | "&" | "!" | "?"
```

Change the first row to:

```ts
export type OperatorToken =
    | "(" | ")" | "," | "=" | "<" | ">" | "+" | "-" | "*" | "/" | "%" | "|" | "&" | "!" | "?"
```

(`CleanLooseToken` preserves `OperatorToken` members verbatim, and `CanPrecedeColumn` blesses every operator except `)` — so the padded `%` token now exposes its RHS to column validation.)

- [ ] **Step 2: Add `%` to `DQuotedPunct`**

Current (`src/parsing/tokenize.ts:170`):

```ts
export type DQuotedPunct =
    "(" | ")" | "," | "=" | "<" | ">" | "+" | "-" | "*" | "/" | "|" | "&" | "!" | "?";
```

Change to:

```ts
export type DQuotedPunct =
    "(" | ")" | "," | "=" | "<" | ">" | "+" | "-" | "*" | "/" | "%" | "|" | "&" | "!" | "?";
```

- [ ] **Step 3: Add `MaybePadModulo` + `PadModuloQuoteAware`**

In `src/parsing/tokenize.ts`, directly above `PadOperators` (~line 310), add:

```ts
// `%` is the modulo operator, but it is also the single most common character
// inside LIKE/ILIKE pattern literals (`'%smith%'`). The plain `PadOperator`
// chain pads EVERYWHERE — acceptable for the operators above because the
// validation path blanks string literals first on small queries — but
// `LooseScanView` also runs on NON-neutralized inputs (multi-line /
// over-budget queries skip `ValidationScanView`), where padding inside a
// literal would leak its words as blessed column candidates
// (`'%smith%'` -> `' % smith % '` -> `smith` validated -> false reject).
// So `%` gets its own quote-aware pad: literal interiors are copied
// verbatim, `%` is padded only between them. `%`-free strings (the
// overwhelming majority) short-circuit on a single pattern match.
export type MaybePadModulo<S extends string> =
    S extends `${string}%${string}`
        ? S extends `${string}'${string}`
            ? PadModuloQuoteAware<S>
            : PadOperator<S, "%">
        : S;

// Pairwise span-jump (same shape as `BlankSingleQuotedLiterals`): hop to the
// leftmost `'`, pad the run BEFORE it, copy the `'…'` span verbatim, recurse
// on the tail. The `''` SQL escape pairs leftmost exactly like the blanking
// walk. An UNTERMINATED opener copies the tail verbatim (lenient: no padding
// inside what is textually a string literal). Depth is the NUMBER OF
// LITERALS, not string length; the step cap is a runaway backstop only — on
// cap the remainder passes through UNPADDED (pre-round behavior, so a cap
// hit can never cause a new rejection).
type PadModuloQuoteAware<
    S extends string,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? S
    : Steps["length"] extends 300
        ? `${Acc}${S}`
        : S extends `${infer Pre}'${infer Rest}`
            ? Rest extends `${infer Lit}'${infer After}`
                ? PadModuloQuoteAware<After, `${Acc}${PadOperator<Pre, "%">}'${Lit}'`, [any, ...Steps]>
                : `${Acc}${PadOperator<Pre, "%">}'${Rest}`
            : `${Acc}${PadOperator<S, "%">}`;
```

- [ ] **Step 4: Wire `MaybePadModulo` into `LooseScanView`**

Current (`src/parsing/tokenize.ts:162-163`):

```ts
export type LooseScanView<N extends string> =
    CollapseSpaces<RestoreWildcards<PadOperators<ProtectWildcards<MaybeMarkDQuotedSpaces<MaybeStripDQuotedPunct<N>>>>>>;
```

Change to (MaybePadModulo runs AFTER the double-quote handling — `%` inside
double-quoted identifiers is already stripped — and BEFORE the plain pad
chain, whose operators are quote-blind by design):

```ts
export type LooseScanView<N extends string> =
    CollapseSpaces<RestoreWildcards<PadOperators<ProtectWildcards<MaybePadModulo<MaybeMarkDQuotedSpaces<MaybeStripDQuotedPunct<N>>>>>>>;
```

- [ ] **Step 5: Run the full typecheck — expect ALL modulo tests green**

Run: `npm run typecheck`
Expected: exit 0. Specifically: `_M1`–`_M12`, `_P1`–`_P4`, `_R1`–`_R4` all green, zero failures anywhere else. Known risk spots if not clean:
- `_M5`/`_M6` still true → the `%` token is not reaching the scan as an operator: re-check Step 1 (CleanLooseToken preserves it) and that padding actually splits the token (`_P1`/`_P3` pin this).
- A pre-existing file fails → most likely a query with `%` in a literal on a non-neutralized path (check the corpus files under `tests/integration/`); verify `_P1`-style behavior on the failing query's WHERE fragment by adding a TEMPORARY LooseScanView probe IN THE FAILING TEST FILE (never standalone), fix, remove probe.
- TS2589 anywhere → the new walk compounds depth on some path; the fix is NOT a bigger cap — re-check that `MaybePadModulo`'s gate short-circuits `%`-free inputs and that `PadModuloQuoteAware` is span-jump (per-literal), not per-char.

- [ ] **Step 6: Commit**

```bash
git add src/parsing/tokenize.ts
git commit -m "feat(types): tokenize % as an operator with quote-aware padding (closes the spaceless modulo gap)"
```

---

### Task 5: Full verification

- [ ] **Step 1: Typecheck three times**

Run: `npm run typecheck && npm run typecheck && npm run typecheck`
Expected: exit 0 all three times (depth-noise rule — a flaky pass is not a pass).

- [ ] **Step 2: Run the runtime suite**

Run: `bun test 2>&1 | tail -5`
Expected: all pass / 0 fail (442+ tests; the two new type-only files add no runtime tests but must not break collection).

- [ ] **Step 3: Verify the false-accept symmetry claim end-to-end**

Confirm in the Task 4 typecheck output (or by re-reading the green test file) that `_M5` (`id % bogus_col` → `false`) holds — this is the one behavior that TIGHTENS validation. Then grep the corpus for spaced `%` usage that might now be validated more strictly:

Run: `grep -rn " % " tests/integration/ --include="*.ts" | grep -iv "like\|'" | head -20`
Expected: any hits are valid modulo expressions over real columns (which still pass). If a corpus query got rejected, the operand resolution is the bug (lenient contract: an unresolvable operand must SKIP, never reject) — fix before committing anything further.

- [ ] **Step 4: Commit (only if anything changed in steps 1–3)**

No-op if Tasks 1–4 left everything green.

---

### Task 6: Documentation

**Files:**
- Modify: `CONTRIBUTING.md` (gotchas table + arithmetic contract bullet)

- [ ] **Step 1: Remove the stale gotcha row**

In `CONTRIBUTING.md`, delete this row from the "Reviewer / contributor gotchas" table:

```markdown
| Spaceless `quantity%2` is rejected while `quantity % 2` types `number` | **Known pre-existing gap.** `%` is not in `HasSpecial`, so `quantity%2` parses as a single (invalid) identifier. Adding it has collateral in alias/ref-part checks. |
```

- [ ] **Step 2: Document the quote-aware padding contract**

In `CONTRIBUTING.md`, in the "Shallow & lenient parsing" section, add a bullet at the end of the existing list:

```markdown
- `%` (modulo) is padded **quote-aware** (`MaybePadModulo` in
  `src/parsing/tokenize.ts`), unlike the other operators in `PadOperators`:
  `LooseScanView` also runs on non-neutralized inputs (multi-line /
  over-budget queries skip literal-blanking), and plain padding would split
  `LIKE '%smith%'` into tokens whose interior words get validated as columns
  — a false reject. Don't "simplify" `%` into the plain `PadOperator` chain.
```

- [ ] **Step 3: Run the full typecheck once more (docs don't affect it, but commit clean)**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs(contributing): % modulo gap closed; document quote-aware % padding contract"
```

---

## Done criteria

- `npm run typecheck` exit 0 ×3 consecutively.
- `bun test` all pass / 0 fail.
- New tests green: spaceless `%` validates (SELECT/WHERE/GROUP BY), `a % bogus_col` rejects (spaced AND spaceless), `LIKE '%…%'` pins hold on neutralized + non-neutralized + report-scale paths, `"mod%2"` quoted alias survives, `LooseScanView` unit pins hold, modulo join-nullability pins hold.
- CONTRIBUTING.md gotcha row removed.
