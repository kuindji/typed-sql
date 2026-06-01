# Query Builder for `@kuindji/typed-sql` — Design

**Date:** 2026-06-01
**Status:** Approved design, pending implementation plan

## Goal

Add a runtime query builder to `@kuindji/typed-sql` that is a **drop-in
replacement for the typed-builder subset** of the predecessor package
`@kuindji/sql-type-parser`. Code using the typed `createSelectQuery` /
`createSelectFn` / condition-tree / conditional-SQL APIs should keep
compiling and produce **byte-identical runtime SQL** after only changing the
package specifier.

This is **not** full source-level parity: the untyped builder is removed and
the `SelectQueryBuilder` third generic is dropped (see Scope and the
Compatibility caveat). Consumers importing the untyped exports or writing
`SelectQueryBuilder<Schema, State, Sql>` annotations must adjust. This is an
accepted tradeoff (the untyped builder and utility types were deprioritized);
the goal statement is scoped accordingly rather than claiming a literal
specifier-only swap.

The new package already has a stable, string-based type-level core
(`GetReturnType<Query, Schema>`, `ValidateSQL<Query, Schema>`, and per-clause
`Validate*Part` fragment validators). The builder is built **on top of** that
core rather than reimplementing SQL understanding at the type level.

## Scope

### In scope (runtime API parity)

- **Condition tree:** `createConditionTree(op)` + `ConditionTreeBuilder`
  (`.add` / `.remove` / `.when` / `.toString` / `.getState`).
- **SELECT builder:** `createSelectQuery<Schema>()` and the full fluent
  interface: `select`, `from`, `join`, `where`, `groupBy`, `having`,
  `orderBy`, `limit`, `offset`; the `*If` variants (`selectIf`, `joinIf`,
  `whereIf`, `groupByIf`, `havingIf`, `orderByIf`, `limitIf`, `offsetIf`);
  `removeSelect`, `removeJoin`; `withParams`; `apply`, `applyIf`;
  `getParams`; `toString`; `toBrandedString`.
- **SQL assembly:** `assembleSelectSQL(state)` (exported, ported verbatim).
- **DB integration:** `createSelectFn<Schema, Overrides>(handler)` with the
  string-query and typed-builder overloads, `:name` → `$n` param expansion,
  and `MergeOverrides`.
- **Conditional SQL templates:** `createConditionalQuery<Schema>()`,
  `conditionalSQL`, `processConditionalSQL`, `processParams`,
  `normalizeWhitespace`, `withConditions`.
- **Build tooling:** the package currently ships **type-only** code (no
  `dist`, no build script). The builder is the first runtime code, so add a
  build that emits JS + `.d.ts`.

### Out of scope (per decisions below)

- **Untyped builder** — `createUntypedQuery`, `createUntypedSelectQuery`,
  `UntypedSelectBuilder`, and the untyped overload of `createSelectFn`. Not
  needed now.
- **AST** — the old `common/ast.ts` and any AST-shaped exports. Not used.
- **Old type-level builder machinery** — `SelectBuilderState`,
  `BuilderStateTag`, `AddColumnsForSchema`, `WithFromForSchema`,
  `WithJoinContext`, `StateFromSql`, etc. Replaced by the core (see
  Architecture).
- **Utility / AST type exports** — not a priority; only the types needed to
  make the runtime API usable (`BuilderSQL`, `BuilderReturnType`,
  `ValidQuery`, `ValidQueryBuilder`, `SelectResult(Array)`,
  `SelectBuilderResult(Array)`, `MergeOverrides`, `IsValidSelect`,
  `QueryHandler`, `QueryParamValue`, `QueryParamInput`) are shipped.

### Compatibility caveat (breaking vs old package)

These are the only known break points for a consumer migrating from
`@kuindji/sql-type-parser`:

1. **Untyped builder removed** — imports of `createUntypedQuery`,
   `createUntypedSelectQuery`, or `UntypedSelectBuilder` will not resolve, and
   the untyped overload of `createSelectFn` is gone.
2. **`SelectQueryBuilder` third generic dropped** — `SelectQueryBuilder<S,
   State, Sql>` annotations must drop the middle argument
   (`SelectQueryBuilder<S, Sql>`).

Runtime call sites of the typed builder are unaffected. We are **not**
shipping deprecated aliases/shims for (1) or a phantom third generic for (2)
now; if real migration friction appears, a phantom third parameter (runtime
no-op) and re-exported untyped names can be added without further design.

## Decisions

| Decision | Choice |
|---|---|
| Runtime API | Full parity with old package (minus untyped builder). |
| API naming | Keep old names/signatures exactly (drop-in). |
| Schema shape | Identical `{ defaultSchema, schemas }` `DatabaseSchema`. |
| Type-level architecture | **A — SQL-string reduction** (track only the assembled SQL literal; derive row type & validation from the core). |
| Code layout | New `src/builder/` subfolder. |

## Architecture — SQL-string reduction (Approach A)

The old builder maintained **two** parallel type-level tracks: a `State` tag
(reimplementing column resolution → row type) and a `Sql` tag (reconstructing
the SQL string). The new core already turns a SQL **string** into both a row
type and a validity verdict, so we collapse to a **single** track: the
accumulated SQL string literal.

```
fluent method call
  ├─ runtime:  clone RuntimeSelectState (immutable) + record raw fragment
  └─ type:     append fragment to the lean `Sql` tag

BuilderSQL<B>          = assemble the `Sql` tag into a literal SQL string
                         (raw `:name` param form — see Canonical SQL forms)
BuilderReturnType<B>   = GetReturnType<BuilderSQL<B>, Schema>      (core; {} when SQL is `string`)
validation (builder)   = ValidQueryBuilder<Schema, B>             (allow-unknown wrapper, NOT bare ValidateSQL)
validation (per method) = Validate*Part<fragment, Schema>          (core, optional localized errors)

toString() / assembleSelectSQL(state)  → runtime SQL string ($n param form, byte-identical to old)
```

### Canonical SQL forms (two distinct strings)

`BuilderSQL<B>` and `toString()`/`toBrandedString()` are **not** guaranteed to
be byte-equal once named params are used:

- **`BuilderSQL<B>` (type level):** the assembled literal in **raw `:name`
  form**, because `withParams` deliberately does not feed the `Sql` tag (the
  type tag has no param map to compute placeholder order). This is the
  canonical type-level SQL used for inference/validation. `:name` vs `$n` is
  irrelevant to `GetReturnType`/`ValidateSQL` because a param sits on the
  opaque RHS of a predicate. Matches the old package's `BuilderSQL`.
- **`toString()` (runtime):** the executed string with `:name` expanded to
  `$1, $2, …`. This is what reaches the database and is byte-identical to the
  old package's output.

The spec treats these as two intentionally different artifacts; tests assert
each against its own expected string, never against each other.

### `ValidQueryBuilder` — allow-unknown semantics (critical)

`ValidateSQL<string, Schema>` is `false` by design in the core (`string
extends Query ? false`, src/index.ts; confirmed by
tests/api/public-api.test.ts). So a builder whose `BuilderSQL<B>` collapses to
the wide `string` type (e.g. a non-literal `*If` condition, or a tree-sourced
opaque fragment) would be wrongly **rejected** by a naive
`ValidateSQL<BuilderSQL<B>, Schema>` check, even though it is runtime-valid.

`ValidQueryBuilder` must therefore distinguish *definitely-invalid* from
*unknown*:

```
ValidQueryBuilder<Schema, B> =
    BuilderSQL<B> extends infer SQL extends string
        ? string extends SQL          // SQL not statically known
            ? B                        //   → allow, untyped (BuilderReturnType = {})
            : ValidateSQL<SQL, Schema> extends true
                ? B                    //   → known & valid
                : `[SQL Error] ${...}` //   → known & invalid: reject
        : B;
```

The same allow-unknown guard is unnecessary for the `createSelectFn` **string**
overload (`ValidQuery<Q>`): a non-literal `string` query cannot be typed at
all, so rejecting it is acceptable and matches old behavior. The guard applies
specifically to the **builder** overload.

The lean `Sql` tag mirrors only the **SQL side** of the old `BuilderSqlTag`
(ordered fragments per clause). It is assembled into a literal **lazily inside
`BuilderSQL<B>`**, not recomputed on every method call, to limit
instantiation depth.

### Why this is enough

- Row inference: `GetReturnType` already handles SELECT lists, joins,
  aliases, expressions, CTEs, set ops — far beyond the old `State` track.
- Validation: `ValidateSQL` covers the assembled query; `Validate*Part`
  gives early, localized feedback on individual fragments.
- Runtime: identical SQL because `assembleSelectSQL` and the param expander
  are ported verbatim.

## Module layout (`src/builder/`)

| File | Contents |
|---|---|
| `params.ts` | `QueryParamValue`, `QueryParamInput`; named `:name` → `$n` expansion helpers (shared by select builder + conditional SQL). |
| `condition-tree.ts` | `ConditionTreeBuilder` class + `createConditionTree`. Type param tracks the rendered string literal so `where(tree)` keeps `BuilderSQL` precise. |
| `state.ts` | `RuntimeSelectState` interface + `EMPTY_RUNTIME_STATE`. |
| `assemble.ts` | `assembleSelectSQL(state)` — ported verbatim (WITH/SELECT[/DISTINCT]/FROM/JOINs/WHERE/GROUP BY/HAVING/ORDER BY/LIMIT/OFFSET/UNION ordering, then named-param substitution). |
| `sql-tag.ts` | Lean type-level fragment tag + `BuildSQL<Sql>` that assembles it to a literal string mirroring `assembleSelectSQL`'s ordering. |
| `select.ts` | `SelectQueryBuilder` interface, `createSelectQuery`, and the immutable impl class (clone-per-method). |
| `db.ts` | `createSelectFn`, `ValidQuery`, `ValidQueryBuilder`, `SelectResult(Array)`, `SelectBuilderResult(Array)`, `MergeOverrides`, `IsValidSelect`, `QueryHandler`. |
| `conditional-sql.ts` | `createConditionalQuery`, `conditionalSQL`, `processConditionalSQL`, `processParams`, `normalizeWhitespace`, `withConditions`. |
| `return-type.ts` | `BuilderSQL<B>`, `BuilderReturnType<B>`, `BuilderResultBrand`. |
| `index.ts` | Re-exports all of the above (values + the kept types). |

`src/index.ts` gains **value** re-exports (currently it has only `export
type`): `export * from "./builder/index.js"`.

### Builder generic signature

The builder becomes `SelectQueryBuilder<Schema, Sql>` (two generics): the
`Schema` and the lean `Sql` fragment tag. The old third `State` generic is
dropped — it tracked nothing the core does not already derive, and type
identity is not part of *runtime* parity. (If a concrete need for annotation
source-compat appears, a phantom third parameter can be re-added without
runtime impact.)

## Runtime behavior (ported verbatim)

- **Immutability:** every method returns a new builder over a cloned
  `RuntimeSelectState`; fragments are keyed by id (auto-generated
  `select_0`, `join_0`, … when no id given) so `removeSelect`/`removeJoin`
  and id-overwrite semantics match.
- **`assembleSelectSQL`:** clause ordering, uppercase keywords, empty-clause
  skipping, default `SELECT *`, `SELECT DISTINCT` when `state.distinct`,
  JOINs emitted in `joins[]` order, WHERE/HAVING joined with `AND`,
  GROUP BY/ORDER BY joined with `, `. `distinct`/`ctes`/`union` exist in
  state but are not surfaced by fluent methods (matches old).
- **Named params:** `:name` (regex `:([a-zA-Z_][a-zA-Z0-9_]*)`), ordered by
  first appearance; array values expand to `$n, $n+1, …`; `getParams()`
  flattens arrays in placeholder order. `withParams` merges and intentionally
  does **not** touch the `Sql` tag (avoids depth blowup on long chains).
- **`from(subquery-builder)`:** runtime embeds `(${source.toString()})`;
  type-level subquery inference is punted (matches old).
  **Parameterized subqueries are an explicit unsupported case.** Because the
  inner `toString()` has already expanded the inner builder's `:name` params
  to `$1, $2, …` *relative to the inner query*, and those positionals are not
  merged into the outer builder's param set, an inner+outer mix would
  double-assign `$1` and the inner params would be missing from the outer
  `getParams()`. We do **not** add nested param merging/reindexing in this
  pass. The limitation is documented and pinned by a test that asserts the
  (broken-by-design) behavior, so a future param-merge feature is a conscious
  change rather than a silent fix. Subqueries **without** params embed
  correctly.
- **Condition tree:** `.toString()` wraps in parens, uppercases AND/OR,
  renders nested trees recursively; ids stable, `.remove(id)` no-ops when
  absent.
- **Conditional SQL:** `processConditionalSQL` iteratively resolves
  `/*if:cond*/…/*endif*/` (supports `!` negation and dotted paths) innermost
  first; `processParams` does the same `:name`→`$n` mapping; `conditionalSQL`
  composes them; `normalizeWhitespace` collapses whitespace.

## Build tooling

- Add `tsconfig.build.json` (port from old: `outDir: ./dist`, `rootDir:
  ./src`, `declaration`, `declarationMap`, `sourceMap`, no `noEmit`, include
  only `src/**/*.ts`).
- `package.json` scripts: `build: tsc -p tsconfig.build.json`,
  `prepublishOnly: npm run build`, `test: tsc --noEmit && bun test`.
- Imports already use `.js` suffixes under NodeNext — new files follow suit.

## Testing

Follow existing `typed-sql` test conventions (bun `test`, `Equal`/`Expect`
type assertions, `@ts-expect-error` for negatives, fixtures under
`tests/fixtures/`).

- **Runtime/SQL equality:** `assembleSelectSQL` and full builder chains
  produce expected SQL strings; param expansion (scalars + arrays) and
  `getParams()` ordering; condition-tree rendering; conditional-SQL
  processing (nested, negated, dotted conditions; param mapping).
- **Type-level:** `BuilderReturnType<typeof builder>` equals
  `GetReturnType<BuilderSQL<typeof builder>, Schema>` for representative
  queries; `BuilderSQL` equals the expected literal; `createSelectFn`
  rejects invalid queries/builders (`@ts-expect-error`) and infers row
  arrays for valid ones; `MergeOverrides` applies overrides and errors on
  unknown keys.
- **Allow-unknown (Risk #1 / F3):** a builder using a non-literal `*If`
  condition is **accepted** by `createSelectFn` (compiles) with row type `{}`
  — assert it is not rejected. Also assert a builder with a genuinely invalid
  literal column/table **is** rejected (`@ts-expect-error`).
- **Two SQL forms (F4):** for a builder with named params, assert `BuilderSQL`
  equals the raw `:name` literal **and** `toString()` equals the `$n`-expanded
  string — i.e. they intentionally differ.
- **Parameterized subquery (F2):** a pinning test that documents the
  unsupported case — assert the (current, broken-by-design) `toString()` /
  `getParams()` output for a parameterized inner builder, and assert a
  param-free subquery embeds correctly.
- Reuse existing schema fixtures (`ecommerce-schema.ts`, etc.). Optionally
  adapt the old `examples/select/*` as smoke fixtures.

## Known risks & fallback strategy

The previous repo *started* with SQL-string reduction; these are the failure
modes that can push toward heavier machinery. We accept them as documented
tradeoffs now, with a clear escalation path.

1. **Non-literal `*If` conditions.** When a `*If` condition is a non-literal
   `boolean`, whether the fragment is present is unknown at type level, so the
   assembled SQL literal degrades to `string` and `BuilderReturnType` falls
   back to `{}`. *Accepted* (type fidelity deprioritized). **The builder is
   still accepted** by `createSelectFn` thanks to `ValidQueryBuilder`'s
   allow-unknown path (see Architecture) — it is untyped, not rejected.
   Possible later enhancement: model the fragment as an optional union so
   `GetReturnType` yields `col?: …` instead of collapsing to `string`.
2. **Instantiation depth on long chains.** Accumulating a large SQL literal
   across many calls can approach TS depth limits (the core already carries
   TS2589 mitigations). *Mitigation:* keep the `Sql` tag a flat fragment list
   and assemble only inside `BuilderSQL<B>`; `withParams` stays out of the
   tag.
3. **Subquery `from()` typing.** Punted, as in the old package.

**Escalation path:** if string reduction proves insufficient for a specific
clause (inference gap or depth), reintroduce a *minimal* per-clause state
**only** for that clause — not a wholesale return to the old `State` tree.

## Open questions

None blocking. `BuilderSQL` precision for `where(ConditionTreeBuilder)`
depends on the tree's rendered-literal type param; if that proves brittle,
fall back to treating tree-sourced fragments as opaque `string`. That
degrades inference for the affected query only and does **not** cause
rejection, because `ValidQueryBuilder`'s allow-unknown path treats wide
`string` SQL as accepted-but-untyped (see Architecture).
