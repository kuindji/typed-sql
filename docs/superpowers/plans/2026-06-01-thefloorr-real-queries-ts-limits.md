# TheFloorr Real Queries — TS-Limit & Engine-Bug Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is expected to span multiple sessions — update the checkboxes and the "Session log" section as you go.

**Goal:** Make `tests/integration/thefloorr/queries.test.ts` pass *deterministically* under `tsc --noEmit`. Two real-world reporting queries (`_V25`, `_V26`) currently fail. The work is to fix the engine bugs these queries exposed (per user decision: **fix the engine, not the tests**) and reduce TypeScript instantiation pressure so results stop depending on TS's internal budget (per user decision: **optimize the hot engine types**).

**Tech stack:** Pure TypeScript type-level programming. Tests are `Expect<Equal<...>>` assertions checked by `npm run typecheck` (`tsc --noEmit`). No runtime code.

**Verification discipline (per project memory):** after each phase run `npm run typecheck` and confirm exit 0. For the final phase run it **3×** to confirm determinism (the failure mode here is budget-dependent and order-sensitive, so a single green run is not proof). Track the `--extendedDiagnostics` "Instantiations" number to confirm the optimization is real.

---

## Diagnosis (verified 2026-06-01)

Baseline: `tsc --noEmit --extendedDiagnostics` → **10,122,283 instantiations / 1.72 GB / ~11s**. Only `tests/integration/thefloorr/queries.test.ts:450` (`_V26`) errors after the Phase-1 fix below. `tsc` does **not** emit `TS2589` (excessively deep) — every failure is a logical `false` or a budget-truncation artifact, not a hard recursion crash.

There are **four distinct root causes**, found by reducing each query and revealing intermediate types with deliberate `const x: "REVEAL" = null as unknown as <Type>` mismatches:

1. **Extract multi-call bug (drives `_V25`).** `RewriteExtractWalk` in `src/parsing.ts` rewrote only the **first** `extract(field FROM source)` in a query: it recurses into the matched prefix `Pre` (which contains no further `extract(` — TS infers the *shortest* prefix, i.e. up to the first occurrence) but emits the suffix `Rest` verbatim. `Q_ApprovedPseCycleStats` has 9 `extract(...)` calls, so 8 kept their inner `from avg(...)`; the table collector then parsed `from <fn-call>` as real FROM clauses, yielding garbage "tables" like `"avg(u.firstloggedin"`, which the report-scale validator rejected → `false`. **(FIXED — see Phase 1.)**

2. **Quoted-alias case lost past ~500 chars (drives part of `_R26`).** `LowercaseOutsideQuotes` (`src/parsing.ts`, ~line 154) bails at a 500-step cap with a blanket `` `${Acc}${Lowercase<S>}` ``. In a long query the tail is force-lowercased *including inside `"…"` identifiers*, so `"monthlySalesTarget"` → `monthlysalestarget` and `"targetCurrency"` → `targetcurrency` (these aliases sit past the 500-char point in `Q_TeamPseInfo`).

3. **No LEFT/RIGHT/FULL JOIN nullability (drives part of `_R26`).** Columns resolve to their declared schema type regardless of join kind. `grep` confirms there is essentially **no** join-nullability logic in `src/columns.ts`/`src/expressions.ts`/`src/validation.ts`. In `Q_TeamPseInfo`, `tr."name"` (LEFT JOIN `Team_Role`) and `tms."currency"` (LEFT JOIN `Team_Member_SalesTarget`) infer as `string`, but should be `string | null`.

4. **TS instantiation-budget non-determinism (drives `_V26`).** The file sits past TS's effective ceiling; TS's instantiation budget is **global per compilation**. `_V26`'s `ValidateSQL<Q_TeamPseInfo>` is *actually correct* — referenced directly at end of file it evaluates to `true` — but inside `_V26`'s `Equal<…>` it truncates to `false`. The hog is the adjacent `_R26`: its expensive `GetReturnType` + structural `Equal<>` **diff** exhausts the budget and truncates the neighbouring `_V26`. **Proof:** removing `_R26`, *or* making `_R26` a trivial match (expected type == actual computed type), makes the whole file green including `_V26`.

### Consequence for `_R26`

The test's expected `_R26` type does not match what the engine computes even in isolation. Current isolated `GetReturnType<Q_TeamPseInfo, Main>`:

```
{ pseId: string; pseName: string; pseGivenName: string | null; pseFamilyName: string | null;
  teamRoleId: string | null; teamRole: string; annualSalesTarget: unknown;
  monthlysalestarget: unknown;   // bug #2: should be monthlySalesTarget
  avatar: string | null;
  targetcurrency: string; }      // bug #2 + bug #3: should be targetCurrency: string | null
```

Test's expected `_R26`:

```
{ pseId: string; pseName: unknown; /* see note */ pseGivenName: string | null; pseFamilyName: string | null;
  avatar: string | null; teamRoleId: string | null; teamRole: string | null /* bug #3 */;
  annualSalesTarget: unknown; monthlySalesTarget: unknown; targetCurrency: string | null /* bug #3 */ }
```

**Note on `pseName`:** expr is `(pse."givenName" || ' ' || pse."familyName")::text`. The engine yields `string` (the `||`→`string` contract — see project memory "conservative typing contract"). The test's `unknown` is therefore **wrong**; the corrected expectation is `string`. (Confirm the `::text` cast path keeps it `string` during Phase 5.)

---

## Key code references

- `src/parsing.ts:3` — `NormalizeQuery<S>` pipeline: `RewriteExtractCall<Trim<RemoveTrailingSemicolon<CollapseSpaces<ReplaceWhitespace<LowercaseOutsideQuotes<StripComments<S>>>>>>>`.
- `src/parsing.ts` `RewriteExtractWalk` (~line 30) — **FIXED**; quote-aware twin `RewriteExtractWalkQuoteAware` + `RewriteExtractRewriteOne` (~lines 45–63) still have the `Rest`-not-recursed bug.
- `src/parsing.ts` `LowercaseOutsideQuotes` (~line 154) — 500-step cap → blanket lowercase bail (bug #2). Threads `InSingleQuote`/`InDoubleQuote` state already.
- `src/parsing.ts` `ExceedsLengthBudget` (~line 199, ~500 chars) and `HasLineBreaks` — routing predicates.
- `src/validation.ts:476` `GetReturnTypeNormalized` → `SelectReturnWith<ExtractSelectList<N>, Tables, Aliases, S>` (plus CTE/derived/RETURNING/WITH-DML branches). This is where join-nullability must be threaded (bug #3).
- `src/validation.ts` `ValidateSQLNormalizedLightSelect` (~line 192), `ReportScaleSelectTables`/`ReportScaleTablesToValidate` (~line 199), `IsHighComplexitySelect` (~line 457) — the user's existing report-scale light path (relevant to `_V25` routing).
- `src/columns.ts` — `ResolveTableKey` (~line 256, always falls back to `${defaultSchema}.${Name}`), `ResolveAlias`, `TableKeysByName`, `ColumnExists`. Column→type resolution lives here; nullability injection point.
- `src/tables.ts` — `TablesInQuery`, `AliasesInQuery`, FROM/JOIN collectors (need a *join-kind-aware* variant for bug #3).
- Test file: `tests/integration/thefloorr/queries.test.ts` — `_V25`/`Q_ApprovedPseCycleStats` (~line 414), `_V26`/`Q_TeamPseInfo` (~line 450), `_R26` (~line 451+).

---

## Phase 1 — Extract multi-rewrite (correctness)  ✅ partially done

- [x] **Step 1.1** `RewriteExtractWalk` recurses into `Rest` for both the `… from …` and the plain branch; step cap 12→24. (Applied to `src/parsing.ts`.) Result: `_V25` green, 0 repo regressions.
- [ ] **Step 1.2** Apply the same `Rest`-recursion fix to the quote-aware path `RewriteExtractRewriteOne` (and confirm `RewriteExtractWalkQuoteAware` recurses the tail). This is the path taken by short queries containing string literals; add/keep a regression test with **two** `extract()` calls in a query that also contains a `'…'` literal.
- [ ] **Step 1.3** `npm run typecheck` → exit 0, no new errors outside the known `_V26` line.

## Phase 2 — Quoted-alias case preservation past ~500 chars (correctness, bug #2)

- [ ] **Step 2.1** Fix `LowercaseOutsideQuotes` so the cap-bail never lowercases inside a quoted identifier. Preferred: raise the step cap to comfortably cover report-scale queries (~1500–2000; cost is linear, ~1 instantiation/char) **and/or** make the bail quote-state-aware (when `InDoubleQuote` is true at bail, append the remaining `S` verbatim rather than `Lowercase<S>`). Verify the keyword-normalization invariant still holds for the non-quoted tail.
- [ ] **Step 2.2** Probe `Q_TeamPseInfo` in isolation: `monthlySalesTarget` and `targetCurrency` keep their case in `GetReturnType`.
- [ ] **Step 2.3** `npm run typecheck` + `--extendedDiagnostics`: confirm exit 0 (modulo `_V26`) and that the Instantiations count did **not** balloon.

## Phase 3 — LEFT/RIGHT/FULL JOIN nullability (feature, bug #3)

- [ ] **Step 3.1** Add a join-kind-aware relation collector (extend `src/tables.ts` collectors or add a sibling) producing the set of *nullable relations*: LEFT JOIN → the right (joined) table/alias; RIGHT JOIN → all left-side tables/aliases; FULL JOIN → both sides. INNER/CROSS contribute nothing.
- [ ] **Step 3.2** Thread the nullable-relation set into the projection path (`SelectReturnWith` → column type resolution). A projected column owned by a nullable relation gets `| null`. `SELECT *`/`alias.*` expansions over a nullable relation get every column nullablized. Aggregates/expressions keep current behavior.
- [ ] **⚠️ Step 3.3 — BLAST RADIUS GATE.** ~9 test files use joins (`order-status-update`, `order-payment-select`, `thefloorr/queries`, `vigilocity/queries`, `query-result/select/analytics`, `validation/parts/join-part`, `validation/select/clauses`, `validation/select/analytics`, `validation/select/complex`). Run `npm run typecheck` and collect every newly-failing `_R*` assertion. **If the list is large or any expectation is contentious, STOP and surface the list before mass-editing.** Otherwise update each affected expected type to add `| null` for left/right/full-joined columns. (Note: many join tests only assert `ValidateSQL`, not `GetReturnType` — e.g. `_V9` in `order-payment-select.test.ts` — so the real radius is smaller than 9 files.)
- [ ] **Step 3.4** `npm run typecheck` → exit 0 across the whole repo.

## Phase 4 — Optimize hot types for budget headroom (determinism)

- [ ] **Step 4.1** `tsc --noEmit --generateTrace .trace` then inspect `.trace/trace.json` (or `--extendedDiagnostics`) to find the heaviest instantiations driving the 10.1M count. Likely suspects: the per-expression projection resolver, `SelectReturnWith`/`MergeRow`, the report-scale table scans, and the `Equal<>`/`Simplify` interplay.
- [ ] **Step 4.2** Apply targeted reductions (tail-recursion, fewer conditional branches, tighter-but-safe step caps, memoized intermediate `infer`s). Re-measure after each change; keep changes that lower Instantiations without regressing correctness.
- [ ] **Step 4.3** Target: `_V26` and `_R26` evaluate deterministically (independent of file order / neighbouring assertions). Sanity check by temporarily reordering or duplicating the two assertions and confirming stable results.

## Phase 5 — Correct `_R26` expected type & final verification

- [ ] **Step 5.1** Update `_R26` in `tests/integration/thefloorr/queries.test.ts` to the corrected engine output: `pseName: string`; proper-cased `monthlySalesTarget: unknown` and `targetCurrency: string | null`; `teamRole: string | null`. Keep the other fields. (These should now *match* the engine because Phases 2–3 fixed the case + nullability.)
- [ ] **Step 5.2** `npm run typecheck` **3×** → exit 0 every time (determinism proof).
- [ ] **Step 5.3** Full repo regression sweep: confirm no other test file errors. Record final Instantiations vs the 10.1M baseline.
- [ ] **Step 5.4** Update project memory (`typed-sql-adversarial-progress.md`) with the outcome, and remove this plan file once fully implemented (per repo convention — see commit `90bcbd0` "removed implemented plans").

---

## Risks & notes

- **Phase 3 is the largest and riskiest** (cross-cutting feature + test churn). If the user later prefers speed over completeness, Phases 1, 2, 4, 5 alone make the file green deterministically *if* `_R26`'s expected type is set to match current (non-nullable) output for the joined columns — but that contradicts the "fix the engine" decision, so it's a fallback only.
- The `_V25` extract fix and Phase 2 are pure correctness wins with tiny blast radius — safe to land independently/first.
- Don't trust a single green `tsc` run for `_V26`: its failure is budget/order-dependent. Always verify 3× and watch the Instantiations number.
- Probe technique for revealing computed types across sessions: create a scratch `.ts` importing from `src/*.js`, then `const _x: "REVEAL" = null as unknown as <Type>` and read the `TS2322` message. Clean up scratch files afterward.

## Session log

- **2026-06-01 (session 1):** Diagnosed all four root causes; applied Phase 1.1 (`RewriteExtractWalk` Rest-recursion, cap→24) to `src/parsing.ts` → `_V25` green. Confirmed `_V26` is a budget artifact. Wrote this plan. Working tree also has prior uncommitted changes: `src/validation.ts` (report-scale light path), `tests/fixtures/thefloorr-schema.ts` (new tables), `tests/integration/thefloorr/queries.test.ts` (the new queries).
