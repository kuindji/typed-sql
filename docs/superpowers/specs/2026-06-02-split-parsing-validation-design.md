# Split `parsing.ts` and `validation.ts` into smaller modules

**Date:** 2026-06-02
**Branch:** `refactor/split-parsing-validation`
**Status:** Approved design

## Problem

`src/parsing.ts` (1505 lines) and `src/validation.ts` (1504 lines) are the two
largest files in the repo. Their size makes them hard for both humans and coding
agents to hold in context and edit reliably. We want to split each into a handful
of cohesive ~300-line modules — **without changing any behavior**.

## Constraints unique to this codebase

These are type-level files operating near TypeScript's instantiation/recursion
budget. The project's history shows `ValidateSQL` results are **depth-sensitive**
(observable booleans have flipped merely from adding an unrelated probe file).
Therefore:

- A pure type-alias move is behavior-preserving *in theory*, but this codebase is
  empirically twitchy near the `TS2589` cliff, so **every step must be proven
  green against the full strict suite** — never a one-off `tsc file.ts` probe
  (that silently drops `strictNullChecks`).
- The public API surface (`src/index.ts` exports) must stay **byte-for-byte
  identical**.

## Approach: barrel file at the same path

Each giant becomes a **thin barrel** at its existing path, re-exporting from a new
sibling folder of sub-modules:

```ts
// src/parsing.ts  (after split)
export * from "./parsing/string-utils.js";
export * from "./parsing/pg-literals.js";
export * from "./parsing/normalize.js";
export * from "./parsing/split.js";
export * from "./parsing/extract.js";
export * from "./parsing/tokenize.js";
```

Every importer uses an explicit `from "./parsing.js"` / `from "./validation.js"`
specifier (ESM, `.js`-suffixed). Because the barrel keeps that path, **no other
file in the repo changes**: `index.ts`, `columns.ts`, `tables.ts`,
`expressions.ts`, `partial.ts`, and `builder/*` keep their imports verbatim.

### Mechanical rules

- A file-private `type X` (currently un-exported) that now must cross a sub-module
  boundary gets an `export`. This leaks only into the barrel's *internal* surface,
  never into `index.ts`'s public exports — harmless.
- `export *` from the barrel re-exports those internal types too. That is fine:
  the package's public API is defined solely by `index.ts`, which uses **named**
  imports from `parsing.ts` / `validation.ts`.
- Type-only import cycles between sub-modules are acceptable (types are erased in
  ESM). Grouping will not be contorted to avoid them, though a natural DAG is
  preferred.
- Watch for name collisions under `export *`. Within a single original file all
  names were unique, so splitting preserves uniqueness; verify nonetheless.

## Module maps

### `src/parsing/` (~6 files)

| File | Contents | ~lines |
|---|---|---|
| `string-utils.ts` | Trim/Clean/Split primitives, predicates (`IsIdentifier`, `HasSpecial`, `IsSqlConstant`, `SqlConstantType`), `ReplaceAll`, `SplitOnDot*`, `MapClean*`, `FilterEmpty` | ~200 |
| `pg-literals.ts` | dollar-quote/E-string neutralization (`NeutralizePgLiterals` + workers), `EXTRACT` rewrite (`RewriteExtract*`), `OddSingleQuotes`, `StripComments` | ~230 |
| `normalize.ts` | `NormalizeQuery` pipeline, `ReplaceWhitespace*`, length budget, `CollapseSpaces`, `LowercaseOutsideQuotes*` (incl. KeepParams) | ~250 |
| `split.ts` | `SplitTopLevel*`, `ExtractBefore*`, `StripDistinct`, alias extraction (`ExtractAlias`, `IsImplicit*Alias`, `IsSimpleFuncName`, `IsQuotedIdentifier`) | ~270 |
| `extract.ts` | clause/list extraction (`ExtractSelectList`, `ExtractReturningList`, `FirstTopLevelReturningTail`, `Extract*Columns`, `SplitBalancedParen`, `StripSubqueries`, `ExtractCallParenBodies`, `ExtractLastWhere`, `SplitAssignments`, `ExtractRowAssignTargets`) | ~260 |
| `tokenize.ts` | `Tokenize*`, `MarkTopLevelCommas`/`CommaSep`, dquote-sentinel machinery, `ValidationScanView`, `BlankSingleQuotedLiterals`, operators (`PadOperators`, `OperatorToken`), `SqlKeyword`/`SqlReserved`/`SqlConstant`/`CanPrecedeColumn` | ~300 |

### `src/validation/` (~6 files)

| File | Contents | ~lines |
|---|---|---|
| `dispatch.ts` | `ValidateSQLNormalized`, `ValidateSQLNormalizedDispatch`/`Core`/`LightSelect`, high-complexity-update path (`ValidateHighComplexityUpdate`, `WhereColsValidForUpdate`, `UpdateAliasEntry`), `ReportScale*`, complexity predicates, `QueryKind`, `HasReturning*` | ~290 |
| `joins.ts` | `JoinUsing*`, `UsingCols*`, `WindowFilterColsValid`, `DistinctOnColsValid` | ~160 |
| `return-types.ts` | `GetReturnTypeNormalized`, `OuterSelectReturn`, `WithJoinedDerived`, `WithDmlReturn`, select-return building (`SelectReturn*`, `BuildSelectReturn`), `MergeExprs`/`MergeRow`/`ColObjects`/`MergeAll`, `SelectAliases*`, `RefScan*` | ~290 |
| `return-derived.ts` | derived-table return (`DerivedTableReturn`, `BuildDerivedReturn`, `DerivedExprToObject`, `DerivedCol*`) + JOIN-LATERAL/joined-derived return (`JoinedDerived*`, `JoinModNullable`, `StripLeadingLateral`) | ~250 |
| `cte.ts` | CTE name collection (`CteNames`, `CollectCteNames`, `CteOuter*`), `MultiCteReturn`, `CteReturn`, `CteRow`, `RenameRow`, `CteBodyCol*`, `CteTableKeys`, `NonCteTables`, `WithDmlOuter`, `StripRecursiveKw`, `SingleCteMatch` | ~190 |
| `validate-columns.ts` | table/column existence (`AllTablesValid*`, `AllColumnsValid*`, `ColumnsExistInTable`), qualified/unqualified-ref validation (`QualifiedColumnRefsValid*`, `UnqualifiedColumnRefsValid*`, `SelectUnqualifiedRefsScoped`, `OuterScopeUnqualifiedValid`), alias-shadow checks (`NoAliasShadowedQualifiers`, `QualifierShadowedByAlias`, `AliasedTableKeys`), CTE/derived shape checks (`ValidateCteShape`, `ValidateDerivedShape`, `OuterProjectionInRow`, `ProjRefInRow`, `SegRefsInRow`, `OuterWhereRefsInRow`, `KeyInRow`), `ColumnsValidIn*` | ~320 |

Exact line assignments are finalized during implementation; cohesive chunks may
shift between sibling files (a larger file is acceptable when it keeps a coherent
unit together). The barrel re-export list is the only contract.

## Process — incremental, verify-or-revert

1. **Baseline first.** Before any edit, capture the current `tsc --noEmit` exit
   code and the `bun test` pass/fail counts. This is the regression oracle.
2. **`parsing.ts` first, fully, before touching `validation.ts`.** Never have both
   splits in flight.
3. **Per-file verification = the real suite.** After each giant is split:
   `node --max-old-space-size=8192 tsc --noEmit` must **exit 0**, run **3×** per
   project convention for stability, then `bun test` must match the baseline pass
   count. No new `TS2589`.
4. **Acceptance = zero behavioral change.** Same tsc exit, same bun pass count.
5. **Revert-on-red.** If a split turns anything red and it is not a trivial
   missing-`export` fix, revert that step (each step is a clean git commit) and
   report — per the user's "if it doesn't work, we revert" instruction.
6. All work on `refactor/split-parsing-validation`, never `main`.

## Out of scope

- `expressions.ts` (634) and all other files — explicitly deferred (user chose
  "two giants only").
- Any behavioral change, new strictness, or API change.
- Reformatting / style changes beyond moving declarations.

## Acceptance criteria

- [ ] `parsing.ts` and `validation.ts` are thin barrels re-exporting from
      `parsing/` and `validation/` sub-modules, each sub-module ≲ ~320 lines.
- [ ] No file outside the two new folders + the two barrels changed (except the
      spec/plan docs).
- [ ] `index.ts` public export surface unchanged.
- [ ] `tsc --noEmit` exits 0 (×3) with no new `TS2589`.
- [ ] `bun test` pass count matches the captured baseline.
