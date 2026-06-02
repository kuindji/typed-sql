# Integration stress-test findings (collection pass)

Date: 2026-06-02. Purpose: port **every** SQL query from two real consumer apps
(anonymized as `commerce` + `netsec`) into paired plain + builder tests, to surface
every hiccup before adopting the library in production. **Collection only — `src/` was
not modified; red tests are the deliverable (the engine fix-list), not bugs in the tests.**

---

## CURRENT STATUS — updated 2026-06-02 (fix pass in progress)

The numbered findings below are the **original collection-time snapshot** (131 type
errors). They are kept for provenance. The fix pass has since resolved most of them.

**Now: 8 type errors remain** (was 131), **282/0 runtime pass** (unchanged).

Resolution of each original finding:
- **F1 (write/raw param case folding) — FIXED.** Root cause was real: `ExtractParams`
  normalized through `LowercaseOutsideQuotes`, folding `:teamId`→`:teamid`, and `ColOf`
  didn't strip double-quotes so the value type bound `never`. Fixed in `src/parsing.ts`
  (`NormalizeQueryKeepParams`/`LowercaseOutsideQuotesKeepParams` preserve `:name` case,
  still consume `::cast`) + `src/builder/extract-params.ts` (`ColOf` routes through
  `CleanIdent`). All ~66 errors cleared.
- **F3 (scalar param type mismatch) — FIXED.** Were test-authoring artifacts; the builder
  correctly surfaces the column scalar type after F1. Mirrors corrected to pass right-typed
  literals.
- **F2 (validation / return-type mismatches) — MOSTLY FIXED.** Triaged per-query into three
  buckets: (a) over-strict authored expectations (corrected the test, e.g. `min/max` returns
  the column type not `unknown`; `User.email` is nullable per fixture; `select *` over an
  intersection-defined fixture table needs a local `Flatten<T>` wrapper to compare equal);
  (b) genuine engine bugs — two real `src/` fixes landed: `select *` no longer leaks
  correlated-subquery tables into the outer row (commit 3c702c2), and an outer cast over a
  derived-subquery FROM is now recovered (commit 2700ef6); (c) fixture gaps → F4.
- **F4 (fixture gaps) — DONE.** Added (additively, no engine change): `User_Cognito`,
  `Connection`, `User_RecentlyDeleted`, `User_Analytics` pse-analytics cols, `catalogue.file`
  feed cols + partitioned search tables, `Revolut_PaymentCreditNote.s3key`,
  `Network_Order_Collection_Order`, `Network_Order_Partnerize_Item_Snapshot`, `Team_SalesTarget`.
  **All fixture gaps now closed.**
- **F0 (whole-project tsc stack/heap) — UNCHANGED.** Full-corpus compile still needs
  `node --stack-size=4000 --max-old-space-size=8192 .../tsc --noEmit`. For per-query triage,
  prefer a **single-file scoped** check (`tsconfig` including `src/**` + one test file):
  ~1s each, no special flags. The blowup only happens when all corpus files compile together.
- **F5 (1× TS2589, `createSql` ExtractParams deep instantiation, queries-builder:2601) — OPEN.**
  Only surfaces in the full-project compile.

### The 8 remaining reds (per-file scoped counts)

| File:line | Category | Notes |
|---|---|---|
| `reporting-v2-team-plain:395` | return-type triage | `UpcomingInvoice` nested-coalesce/left-join row |
| `reporting-v2-my-plain:462` | multi-CTE (bigger task) | `with a as(..),b as(..)` → `SingleCteMatch` lenient fallback |
| `cron-builder:598`, `:602` | builder triage | `SelectBuilderResult`/`AssertEqual` |
| `reporting-v2-my-builder:466` | builder triage | |
| `reporting-v2-team-builder:352`, `:405` | builder triage | |
| `revolut-dml-builder:320` | builder triage | |
| `queries-builder:2601` | F5 TS2589 | full-project compile only |

Triage recipe for one file:
```sh
echo '{ "extends": "./tsconfig.json", "include": ["src/**/*.ts", "tests/integration/commerce/THE-FILE.test.ts"] }' > tsconfig.one.json
npx tsc --noEmit -p tsconfig.one.json
```
To reveal a computed type, drop a temp probe: `const r: GetReturnType<Q,S> = 1 as any; const _: 0 = r;`
(the `0` mismatch prints the real type in the error).

---

## Original collection-time findings (snapshot — see CURRENT STATUS above for resolution)

## What was added
- Anonymization: `thefloorr→commerce`, `vigilocity→netsec` across folders, fixtures
  (`commerce-schema.ts`, `netsec-schema.ts`), schema types (`CommerceMainSchema`,
  `CommerceCatalogueSchema`, `NetsecSchema`), exported `*TestsPass`, and all provenance
  comments. Vendor names (Revolut/Rakuten/CJ/Partnerize) kept by design.
  `grep -ri "floorr\|vigilocity" tests/ src/` → empty.
- 21 new test files under `tests/integration/commerce/` + `tests/integration/netsec/`,
  mirroring every query in: cron, cli, fn, backend-v2 (DML), revolut (DML),
  hasura-trigger (DML), reporting-v2 (lib / pse / team / my / misc), the queries grab-bag,
  and the netsec set. ~300 queries → plain (`ValidateSQL`/`GetReturnType`) + builder
  (`createSelectQuery`/`createInsertQuery`/`createUpdateQuery`/`createDeleteQuery`, or
  `createSql` typed-raw with a `// TODO(builder-api)` tag when inexpressible — 76 such tags).

## Runtime (`bun test tests/integration`)
**282 pass / 0 fail (37 files).** Every builder assembles the correct SQL string + ordered
params at runtime, including all `createSql` fallbacks. No runtime regressions.

## Type-check (`tsc --noEmit`) — the findings

### F0 [HIGH] The suite no longer type-checks under default `npm test`
Default `tsc --noEmit` **crashes**: `RangeError: Maximum call stack size exceeded`
(`instantiateType`/`getConditionalType`). With `--stack-size=4000` it instead **OOMs at 4 GB**.
It only completes with `node --stack-size=4000 --max-old-space-size=8192 .../tsc --noEmit`
(32 GB machine). So the corpus pushes the type-level engine past the default stack/heap.
=> The volume + a few pathological queries make whole-project type-checking fragile.

Under the enlarged run: **exit 2, 131 type errors + 1 TS2589.**

### F1 [HIGH] Builder named-param / write-column keys are folded to lowercase (~66 errors)
The write-builders (`createInsertQuery`/`createUpdateQuery`/`createDeleteQuery`) and
`createSql` infer `withParams` key types (and write-column keys) **lowercased**, and the
value type often collapses to `never`:
```
withParams({ teamId, pseId })  // TS2561: '{ teamid: string|null; pseid: never }' — "Did you mean 'teamid'?"
.value("saleAmount", ":sa")    // expects key 'saleamount', value never
```
Examples: `teamId→teamid`, `tempPassword→temppassword`, `transactionId→transactionid`,
`paymentId→paymentid (never)`, `moodboardId→moodboardid (never)`, `targetCommission→targetcommission`.
**Impact: critical for `commerce` (and any camelCase-quoted-identifier schema)** — every
write-builder / typed-raw call with camelCase params fails the type check. Counts by file:
queries-builder 13, cron-builder 12, revolut-dml-builder 11, reporting-v2-pse-builder 9,
hasura-trigger-dml-builder 9, fn-builder 5, backend-v2-dml-builder 4, +team/misc/cli 1 each.
Likely origin: the named-param capture / `ExtractParams` / `WriteParamsFor` type lowercases
the identifier and/or fails case-insensitive column match for the value type.
(NB: the SELECT builder's `withParams` does NOT lowercase — existing `:fileId` SELECT tests
are green — so this is specific to the write/raw path.)

### F2 [MED] 48 validation / return-type mismatches (TS2344 `false does not satisfy true`)
`Expect<Equal<ValidateSQL/GetReturnType, …>>` and `RequireTrue<AssertEqual<SelectBuilderResult…>>`
that don't meet the intended result. This is the core engine fix-list for the plain +
SELECT-builder paths. Needs per-query triage into: (a) genuine engine limitation,
(b) fixture gap (see F4), (c) over-strict authored expectation.

### F3 [MED] ~13 scalar param type mismatches (TS2322 `string` not assignable to `number`)
Builder requires the correct scalar type for numeric columns; several mirrors pass a string.
Mix of genuine type-surfacing and test-authoring artifacts — triage needed.

### F4 [INFO] Fixture gaps (cause some F2 reds; NOT engine bugs)
Tables/columns referenced by real queries but absent from the fixtures (left as
`// FIXTURE-GAP` comments, fixtures intentionally not extended this pass):
`User_Cognito`, `Connection`, `User_RecentlyDeleted`, `Team_SalesTarget`,
`Network_Order_Collection_Order`, `Network_Order_Partnerize_Item_Snapshot`, and several
`User_Analytics` / `catalogue.file` / `catalogue.product_search` columns.

### F5 [LOW] 1× TS2589 — `createSql` param-extraction deep instantiation
`tests/integration/commerce/queries-builder.test.ts:2601` — `createSql(\`…\`).withParams({})`
over a large multi-join + CROSS JOIN LATERAL raw query: `ExtractParams` recursion is
"excessively deep and possibly infinite". This is a likely contributor to F0.

### F6 [INFO] Builder ergonomics observed (encoded into tests, not failures)
- No `leftJoin()` method — join keyword must be inside `.join("left join …")` (emitted verbatim).
- `:date` named param collides with a `::date` cast → `$2:$2`; worked around by renaming the param.
- Placeholders numbered by first-reference order in the assembled SQL; repeated named param reuses one `$n`.

## Suggested next steps (NOT done — collection only)
1. Fix F1 (write/raw param-name case preservation + case-insensitive column match) — biggest win.
2. Triage F2 per-query (engine vs fixture vs expectation); extend fixtures for F4.
3. Address F5/F0 (bound `ExtractParams` recursion; or document the stack/heap requirement).
