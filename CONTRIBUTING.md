# Contributing to @kuindji/typed-sql

This document is for contributors and reviewers. It records the **design
contracts** the codebase is built on — deliberate rules whose consequences can
look like bugs — plus practical notes on working in the repo. Consumer-facing
documentation lives in [README.md](./README.md).

## Working in the repo

- **Typecheck:** `npm run typecheck` — runs `tsc --noEmit` over the whole
  project, tests included. The 8 GB heap flag (`--max-old-space-size=8192`) is
  baked into the script; the type-level parser needs it.
- **Tests:** `npm test` — full typecheck first, then `bun test`. The runtime
  suite requires [Bun](https://bun.sh). Tests live in `tests/` (type-level
  assertions are regular `.test.ts` files checked by `tsc`; runtime behavior is
  executed by Bun).
- **Build:** `npm run build` — `tsc -p tsconfig.build.json` into `dist/`.
  `src/builder/testing/` is test-support code: excluded from the build and the
  npm tarball, but still type-checked and imported by tests.
- **Perf guard:** `npm run perf` — runs `tsc --extendedDiagnostics` and fails
  when Instantiations / Types / Symbols exceed the baseline in
  `scripts/perf-baseline.json` by more than 10%. These counters are
  deterministic for a fixed file set (memory and check time are noisy and only
  reported), so a breach is a real instantiation blowup — fix it with the
  chunked-driver pattern (see "TS recursion depth" below). After *intentional*
  growth (new tests, corpus files, or engine features), re-record with
  `npm run perf -- --update` and commit the new baseline. Run this before
  merging any change to `src/` type-level code.
- **Runtime scaling guard:** `tests/builder/scanner-scaling.test.ts` is a
  *timing* test, and deliberately so. Bound-query building must stay LINEAR in
  the number of DISTINCT placeholder names in one statement; it was O(P^2) up to
  v0.9.7 and cost ~880ms of pure CPU on a 4201-row `.rows()` insert (16,804
  distinct synthetic names), which blew a production Lambda's 60s timeout before
  a DB connection was ever opened. The test asserts a scaling RATIO (linear ~8x
  vs quadratic ~64x over an 8x input growth, threshold 24x), not a wall-clock
  budget, so it is machine-independent. If you touch `scanner.ts` /
  `params.ts`, keep the `Set`-based membership tests and the forward
  `parts[].join("")` rewrites — an array-as-a-set (`order.includes`,
  `used.includes`) or an in-place `out.slice(0, start) + repl + out.slice(end)`
  splice reintroduces the quadratic immediately.
- **Engine-specific guards live in `scripts/dist-smoke.mjs`** (`npm run test:dist`),
  which runs under **Node** on the built artifact. The suite runs on Bun, and
  Bun/JavaScriptCore silently tolerates things V8 rejects — most importantly a
  spread of a huge array (`push(...arr)` overflows V8's stack above ~100k
  elements but never JSC's). A regression that only breaks Node is invisible to
  `bun test`, and Node is what consumers deploy on, so that class of check
  belongs in the dist smoke test. Never reintroduce an argument-spread over a
  user-supplied array — flatten with a loop.
- **Probing types:** never run `tsc` on a standalone probe file (see
  [Verifying nullability](#verifying-nullability-when-probing-types)).

---

## Design contracts

These are deliberate rules. Behavior that follows them is **correct by design**,
even when it looks conservative or incomplete.

### Conservative typing — ambiguous ⇒ `unknown`

The inferrer types an expression **only when its type is unambiguous**. When it
isn't, the result is `unknown` rather than a guess.

- `||` (string concat) → `string`, propagating operand NULL: `a || b` is NULL
  when ANY operand is NULL, so the result gains `| null` when any top-level `||`
  operand may be NULL (`ConcatChainNullable` in `src/expressions.ts`), the same
  NULL-propagation the arithmetic path models. Join-side nullability is applied
  position-independently by the `ApplyProjectionNull` string branch, which walks
  the operands via `ArithRefJoinNullable` exactly like the arithmetic branch —
  `u.name || s.carrier` under `left join … s` is `string | null` even though
  the nullable ref isn't leftmost. A non-column left operand
  (`upper(x) || y`) makes `ParseColumnRef` return `never`; the array-detection
  check is `[Ref] extends [never]`-guarded (`ConcatLeftArrayType`) so a naked
  `never` cannot distribute and collapse the whole projection to `never`.
- `extract(…)` → `number` — always numeric in Postgres regardless of
  field/source, so it's unambiguous; nullable (`number | null`) when the source
  argument may be NULL (an unmodeled argument types `unknown`, which may
  include null → conservative `number | null`).
- **Strict scalar functions** (`NumericScalarFn` / `StringScalarFn` in
  `src/expressions.ts`) — numeric (`length`, `round`, `abs`, `mod`, …) →
  `number`, string (`trim` family, `replace`, `to_char`, `substr`, …) →
  `string`. Strict = NULL iff an argument is NULL, so argument nullability
  propagates via `UnionArgTypes` (same conservative rule as extract: an
  unmodeled argument types `unknown` → `| null`). `left`/`right` are
  deliberately NOT modeled — they double as join keywords; don't add them
  without testing the tokenizer interaction.
- **Aggregate nullability — two distinct NULL paths, modeled separately.**
  (1) An all-NULL group aggregates to NULL — possible only when the argument
  is nullable, so `sum`/`avg`/`string_agg`/`bool_and`/`bool_or` propagate
  argument nullability in `FunctionReturn` (`min`/`max` return the argument
  type, which already carries it; `array_agg(col)` → `col-type[]`, falling
  back to plain `unknown` when the argument is unresolvable, e.g. an
  aggregate-local `ORDER BY`). (2) Zero input rows produce one NULL row for
  every aggregate except `count` — this only happens WITHOUT `GROUP BY`
  (grouped output rows have non-empty groups), so `ApplyUngroupedAggNull`
  (this file, applied at the `GetReturnType` funnel in `src/index.ts`) adds
  `| null` to whole-aggregate projections of ungrouped queries regardless of
  column nullability. It is deliberately lenient: plain `select`-headed
  queries only (CTE outer selects are skipped), a ` group by ` anywhere —
  even a subquery's — skips it, window (`over`) projections and
  non-aggregate call heads (`coalesce(sum(x), 0)` — correctly non-null!)
  don't match. Missing `| null` in those rare shapes is the accepted trade;
  falsely adding it to a grouped query is not.
- Top-level arithmetic `A op B` for op in `+ - * / %` → `number` when **both**
  operands type `number` (`number | null` propagates from either side — SQL
  NULL arithmetic is NULL). number op number is numeric in Postgres; the
  interval/date hazards all require a non-number operand, which the schema
  types as non-number, so the both-number case is unambiguous. Operands are
  found by a quote/paren-aware top-level scan (`SplitTopLevelOp`), so function
  calls and parenthesized sub-expressions work as operands and chains recurse.
  Everything else stays `unknown`: any non-number operand, unary minus, and
  unmodeled operators (`<<`, single `|`, `^`, `||/`, …) — a top-level
  unmodeled operator char aborts the scan conservatively. An operand the core
  path cannot resolve types `unknown` there, **never `never`** — rejecting in
  the arithmetic path would flip `ValidateSQL` to `false` on valid SQL (e.g.
  refs qualified by joined-derived aliases); genuinely bogus columns are still
  rejected by the token-scan validators independently.
- **Literals widen to their base type** — `select 'GBP' as cur` → `{ cur: string }`,
  `select 42 as n` → `{ n: number }`, `select true as ok` → `{ ok: boolean }` —
  *not* `{ cur: "GBP" }` / `{ n: 42 }` / `{ ok: true }`. (This is a deliberate
  choice; do not "fix" it back to a literal type. A projected literal is constant
  per row, so the literal type would be *more* precise — but locked literals break
  consumers: a `useState`/mutable binding/component prop typed `42` or `true`
  rejects every other value. Widen by default; recover precision with an explicit
  cast at the call site when you actually want it.)
- Unmodeled functions and other ambiguous expressions → `unknown`.
- **`CASE` is typed as the union of its first `THEN` branch and its `ELSE`
  branch** (`CaseType`/`CaseParts` in `src/expressions.ts`). SQL requires all
  branches to be union-compatible, so typing one `THEN` + the `ELSE` captures
  the result type without resolving every `WHEN` arm — the cost is ~2 `ExprType`
  calls, not N. No `ELSE` adds `| null` (unmatched rows are NULL). Branch
  nullability from an outer join is applied by `CaseBranchJoinNullable` at the
  `ApplyProjectionNull` funnel, scanning **only the `THEN`/`ELSE` results**, not
  the `WHEN` conditions (a nullable ref in a condition must NOT nullablize the
  result). The branch splitter is deliberately shallow: it finds the first
  top-level `then`, handles a single leading nested `case … end` as the `THEN`
  result, and locates `else` by a leftmost scan; anything it can't cleanly read
  degrades to `unknown` (false-negative bias, same as the rest of the parser).
  Do not deepen it to chase exotic shapes — that's what the outer cast
  (`(case … end)::text`) is for.
- An unaliased function/aggregate projection is named after the function
  (`count(*)` → `{ count: number }`, `coalesce(...)` → `{ coalesce: … }`); an
  unaliased `CASE` is named `case`.

### Shallow & lenient parsing — false-negatives over false-positives

The parser models the common shape of real queries, not the full SQL grammar. Its
bias is to **never reject valid SQL**, even if that means **not catching every
invalid construct**. So:

- A construct that isn't validated is usually **intentional leniency**, not a
  missed bug. Adding strictness that risks rejecting valid SQL is a regression.
- Large/complex queries may route through a more lenient normalization path and
  fall back to `unknown`/`true` rather than failing.
- `%` (modulo) is padded **quote-aware** (`MaybePadModulo` in
  `src/parsing/tokenize.ts`), unlike the other operators in `PadOperators`:
  `LooseScanView` also runs on non-neutralized inputs (multi-line /
  over-budget queries skip literal-blanking), and plain padding would split
  `LIKE '%smith%'` into tokens whose interior words get validated as columns
  — a false reject. Don't "simplify" `%` into the plain `PadOperator` chain.
- Multi-row `VALUES` param typing (`CollectTuples` in
  `src/builder/extract-params.ts`) zips each tuple against the column list,
  capped at 12 tuples × 400 walk-steps per tuple. On overrun the remaining
  text falls back to the loose `DriverParamValue` sweep — widening, never an
  error. Don't raise the caps (TS2589); don't make overrun reject.

### Nullability model

- Column nullability comes from the schema (`T | null`).
- **Outer joins** add `| null` to columns sourced from the nullable side
  (`left join … x` ⇒ `x.col` becomes `T | null`).
- This join-nullability is applied to projected columns **and** to columns nested
  inside `coalesce(...)`: `coalesce(a, b, c)` is nullable if **every** argument is
  nullable (Postgres semantics — `coalesce` is `NULL` only when all args are), so a
  non-null literal (`coalesce(x, '')`) keeps the result non-null.
- It also propagates into **top-level arithmetic** projections: `o.total * 2`
  under `left join … o` types `number | null` — SQL NULL arithmetic is NULL, so
  ANY nullable-side operand (plain ref, or a ref inside a function-call operand
  like `sum(o.total)`) makes the result nullable. A whole-operand
  `coalesce(...)` keeps its all-args-nullable semantics (`coalesce(o.x, 0) * 2`
  stays `number`). See `ArithRefJoinNullable` in `src/expressions.ts`.
- And into **strict function-call / aggregate projections** with no top-level
  operator (`sum(o.total)`, `upper(o.status)`, `min(o.created_at)`): the
  `IsNullPropagatingCall` arm of `ApplyProjectionNull` runs the same operand scan
  (`NullableQualRefIn`, with `coalesce`-guarded refs neutralised) that the
  arithmetic branch already used for `sum(o.total) / count(o.id)`. Before this,
  the two shapes disagreed on the same query (`number | null` vs `number`).
  `count`, `array_agg` (`{NULL}`, not NULL) and ranking window functions are
  deliberately excluded from `NullPropagatingFn`.
- `StripOuterCast` strips only a paren-BALANCED prefix: the leftmost `::` may
  sit inside a call (`coalesce(o.note::text, o.status)`), and cutting there
  produced the unmatchable `coalesce(o.note`, silently dropping the coalesce
  nullability rule. `BalancedCastInner` walks to the first balanced `::`.
- And into **`||` concat** projections the same way, position-independently:
  `u.name || s.carrier` under `left join … s` types `string | null` (concat is
  strict). Array `||` is exempt — it types `T[]` and Postgres array concat is
  not strict (`NULL || arr` → `arr`).
- **`*` expansions carry it too.** `x.*` goes through `MaybeNullableRow`; a bare
  `*` goes through `RowTypeForTablesJoinNull` (`src/schema.ts`), which applies
  `| null` PER RELATION before merging the star rows — matching a table key to
  the nullable set via its `alias=>key` entry, falling back to the table's own
  lowercased name when unaliased (`TableKeyIsNullable`). Both are gated by
  `[Nullable] extends [never]`, so a join-free query pays nothing. The bare-`*`
  arm previously expanded straight from the schema, so `select *` disagreed with
  `select o.*` and `select o.total` on the same query — a `number` for a value
  Postgres fills with NULL. Do NOT "simplify" it back to `RowTypeForTables`.
  Over a **self-join** with one outer side, `*` projects both instances under
  the same column names, so the shared table key is conservatively nullablized
  whole; that is the only representable answer (a qualified `u.*` / `m.*` still
  resolves each side exactly). Pinned by `star-join-nullability.test.ts`.
- **It survives a CTE / derived-table boundary.** `DerivedSubRow`
  (`src/validation/return-derived.ts`) — the shared source of both `CteRow` and
  `DerivedRenamedRow` — resolves the body with `NullableRelations<Body, S>`, so
  the row a subquery source publishes is the row its own SELECT would produce
  standalone. Scoped to the BODY: the enclosing statement's joins are applied
  separately by the caller's own `Nullable` set (a `left join (…) d` on the
  OUTER side was always handled there, and is unaffected). Omitting the argument
  silently drops every `| null` the body computed.

### Schema-declared cast types (`casts`)

A cast `expr::T` whose target the built-in scalar map can't resolve (a custom
`CREATE TYPE`/`CREATE DOMAIN`, or `json`/`jsonb`) is typed from two optional
schema maps via `CastTypeToTs` (`src/expressions.ts`), wired into all three cast
arms (`expr::T` and both `cast(… as T)` forms). **Precedence, most specific
first:**

1. **Per-function** — `functions[fn].casts[T]`, when the inner is a `fn(...)`
   call (`FunctionCastType` in `src/schema.ts`). Authoritative: **wins even over
   a built-in `T`** (an explicit entry is deliberate intent), and carries its own
   nullability — the arm does **not** re-apply `CastInnerFnIsNullable`.
2. **Schema-global** — `casts[T]` (`SchemaCastType`), gated by
   `IsUnknown<SqlScalarToTs<Base>>`: consulted **only** when the built-in is
   uninformative for the **decomposed base** name. Built-ins stay authoritative —
   `casts` names custom types but can't redefine `::text`. (Built-in *remaps* for
   a differently-configured driver remain `PgTypeOverrides`' job — complementary,
   not redundant.)
3. **Built-in** — `SqlTypeToTs<T>` exactly as before.

**Normalization** (`NormalizeCastKey`) reduces the raw `OuterCastName` to the
lookup key **before** the gate and the map lookup, in order: strip chained casts
to the final segment (`text::geometry` → `geometry`, last-wins like
`SqlTypeToTs`); strip a trailing `[]` (array — re-wrapped onto the resolved type,
so a `geometry` entry covers `geometry[]`; the gate/lookup run on the **base**,
because `IsUnknown<unknown[]>` is `false` and would wrongly skip the entry); drop
a `(...)` param suffix and a schema qualifier (`public.geometry` → `geometry`);
lowercase. The array `[]` re-wrap happens **after** resolution.

**Nullability of the schema-global path** re-applies `| null` only through the
paths an informative built-in cast already uses — a join-null bare ref (via the
`ApplyProjectionNull`/`RefQualifier` post-pass) and a nullable schema-fn inner
(via `CastInnerFnIsNullable`). **Base-column** nullability is dropped by *any*
cast; a built-in-function / parenthesized / arithmetic inner stays non-null.
These gaps are inherited unchanged (the same inners type non-null under `::text`)
and are **not** regressions — see the reviewer-gotchas table. Authoring a global
entry as `Geometry | null` is the wrong fix (it nullablizes every cast to that
type); recover precision with `coalesce` / a per-fn entry / a nullable target.

This **supersedes the unpublished `ModeledFnCastReturn` heuristic** ("an
uninformative cast over a modeled function falls back to its `returns`"). An
explicit `casts` declaration replaces it: `modeled_fn()::json` is now `unknown`
unless the function declares `casts.json`. The split also makes `returns` honest
— a bare `ST_AsGeoJSON(x)` now reflects its runtime GeoJSON **text** (`string`),
not the post-`::json` object shape.

### TS recursion depth (`TS2589`) is a hard constraint

The entire design is shaped by TypeScript's instantiation/recursion limits.

- Type-level char-walks are **chunked** and step-capped on purpose. The fix for a
  depth error is almost never "raise the cap" — caps near ~1000 iterations *cause*
  `TS2589`. Use the chunked-driver pattern (a bounded worker that yields its state,
  re-invoked with a fresh step counter) instead.
- Some precision is intentionally traded away on very wide/long queries to stay
  under the limit.

### `*If` methods and the two kinds of "maybe missing"

The builder's `*If` methods take a **runtime** boolean, which the type system
cannot read — types are inferred from the **maximal** query, and conditionally
*selected* columns become optional. The full behavioral spec is in the README
(["Conditional builder methods"](./README.md#conditional-builder-methods-if--runtime-vs-type-level)
and ["Two kinds of maybe missing"](./README.md#two-kinds-of-maybe-missing--null-vs-optional--undefined)).
For review purposes the hard rules are:

- Conditional ⇒ optional, even when the condition is obviously `true` at the
  call site.
- Clause-only `*If` (`whereIf`, `joinIf`, …) changes SQL text, never the result
  column set.
- `| null` (present-but-NULL, from outer joins) and `?:`/`| undefined`
  (maybe-absent, from `selectIf`) are **different things** — keep them distinct
  in review; never treat one as the other.

---

## Reviewer / contributor gotchas

Things that **look like bugs but are intended**. Please don't "fix" these without
reading the contracts above:

| Observation | Verdict |
|---|---|
| `select 'GBP' as c` types `c` as `string` / `select 42 as n` as `number` / `select true as b` as `boolean`, not the literal | **Intended.** All projected literals widen to their base type — locked literals break consumers (`useState`, mutable bindings, props). |
| An unknown function projects as `unknown` | **Intended.** Conservative typing — ambiguous ⇒ `unknown`. |
| A `CASE` types as the union of its first `THEN` and `ELSE` (not `unknown`); no `ELSE` adds `\| null` | **Intended.** Branches are union-compatible in SQL, so one `THEN` + `ELSE` is enough; missing `ELSE` means unmatched rows are NULL. Exotic shapes still degrade to `unknown`. |
| An all-string-literal `CASE` keeps the literal union (`"big" \| "small"`) although projected literals widen | **Intended** (`CaseLiteralUnion`, pinned by `case-expressions.test.ts` C1). The enum-mapping CASE is the one place the literal union is what consumers restate by hand; any non-literal arm collapses it to `string`. |
| `select email from users union all select note from orders` types `email: string` though `note` is nullable | **Known limitation.** UNION rows come from the first branch only; later-branch nullability is not merged. Pinned in `scope-regressions-2026-09.test.ts`. |
| Several `.where()` fragments: an OR-bearing one is emitted in parentheses, the others verbatim | **Intended.** `joinConditions` (assemble.ts) parenthesizes a fragment containing ` or ` unless it already is one `( … )` group — a shallow string test mirrored byte-for-byte by `CondClause` / `WrapCond` (sql-tag.ts) so the type-level SQL equals the runtime SQL. Do not make it SQL-aware on one side only. |
| An unqualified column in a write's WHERE that is NOT on the target table binds `unknown`, not the other table's type | **Intended.** `TargetColOrLoose` (extract-params.ts): a target-table miss degrades to loose (it may be a sub-select's or a `from`/`using` relation's column). It used to bind `never`, which rejected every value. |
| A `CASE` whose `WHEN` condition refs a left-joined column is NOT nullable, but one whose `THEN`/`ELSE` refs it is | **Intended.** Only the result branches determine the value; a condition ref never nullablizes the result (`CaseBranchJoinNullable`). |
| A multi-`WHEN` `CASE` with a nullable *non-first* `THEN` branch types non-null | **Intended tradeoff.** Only the first `THEN` + `ELSE` are typed (≈2 `ExprType` calls, not N). The conservative-null gap in this rare shape is accepted; `coalesce`/cast recovers it. Pinned by `C8` in `case-expressions.test.ts`. |
| Some invalid-looking SQL is reported `true` by `ValidateSQL` | **Often intended.** Lenient parser biases away from false rejections. |
| A column inside `coalesce(...)` under a left join is `T \| null` | **Intended & correct.** Coalesce is nullable iff all args are. |
| A bare `select *` over a SELF-join types the shared table's columns `\| null` even for the firm side | **Intended.** `*` projects both instances under the same names, so the merged row cannot separate them; conservative null is the only representable answer. `u.*` / `m.*` resolve each side exactly. |
| A ref to an alias that is SHADOWED inside an `EXISTS (...)` subquery is nullable when the subquery outer-joins that alias | **Known limitation, safe direction.** `NullableRelations` scans the whole query text, so an inner `left join users u` marks the qualifier `u` nullable for the outer projection too. Pre-existing on the plain-select path; the CTE/derived path now matches it rather than diverging. Over-nullablization is the conservative direction — recover with a distinct inner alias. |
| Binding `[]` to an `IN (...)` placeholder THROWS instead of degrading | **Intended**, and the one place the runtime is deliberately strict. Zero slots emit `in ()` — a Postgres syntax error surfacing at the driver with no clue which param caused it — and there is no safe silent rewrite (`in (null)` is NULL, not false, and it inverts `not in`). An empty array OUTSIDE an IN list (`= any(:ids)`) is untouched: one well-formed array param. |
| A `:param` inside `in (select ...)` is NOT expanded, even with an array value | **Intended.** `IN (` followed by `select`/`with`/`values`/`table` opens a SUBQUERY, not a value list (`opensSubquery` in `src/builder/scanner.ts`) — its placeholders are ordinary scalar params. Expanding them produced malformed SQL (`where tags = $1, $2`) and made an empty array a false reject. |
| A projected literal widens to its base type instead of staying precise | **Intended.** Widen-by-default; cast at the call site to recover the literal. |
| A step cap is hit and the result widens on a huge query | **Intended.** Depth-limit guard, not a parse failure. |
| "Why not just recurse deeper / raise `Steps extends N`?" | Doing so blows `TS2589`. Use the chunked-driver pattern. |
| `selectIf(cond, "x")` makes `x` optional even when `cond` is clearly true | **Intended.** Types can't read a runtime boolean; conditional ⇒ optional (max view). |
| A `joinIf` table's columns are typed as present though the join is conditional | **Intended.** Clause-`*If` infers the max view; only conditional *selects* optionalize columns. |
| `sum(o.total) / count(o.id)` under a LEFT JOIN types `number \| null` even though the divisor "can't" be null | **Intended.** Any nullable-side operand makes an arithmetic projection nullable (an all-NULL group sums to NULL); conservative null is the safe direction. `coalesce(o.x, 0)` as an operand stays non-null. |
| An ungrouped `sum(non_null_col)` / `min(...)` / `array_agg(...)` types `\| null` despite the column being non-null | **Intended & correct.** Zero matching rows produce one NULL row for every aggregate except `count`. Wrap in `coalesce(..., 0)` (rescues the type AND the runtime value) or add `GROUP BY` to recover non-null. |
| `\| null` (join) and `?:` / `\| undefined` (`selectIf`) treated as interchangeable | **No.** present-but-`null` ≠ maybe-absent. See the README's "Two kinds of maybe missing". |
| All-`selectIf` builder (no plain `select`) types every column optional | **Intended.** The all-false runtime path is `SELECT *` → `Partial<…>`. |
| A `:param` in the 13th+ `VALUES` tuple types `unknown` instead of the column type | **Intended.** Tuple-cap degrade — loose, never rejected. |
| `fn(x)::text` types as a branded string, not plain `string`, when `functions[fn].casts.text` is declared | **Intended.** A per-function `casts` entry wins even over a built-in target (step 1) — it's deliberate intent. |
| `col::geometry` resolves to a custom type but `col::text` ignores any `casts.text` | **Intended.** The schema-global `casts` map is gated by the uninformative built-in check — it names custom types, never redefines a built-in like `::text`. |
| A base-nullable `(col)::geometry` / `lower(col)::citext` / `(a + b)::geometry` types non-null | **Intended.** Base-column nullability is dropped by *any* cast; only a join-null bare ref or a nullable schema-fn inner re-adds `\| null`. Same gap as `::text`; recover with `coalesce` / a per-fn entry / a nullable target. |
| `modeled_fn()::json` types `unknown` instead of the function's `returns` | **Intended.** Supersedes the unpublished `ModeledFnCastReturn` heuristic — declare `functions[fn].casts.json` to type it. A bare `ST_AsGeoJSON(x)` now reflects `returns` (GeoJSON text), which the old heuristic made unsound. |

## Verifying nullability when probing types

Running `tsc` on a standalone probe file **disables `strictNullChecks`**, which
collapses `string | null` to `string` and makes every null assertion lie. Always
probe under the project's strict config — e.g. add a temp test and run the full
`npx tsc --noEmit` — not a one-off `tsc probe.ts`.
