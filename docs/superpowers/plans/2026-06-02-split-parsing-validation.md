# Split parsing.ts and validation.ts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the two 1500-line type-level files (`src/parsing.ts`, `src/validation.ts`) into cohesive ~300-line sub-modules behind a same-path barrel, with zero behavioral change.

**Architecture:** Each giant becomes a thin barrel (`export * from "./<dir>/*.js"`) at its existing path; real declarations move into a sibling folder. Because all importers use explicit `./parsing.js` / `./validation.js` specifiers, no other file changes. The full strict `tsc --noEmit` + `bun test` suite is the regression oracle, run after each giant.

**Tech Stack:** TypeScript 6 (type-level only), Bun test runner, ESM with `.js` import specifiers.

**Spec:** `docs/superpowers/specs/2026-06-02-split-parsing-validation-design.md`

---

## Conventions for every move

- **Move declarations verbatim**, including each declaration's **leading JSDoc/`//` comment block** — those comments encode hard-won TS2589 rationale and must travel with their type.
- Sub-modules use **`export type` on every moved declaration** (a previously file-private `type X` becomes `export type X` so siblings can import it). This only widens the barrel's *internal* surface; `index.ts`'s public exports are unaffected.
- **Cross-module references → type-only imports.** After moving, `tsc` reports `Cannot find name 'X'` for each reference whose definition now lives in a sibling. Add `import type { X } from "./<sibling>.js";` for each. This is deterministic — let the error list drive the imports. Type-only import cycles are acceptable (the spec allows them; types are erased).
- **Never run a bare `tsc somefile.ts` probe** — it drops `strictNullChecks` and lies. Only the project script counts.

---

## Task 0: Capture the baseline oracle

**Files:** none (read-only)

- [ ] **Step 1: Confirm clean working tree on the refactor branch**

Run: `git status --short && git branch --show-current`
Expected: no output from status; branch is `refactor/split-parsing-validation`.

- [ ] **Step 2: Capture baseline tsc (must be the project script, 8GB heap)**

Run: `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit; echo "EXIT=$?"`
Expected: `EXIT=0` with no `error TS....` lines. **Record this.**

- [ ] **Step 3: Capture baseline bun test counts**

Run: `bun test 2>&1 | tail -5`
Expected: a summary like `NNN pass`, `0 fail`. **Record the exact pass count** — this is the target both splits must reproduce.

- [ ] **Step 4: Record the parsing.ts type inventory (drop-nothing oracle)**

Run: `grep -cE '^(export )?type [A-Za-z0-9_]+' src/parsing.ts`
Expected: `124`. After the split, the same count must be defined exactly once across `src/parsing/*.ts`.

---

## Task 1: Split `src/parsing.ts` → `src/parsing/` (6 files)

**Files:**
- Create: `src/parsing/string-utils.ts`, `src/parsing/pg-literals.ts`, `src/parsing/normalize.ts`, `src/parsing/split.ts`, `src/parsing/extract.ts`, `src/parsing/tokenize.ts`
- Modify (reduce to barrel): `src/parsing.ts`

`parsing.ts` currently has **no external imports** — every dependency is intra-file. So sub-modules import only from each other.

### Name → file assignment (every one of the 124 types, by current line range)

- [ ] **Step 1: Create `src/parsing/string-utils.ts`** — move lines **478–657**:
  `ReplaceAll, ReplaceAllImpl, CollapseSpaces, TrimLeft, TrimRight, Trim, Whitespace, CleanIdent, CleanExpr, IsIdentifier, IsRuntimeStringFragment, HasSpecial, IsParamPlaceholder, IsQualifiedRefCandidate, IsSqlConstant, SqlConstantType, Unquote, TrimPunctuation, Punct, Split, SplitLast, SplitOnDot, SplitOnDotClean, MapClean, MapCleanLoose, CleanLooseToken, FilterEmpty`
  (Intended leaf. If `tsc` later shows `IsSqlConstant`/`SqlConstantType` reference `SqlConstant` from `tokenize.ts`, add that one type-only import — a cycle is fine.)

- [ ] **Step 2: Create `src/parsing/pg-literals.ts`** — move lines **31–311**:
  `NeutralizePgLiterals, NeedsPgNeutralize, HasPairedDollar, HasEStringOpener, NeutralizePgDrive, DollarTagLower, DollarTagStart, DollarTagChar, IsValidDollarTag, AllDollarTagChars, NeutralizePgWorker, RewriteExtractCall, RewriteExtractWalk, RewriteExtractWalkQuoteAware, RewriteExtractRewriteOne, OddSingleQuotes, StripComments, StripCommentsWalk, LineCommentTail`

- [ ] **Step 3: Create `src/parsing/normalize.ts`** — move line **15–30** (`NormalizeQuery`) **and** lines **313–476**:
  `NormalizeQuery, LowercaseOutsideQuotes, LowercaseOutsideQuotesDrive, LowercaseOutsideQuotesWorker, LowercaseOutsideQuotesKeepParams, LcKeepDrive, ParamNameStop, ReadParamIdent, LcKeepWorker, NormalizeQueryKeepParams, ReplaceWhitespace, ExceedsLengthBudget, Drop10Chars, HasLineBreaks, ReplaceWhitespaceLimited, RemoveTrailingSemicolon`
  (`NormalizeQuery` imports from `pg-literals.ts` (`NeutralizePgLiterals`, `StripComments`) and `string-utils.ts` (`Trim`, `ReplaceAll`, etc.) — add type-only imports as tsc directs.)

- [ ] **Step 4: Create `src/parsing/split.ts`** — move lines **658–931**:
  `SplitTopLevelWorker, SplitTopLevel, SplitTopLevelDrive, ExtractBeforeFromTopLevel, SplitCommaSimple, ExtractBefore, StripDistinct, IsImplicitQuotedAlias, BareImplicitAliasParts, IsBareImplicitAlias, IsSimpleAliasToken, IsImplicitAliasExpr, IsSimpleFuncName, IsQuotedIdentifier, ExtractAlias, AliasResultKey, ExtractAliasResult`

- [ ] **Step 5: Create `src/parsing/extract.ts`** — move lines **933–1189**:
  `ExtractSelectList, ExtractReturningList, FirstTopLevelReturningTail, SplitBalancedParenWorker, SplitBalancedParen, SplitBalancedParenDrive, StripSubqueries, ExtractCallParenBodies, ExtractLastWhere, LastWhereTail, ExtractFromClause, SplitSelectList, ExtractInsertColumns, ExtractConflictColumns, ExtractUpdateSetColumns, ExtractConflictUpdateSetColumns, ExtractConflictUpdateExcludedCols, MapExcludedRHS, SplitAssignments, ExtractRowAssignTargets, MapLeftSide`

- [ ] **Step 6: Create `src/parsing/tokenize.ts`** — move lines **1190–1503**:
  `Tokenize, CommaSep, MarkTopLevelCommas, TokenizeTables, TokenizeLoose, DropDistinctFrom, DQuotedPunct, MaybeStripDQuotedPunct, StripDQuotedPunct, DQuoteSpaceSentinel, MaybeMarkDQuotedSpaces, MarkDQuotedSpaces, RestoreDQuotedSpaces, ValidationScanView, BlankSingleQuotedLiterals, OperatorToken, PadOperator, ProtectWildcards, RestoreWildcards, PadOperators, SqlKeyword, SqlReserved, SqlConstant, CanPrecedeColumn`

- [ ] **Step 7: Replace `src/parsing.ts` with the barrel**

```ts
// Barrel for the type-level SQL parser. Real declarations live in ./parsing/*.
// Importers keep using `from "./parsing.js"`; this file freezes that path.
export * from "./parsing/string-utils.js";
export * from "./parsing/pg-literals.js";
export * from "./parsing/normalize.js";
export * from "./parsing/split.js";
export * from "./parsing/extract.js";
export * from "./parsing/tokenize.js";
```

- [ ] **Step 8: Drop-nothing / no-duplicate check**

Run: `grep -hcE '^export type [A-Za-z0-9_]+' src/parsing/*.ts | paste -sd+ - | bc`
Expected: `124` (matches Task 0 Step 4). Then confirm no name is defined twice:
Run: `grep -hoE '^export type [A-Za-z0-9_]+' src/parsing/*.ts | awk '{print $3}' | sort | uniq -d`
Expected: empty output.

- [ ] **Step 9: Typecheck, add imports until green**

Run: `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -E "error TS" | head -40; echo "done"`
Expected after fixes: no `error TS` lines. For each `Cannot find name 'X'`, add `import type { X } from "./<file-where-X-now-lives>.js";` to the top of the reporting file. Repeat until clean. There must be **no new `TS2589`**.

- [ ] **Step 10: Full strict typecheck ×3 (stability)**

Run: `for i in 1 2 3; do node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit; echo "RUN$i EXIT=$?"; done`
Expected: `RUN1 EXIT=0`, `RUN2 EXIT=0`, `RUN3 EXIT=0`.

- [ ] **Step 11: Run bun test, match baseline**

Run: `bun test 2>&1 | tail -5`
Expected: pass count **equals the Task 0 baseline**, `0 fail`.

- [ ] **Step 12: Commit (only if Steps 10 & 11 are green)**

```bash
git add src/parsing.ts src/parsing/
git commit -m "refactor(parsing): split parsing.ts into parsing/ sub-modules behind a barrel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

If Step 10 or 11 is red and the cause is not a trivial missing `import type`, **revert**: `git checkout -- src/parsing.ts && git clean -fd src/parsing/`, then report.

---

## Task 2: Split `src/validation.ts` → `src/validation/` (6 files)

**Files:**
- Create: `src/validation/dispatch.ts`, `src/validation/joins.ts`, `src/validation/return-types.ts`, `src/validation/return-derived.ts`, `src/validation/cte.ts`, `src/validation/validate-columns.ts`
- Modify (reduce to barrel): `src/validation.ts`

`validation.ts` imports externally from `./schema.js`, `./columns.js`, `./expressions.js`, `./parsing.js`, `./tables.js`, `./utils.js`. Each sub-module imports only the external symbols it actually references (tsc will report unused/missing). Sub-modules also import from each other as needed (cycles OK).

### Name → file assignment (by current line range)

- [ ] **Step 1: Create `src/validation/joins.ts`** — move lines **292–451**:
  `JoinUsingColsValid, JoinUsingRightSideValid, JoinSrcFirstWord, UsingColsOnRightTable, UsingColsInTwoTables, UsingColOnBothSides, WindowFilterColsValid, DistinctOnColsValid`

- [ ] **Step 2: Create `src/validation/return-derived.ts`** — move lines **565–738**:
  `DerivedTableMatch, DerivedAliasName, DerivedFirstWord, DerivedSubRow, DerivedTableReturn, BuildDerivedReturn, DerivedExprToObject, DerivedColKey, DerivedProjType, DerivedColType, StripLeadingLateral, JoinedDerivedBody, JoinedDerivedNullable, JoinModNullable, StripTrailingOuter, JoinedDerivedReturn, BuildJoinedDerivedReturn`

- [ ] **Step 3: Create `src/validation/cte.ts`** — move lines **740–926**:
  `StripRecursiveKw, SingleCteMatch, CteName, CteNames, CollectCteNames, CteOuterQuery, CollectCteOuter, CteOuterFromName, MultiCteReturn, CteTableKeys, NonCteTables, WithDmlOuter, CteCols, FilterCteCols, CteReturn, CteRow, RenameRow, CteBodyColKey, CteBodyColType`

- [ ] **Step 4: Create `src/validation/return-types.ts`** — move lines **480–564** **and** lines **1369–1503**:
  `GetReturnTypeNormalized, OuterSelectReturn, WithJoinedDerived, WithDmlReturn` (480–564) + `SelectReturn, SelectReturnWith, BuildSelectReturn, MergeExprs, ColObjects, PairMerge, MergeAll, MergeRow, SelectAliasesInQuery, SelectAliasSet, NeedsSelectAliasResolution, RefScanSegment, RefScanBeforeOrderBy, RefScanOrderBy, SelectAliases, ColumnsExistInTable` (1369–1503)

- [ ] **Step 5: Create `src/validation/validate-columns.ts`** — move lines **941–1060** **and** lines **1104–1368**:
  `ValidateCteShape, ValidateDerivedShape, OuterProjectionInRow, OuterProjInRow, ProjRefInRow, KeyInRow, SegRefsInRow, OuterWhereRefsInRow` (941–1060) + `AllTablesValid, AllTablesValidFor, AllColumnsValid, AllColumnsValidFor, SelectUnqualifiedRefsScoped, ColumnsValidInSelectOrReturning, ColumnsValidInSelectOrReturningFor, ColumnsValidInInsert, ColumnsValidInUpdate, QualifiedColumnRefsValid, QualifiedColumnRefsValidFor, AliasedTableKeys, QualifierShadowedByAlias, NoAliasShadowedQualifiers, OuterScopeUnqualifiedValid, UnqualifiedColumnRefsValid, UnqualifiedColumnRefsValidFor` (1104–1368)

- [ ] **Step 6: Create `src/validation/dispatch.ts`** — move lines **62–258**, **452–479**, and **1061–1103**:
  `ValidateSQLNormalized, ShouldNeutralizeForScan, NotReportScale, ValidateSQLNormalizedDispatch, ValidateHighComplexityUpdate, WhereHasSubquery, UpdateAliasEntry, WhereColsValidForUpdate, ValidateSQLNormalizedLightSelect, ReportScaleSelectTables, ReportScaleTablesToValidate, ReportScaleLocalRelationNames, ReportScaleDerivedNames, ReportScalePseudoSource, LightSelectTablesAndList, ValidateSQLNormalizedCore` (62–258) + `IsHighComplexityUpdate, IsHighComplexitySelect` (452–479) + `QueryKind, HasReturning, HasReturningQuoteAware` (1061–1103)
  (This file carries the public `ValidateSQLNormalized`, `QueryKind`, plus `GetReturnTypeNormalized` lives in return-types — all three are re-exported by the barrel and consumed by `index.ts`.)

- [ ] **Step 7: Replace `src/validation.ts` with the barrel**

```ts
// Barrel for type-level SQL validation + result inference. Real declarations
// live in ./validation/*. Importers keep using `from "./validation.js"`.
export * from "./validation/dispatch.js";
export * from "./validation/joins.js";
export * from "./validation/return-types.js";
export * from "./validation/return-derived.js";
export * from "./validation/cte.js";
export * from "./validation/validate-columns.js";
```

- [ ] **Step 8: Drop-nothing / no-duplicate check**

Run: `grep -hoE '^export type [A-Za-z0-9_]+' src/validation/*.ts | awk '{print $3}' | sort | uniq -d`
Expected: empty (no duplicates). And:
Run: `grep -hcE '^export type [A-Za-z0-9_]+' src/validation/*.ts | paste -sd+ - | bc`
Expected: `109` (the validation.ts type count from Task 2 inventory).

- [ ] **Step 9: Typecheck, add imports until green**

Run: `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -E "error TS" | head -40; echo "done"`
Expected after fixes: no `error TS`. For each `Cannot find name 'X'`, add the type-only import from the sibling sub-module or the correct external module (`./schema.js`, `./columns.js`, `./expressions.js`, `./parsing.js`, `./tables.js`, `./utils.js`). No new `TS2589`.

- [ ] **Step 10: Full strict typecheck ×3**

Run: `for i in 1 2 3; do node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit; echo "RUN$i EXIT=$?"; done`
Expected: all three `EXIT=0`.

- [ ] **Step 11: Run bun test, match baseline**

Run: `bun test 2>&1 | tail -5`
Expected: pass count equals Task 0 baseline, `0 fail`.

- [ ] **Step 12: Commit (only if green)**

```bash
git add src/validation.ts src/validation/
git commit -m "refactor(validation): split validation.ts into validation/ sub-modules behind a barrel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

If red beyond trivial imports: `git checkout -- src/validation.ts && git clean -fd src/validation/`, then report.

---

## Task 3: Final verification

**Files:** none

- [ ] **Step 1: Confirm only the intended files changed**

Run: `git diff --stat main...HEAD -- src/ | grep -vE 'src/(parsing|validation)(\.ts|/)' ; echo "---only-barrels-and-folders-above-should-be-empty---"`
Expected: no `src/...` lines other than the two barrels and the two new folders.

- [ ] **Step 2: Confirm public surface unchanged**

Run: `git diff main...HEAD -- src/index.ts`
Expected: empty (index.ts untouched).

- [ ] **Step 3: Final full suite (the project's own test script)**

Run: `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit && bun test 2>&1 | tail -5; echo "EXIT=$?"`
Expected: `EXIT=0`, pass count matches baseline.

- [ ] **Step 4: Report file sizes**

Run: `wc -l src/parsing.ts src/parsing/*.ts src/validation.ts src/validation/*.ts`
Expected: each sub-module ≲ ~320 lines; the two barrels ~7 lines each.

---

## Self-review notes

- **Spec coverage:** barrel mechanism (Task 1/2 Step 7), frozen public surface (Task 3 Step 2), incremental-per-giant verification (Steps 10–11 each task), revert-on-red (Step 12 each task), drop-nothing oracle (Step 8 each task), baseline (Task 0). All spec sections covered.
- **No placeholders:** every move step lists exact type names and line ranges; barrels show full content.
- **Type consistency:** `index.ts` consumes `NormalizeQuery` (→ normalize.ts), `ValidateSQLNormalized`/`QueryKind` (→ dispatch.ts), `GetReturnTypeNormalized` (→ return-types.ts), `InsertTargetTable`/etc (→ tables.ts, untouched) — all re-exported by the barrels via `export *`, so named imports in `index.ts` keep resolving.
