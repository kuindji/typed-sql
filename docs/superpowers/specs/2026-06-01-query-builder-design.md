# Query Builder for `@kuindji/typed-sql` — Design

**Date:** 2026-06-01
**Status:** Approved design, pending implementation plan

## Goal

Add a runtime query builder to `@kuindji/typed-sql` that is a **drop-in
replacement** for the runtime query-builder API of the predecessor package
`@kuindji/sql-type-parser`. Existing user code should keep compiling and
produce **byte-identical SQL** after only changing the package specifier.

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
BuilderReturnType<B>   = GetReturnType<BuilderSQL<B>, Schema>      (core)
validation (builder)   = ValidateSQL<BuilderSQL<B>, Schema>       (core, via ValidQueryBuilder)
validation (per method) = Validate*Part<fragment, Schema>          (core, optional localized errors)

toString() / assembleSelectSQL(state)  → runtime SQL string (byte-identical to old)
```

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
- Reuse existing schema fixtures (`ecommerce-schema.ts`, etc.). Optionally
  adapt the old `examples/select/*` as smoke fixtures.

## Known risks & fallback strategy

The previous repo *started* with SQL-string reduction; these are the failure
modes that can push toward heavier machinery. We accept them as documented
tradeoffs now, with a clear escalation path.

1. **Non-literal `*If` conditions.** When a `*If` condition is a non-literal
   `boolean`, whether the fragment is present is unknown at type level, so the
   assembled SQL literal degrades to `string` and `BuilderReturnType` falls
   back to `{}`. *Accepted* (type fidelity deprioritized). Possible later
   enhancement: model the fragment as an optional union so `GetReturnType`
   yields `col?: …`.
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
fall back to treating tree-sourced fragments as opaque `string` (degrades
inference for that query only).
