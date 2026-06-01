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
3. **`AnyBuilderSqlTag` / `AnyBuilderStateTag` removed** — generic helper
   signatures (e.g. `setPeriod`) that constrained on these must switch to
   `AnySqlTag` and drop the `State` parameter (see Generic builder helpers).
   The exported `AnySqlTag` is the replacement upper bound.
4. **`QueryResult` not re-exported** — consumers using `QueryResult<Q, Schema>`
   (the string-query row type) switch to `SelectResult<Q, Schema>`, which is
   the kept equivalent.
5. **`from(parameterized-subquery)` now throws** (the one *runtime* divergence).
   The old package produced a buggy string (colliding `$1`, dropped inner
   params); the new builder fails fast instead (see Runtime behavior). Only
   affects callers that embed a subquery builder carrying params —
   param-free subqueries are byte-identical.
6. **Invalid SQL inside a `*If` fragment now fails to compile** (type-level
   only; no runtime change). The old package erased *every* conditional call
   (`selectIf`/`whereIf`/`joinIf`/…, regardless of the condition) to
   `SelectQueryBuilder<Schema, any, any>`, collapsing the row type to `any` and
   skipping validation — so a malformed column in a conditional fragment was
   silently swallowed. The new builder keeps conditionals **fully typed** and
   validates the maximal query (see Conditional typing), so an invalid *literal*
   column in a `*If` fragment is now reported. This only surfaces latent bugs
   (unreachable or malformed SQL); valid conditional fragments compile
   unchanged. This is a deliberate improvement, not a regression — exact
   replication of the old `any`-erasure would defeat the conditional-typing
   feature.

Runtime call sites of the typed builder are otherwise unaffected. We are
**not** shipping deprecated aliases/shims for (1)–(4) now; if real migration
friction appears, a phantom third parameter (runtime no-op), re-exported
untyped names, and `QueryResult`/`AnyBuilder*Tag` aliases can be added without
further design.

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
  └─ type:     append fragment to the lean `Sql` tag (condition erased;
               `selectIf`/`applyIf` flag their projected keys conditional)

BuilderSQL<B>          = assemble the `Sql` tag into a literal SQL string,
                         treating every `*If` fragment as present
                         (raw `:name` param form — see Canonical SQL forms)
BuilderReturnType<B>   = partition GetReturnType over MaxSQL / ReqSQL / ScopeSQL subsets
                         (selectIf/applyIf keys become `?`/`| undefined` — see Conditional typing)
validation (builder)   = ValidQueryBuilder<Schema, B>             (narrow allow-unknown guard, NOT bare ValidateSQL)
validation (per method) = Validate*Part<fragment, Schema>          (core, optional localized errors)

toString() / assembleSelectSQL(state)  → runtime SQL string ($n param form, byte-identical to old)
```

### Conditional typing — runtime-erased, `selectIf`/`applyIf` optionalize

Type calculation **never branches on a runtime value.** Every `*If` fragment
is treated at the type level as if its condition were `true`, so the canonical
type-level SQL is always the **maximal** query (all fragments present) and
`BuilderSQL<B>` is always a known literal — regardless of whether a condition
is a literal or a dynamic `boolean`. For building that string, `where` ≡
`whereIf` and `select` ≡ `selectIf`.

The **only** type-level effect of conditionality is on the **projected
columns**: a conditionally-selected column may be absent at runtime, so it is
typed optional (`col?: T` / `T | undefined`). `where`/`group`/`order`/`limit`/
`join` conditionality does not change the column set, so it has no effect on the
row type (it only ever matters to validation, which is also runtime-independent).

Optionality is resolved **without a second projection resolver**. Each select
fragment is tagged **unconditional** (`select`, or a `select` inside an
unconditional `apply`) or **conditional** (`selectIf`, or any projection
introduced by `applyIf`). The builder then runs the core's `GetReturnType` over
up to **three assembled strings**, all built from the *same* final `Sql` tag by
filtering on that flag — so every key name and type comes from the one resolver
(star expansion, alias resolution, expression auto-naming via `ExprKey`), and
the required/optional split is just a set difference over its outputs:

```
hasUncond = ∃ an unconditional select fragment
MaxSQL    = BuilderSQL<B>                      // all select fragments present (maximal query)
ReqSQL    = assemble with ONLY unconditional select fragments
ScopeSQL  = assemble with SELECT * over the FROM/JOIN sources (no select list)

if hasUncond:
    Row    = GetReturnType<MaxSQL,  Schema>     // every possible key + type
    ReqRow = GetReturnType<ReqSQL,  Schema>     // exactly the guaranteed keys
    BuilderReturnType<B> =
          { [k in keyof ReqRow]:            Row[k] }   // required
        & { [k in keyof Row \ keyof ReqRow]?: Row[k] } // conditional-only projections → optional

else:                                           // no unconditional select → all-false runtime path is SELECT *
    Row      = GetReturnType<MaxSQL,   Schema>  // conditional projection keys
    ScopeRow = GetReturnType<ScopeSQL, Schema>  // the full FROM/JOIN row (the `*` fallback)
    BuilderReturnType<B> = Partial<Row & ScopeRow>     // nothing guaranteed → all optional
```

- **Required** iff the key appears in `ReqRow` — i.e. some unconditional
  `select` projects it, guaranteeing presence whatever the conditionals
  evaluate to. **Optional** otherwise.
- **Value type** is `Row[k]` — whatever `GetReturnType` resolves for the
  maximal query. We do **not** hand-build a union; deferring to the core keeps
  types consistent with the rest of the type system and with runtime (`pg`
  collapses duplicate output names last-column-wins, the same rule
  `GetReturnType` applies).
- Because `keyof ReqRow` and `keyof Row` are both produced by `GetReturnType`,
  the partition is **byte-consistent by construction** — there is no separate
  `SelectKeys` resolver that could name `count(*)` differently from the core
  and silently mistag a guaranteed column as optional. The `Sql` tag only
  *flags* fragments; it never re-derives their output names.

The rule is **order-independent**: `select("i.id")` puts `id` in `ReqSQL`, so
`id` is required whether the `selectIf("i.*")` comes before or after it. (This
supersedes the earlier "last wins" wording — a later *conditional* re-projection
cannot remove the guarantee an earlier *unconditional* `select` already gives.)

**Differently-typed shared aliases** (e.g. `select("i.id AS x")` +
`selectIf(c, "i.name AS x")`) are a documented edge: `x`'s type follows
`GetReturnType<MaxSQL>`'s collapse of the duplicate alias (matching `pg`'s
last-column-wins, i.e. the all-conditions-on branch), not the all-off branch.
Use distinct aliases when a conditional projection differs in type from the base
column; the spec does not special-case this.

`apply` vs `applyIf` differ only by the **tag** they stamp on the fragments
inside. `apply` runs unconditionally — its plain `select`s are tagged
unconditional (and so appear in `ReqSQL`); a `selectIf` inside it stays
conditional. `applyIf` runs conditionally — **every** select it introduces is
tagged conditional (excluded from `ReqSQL`), so an `applyIf` column is required
only if some *other* unconditional fragment also projects it. To know which
fragments a transform introduced (so they can be tagged), `apply`/`applyIf`
capture the transform's **output `Sql` tag** as an inferred type param
(`applyIf<Sql2>(cond, fn: (b: SelectQueryBuilder<S, Sql>) =>
SelectQueryBuilder<S, Sql2>)`). This is **pay-for-use** — pure
`select`/`selectIf`/`where` chains need only the single `MaxSQL` pass (see
Risk #2).

**`removeSelect` rewrites the tag.** `removeSelect(id)` drops that fragment from
the `Sql` tag itself (not a mask), so `MaxSQL`/`ReqSQL`/`ScopeSQL` are all
re-assembled without it and the partition reflects the removal. An
`apply`/`applyIf` whose transform calls `removeSelect` shrinks `Sql2`; because
the three strings are assembled from the *final* tag (not from an additive
key-diff), the removal is honored — the captured `Sql2` is used only to tag
*newly introduced* fragments, never to model removals.

**Fragment-id reuse across conditional/unconditional producers.** Reusing a
select id — `select(A, "x")` then `applyIf(c, b => b.select(B, "x"))` —
overwrites the `Sql`-tag slot `x` with the later fragment, carrying that call's
conditional flag. This matches runtime: a select keyed by an existing id
replaces the prior one, and the last write to an id wins when its condition
holds (runtime-false leaves the earlier fragment in place). Because the
maximal-query model assembles only the *surviving* slot, when a **conditional**
producer overwrites an **unconditional** one the earlier fragment's keys leave
`ReqSQL` and type as optional — even though the runtime-false path would keep
them. This is a **documented-precision edge** (parallel to differently-typed
shared aliases above): **use distinct ids when a conditional producer should not
erase an unconditional one's guarantee.** With distinct ids both fragments
coexist in the tag and the partition is exact — the unconditional key stays
required, the conditional key optional. (The old package sidestepped this
entirely: `applyIf` was a type no-op that returned its input builder type, so
the transform's selects were invisible to the type. The new design tracks them,
which is what makes this edge expressible.)

**Boundary:** column optionality is governed only by
`select`/`selectIf`/`apply`/`applyIf`, never by `joinIf`. Unconditionally
selecting a column from a *conditionally-joined* table types it required and
the maximal-query validation will not flag it (the maximal query includes the
join). Pair `joinIf(cond, …)` with `selectIf(cond, "j.col")` for correct
typing.

### Canonical SQL forms (two distinct strings)

`BuilderSQL<B>` and `toString()`/`toBrandedString()` are **not** guaranteed to
be byte-equal once named params are used:

- **`BuilderSQL<B>` (type level):** the assembled literal in **raw `:name`
  form**, because `withParams` deliberately does not feed the `Sql` tag (the
  type tag has no param map to compute placeholder order). This is the
  canonical type-level SQL used for inference/validation. `:name` vs `$n` is
  irrelevant to `GetReturnType`/`ValidateSQL` because a param only ever appears
  in positions the core treats leniently — predicate RHS, `LIMIT`/`OFFSET`
  operands, `IN (...)` lists, function args — and a `:name` token has no dot, so
  it is never parsed as a qualified column ref (confirmed by the F4 tests, not
  assumed). Matches the old package's `BuilderSQL`.
- **`toString()` (runtime):** the executed string with `:name` expanded to
  `$1, $2, …`. This is what reaches the database and is byte-identical to the
  old package's output.

The spec treats these as two intentionally different artifacts; tests assert
each against its own expected string, never against each other.

### `ValidQueryBuilder` — per-fragment validity + narrow allow-unknown

Because conditions are erased at the type level (see Conditional typing),
`BuilderSQL<B>` is a known literal for the common case and the whole maximal
query is validated by `ValidateSQL<BuilderSQL<B>, Schema>`.

When a fragment's *SQL text itself* is non-literal (a `from(dynamicString)` or
a tree-sourced opaque fragment), the assembled `BuilderSQL<B>` widens to
`string`, and `ValidateSQL<string, Schema>` is `false` by design in the core
(`string extends Query ? false`, src/index.ts). A naive whole-query check would
then **reject** the builder even though it is runtime-valid. But blanket-
*accepting* on any dynamic fragment is equally wrong: it would let an invalid
**literal** sibling — a misspelled select column next to one dynamic fragment —
slip through unvalidated. So validity is **per-fragment, then combined**: the
builder type carries, for each fragment, the verdict of the core's
`Validate*Part<fragment, Schema>`.

```
ValidQueryBuilder<Schema, B> =
    FragmentErrors<B, Schema> extends []      // no per-fragment (literal) errors
        ? BuilderSQL<B> extends infer SQL extends string
            ? string extends SQL              // some fragment text non-literal → whole query unknown
                ? B                            //   → allow, untyped (BuilderReturnType = {})
                : ValidateSQL<SQL, Schema> extends true
                    ? B                        //   → known & valid
                    : `[SQL Error] ${...}`     //   → known & invalid: reject
            : B
        : `[SQL Error] ${FragmentErrors<B, Schema>[number]}`;  // a literal fragment is invalid
```

`FragmentErrors<B, Schema>` runs `Validate*Part` over the **literal** fragments
only (dynamic fragments are skipped → unknown, not error). A dynamic fragment
drops the *whole-query* check to allow-unknown but does not suppress
per-fragment validation of its literal siblings.

**Documented limitation — per-fragment validation is weak.** The per-clause
`Validate*Part` validators run with no table/alias scope (`partial.ts`:
`ValidateClausePart` uses `Tables = never, Aliases = never`). In that mode
`ColumnRefValidPartialWith` validates **only** refs it can resolve in isolation:
`schema.table.col` and **real-table-qualified** `table.col` (where `table` is a
real table in the default schema). It **skips** (treats as valid):

- **alias-qualified** refs — `i.id` where `i` is a `FROM`/`JOIN` alias (the
  *dominant* builder form), because the alias is out of fragment scope;
- **bare** columns — `name`;
- `prefix.*`.

So once any dynamic fragment turns the whole-query check off, an invalid
**alias-qualified or bare** literal column **will compile** — only invalid
**real-table-/schema-qualified** columns are still caught. The bounded price of
allow-unknown is therefore larger than "literal siblings are safe": in a mixed
builder, validation of typical alias-qualified columns effectively disappears.
Builders with **no** dynamic fragment are unaffected (full `ValidateSQL`).

The guard is unnecessary for the `createSelectFn` **string** overload
(`ValidQuery<Q>`): a non-literal `string` query cannot be typed at all, so
rejecting it is acceptable and matches old behavior. The guard applies
specifically to the **builder** overload.

The lean `Sql` tag mirrors only the **SQL side** of the old `BuilderSqlTag`
(ordered fragments per clause), with each select fragment flagged conditional
vs unconditional and keyed by id. It carries no output-key resolver of its own —
`MaxSQL`/`ReqSQL`/`ScopeSQL` are assembled from it by filtering, and
`GetReturnType` recovers all key names. It is assembled into a literal **lazily
inside `BuilderSQL<B>`**, not recomputed on every method call, to limit
instantiation depth.

### Why this is enough

- Row inference: `GetReturnType` already handles SELECT lists, joins,
  aliases, expressions, CTEs, set ops — far beyond the old `State` track; the
  optionalization fold layers conditional-column nullability on top.
- Conditionals are **fully typed**, not degraded: erasing the condition keeps
  `BuilderSQL` literal, and `selectIf`/`applyIf` columns surface as `?` / `|
  undefined`. There is no `{}` fallback for conditionals — only for non-literal
  fragment *text* (see `ValidQueryBuilder`).
- Generic helpers compose: a `setPeriod`-style helper adds `whereIf` fragments
  that do not touch the column set, so it threads the caller's `Sql` tag
  through (tuple-spread) and the caller still gets the full row type — no
  `State`/`AnyBuilder*Tag` generics, no `untypedSelect` fallback (see Generic
  builder helpers).
- Validation: `ValidateSQL` covers the maximal query; `Validate*Part`
  gives early, localized feedback on individual fragments.
- Runtime: identical SQL because `assembleSelectSQL` and the param expander
  are ported verbatim.

## Module layout (`src/builder/`)

| File | Contents |
|---|---|
| `params.ts` | `QueryParamValue`, `QueryParamInput`; named `:name` → `$n` expansion helpers (shared by select builder + conditional SQL). **Array expansion (`QueryParamInput`) is builder-only:** conditional SQL keeps its old **scalar-only** signature (`processParams`/`conditionalSQL` accept `Record<string, QueryParamValue>`, no arrays) for parity — sharing the module must not widen it. |
| `condition-tree.ts` | `ConditionTreeBuilder` class + `createConditionTree`. Type param tracks the rendered string literal so `where(tree)` keeps `BuilderSQL` precise. |
| `state.ts` | `RuntimeSelectState` interface + `EMPTY_RUNTIME_STATE`. |
| `assemble.ts` | `assembleSelectSQL(state)` — ported verbatim (WITH/SELECT[/DISTINCT]/FROM/JOINs/WHERE/GROUP BY/HAVING/ORDER BY/LIMIT/OFFSET/UNION ordering, then named-param substitution). |
| `sql-tag.ts` | Lean type-level fragment tag (each select fragment flagged conditional vs unconditional, keyed by id) + `BuildSQL<Sql, Mode>` that assembles it to a literal string mirroring `assembleSelectSQL`'s ordering, where `Mode` selects `MaxSQL` (all selects) / `ReqSQL` (unconditional selects only) / `ScopeSQL` (`SELECT *`). Also `AnySqlTag` (upper bound for generic helpers). No output-key resolver — names come from `GetReturnType`. |
| `select.ts` | `SelectQueryBuilder` interface, `createSelectQuery`, and the immutable impl class (clone-per-method). `apply`/`applyIf` capture the transform's output `Sql` tag as an inferred type param to *tag* newly-introduced select fragments (conditional under `applyIf`). |
| `db.ts` | `createSelectFn`, `ValidQuery`, `ValidQueryBuilder`, `FragmentErrors`, `SelectResult(Array)`, `SelectBuilderResult(Array)`, `MergeOverrides`, `IsValidSelect`, `QueryHandler`. |
| `conditional-sql.ts` | `createConditionalQuery`, `conditionalSQL`, `processConditionalSQL`, `processParams`, `normalizeWhitespace`, `withConditions`. |
| `return-type.ts` | `BuilderSQL<B>` (= `MaxSQL`), `BuilderReturnType<B>` (the required/optional partition over `GetReturnType<MaxSQL>` / `GetReturnType<ReqSQL>` / `GetReturnType<ScopeSQL>`), `BuilderResultBrand`. |
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

### Generic builder helpers (`setPeriod`, filter appliers)

Helpers that take a builder of *unknown* accumulated SQL and add clauses are a
first-class case — they were the main reason the old package fell back to
`untypedSelect` and `AnyBuilder*Tag` casts. Under the single lean `Sql` tag
they are written with two generics and tuple-spread the appended fragments:

```ts
function setPeriod<S extends DatabaseSchema, Sql extends AnySqlTag>(
    b: SelectQueryBuilder<S, Sql>,
    period: Period,
    field: string,
): SelectQueryBuilder<S, /* Sql + the whereIf fragments */> {
    return b
        .whereIf(/* between */ ...)
        .whereIf(/* >= */ ...)
        .whereIf(/* <= */ ...);
}
```

Because `whereIf` fragments do not project columns, the result's column set is
unchanged; the caller instantiates `Sql` concretely and keeps **full row
inference** through the helper. `AnySqlTag` (exported) is the upper bound for
"any builder" and replaces the removed `AnyBuilderSqlTag` / `AnyBuilderStateTag`.
A helper that adds `selectIf`/`applyIf` columns propagates their optionality via
the same fold.

## Runtime behavior (ported verbatim)

- **Immutability:** every method returns a new builder over a cloned
  `RuntimeSelectState`; fragments are keyed by id (auto-generated
  `select_0`, `join_0`, … when no id given) so `removeSelect`/`removeJoin`
  and id-overwrite semantics match.
- **`*If` methods (`selectIf`, `whereIf`, `applyIf`, …):** at **runtime** the
  boolean is honored — a false condition omits the fragment from the executed
  SQL (matches old). At the **type level** the condition is erased (the
  fragment is always recorded in the `Sql` tag); `selectIf`/`applyIf`
  additionally flag the fragment **conditional** so `BuilderReturnType` keeps it
  out of `ReqSQL` and optionalizes its columns (see Conditional typing). This
  type/runtime split is intentional and
  pinned by tests.
- **`assembleSelectSQL`:** clause ordering, uppercase keywords, empty-clause
  skipping, default `SELECT *`, `SELECT DISTINCT` when `state.distinct`,
  JOINs emitted in `joins[]` order, WHERE/HAVING joined with `AND`,
  GROUP BY/ORDER BY joined with `, `. `distinct`/`ctes`/`union` exist in
  state but are not surfaced by fluent methods (matches old).
- **Named params:** `:name` (regex `:([a-zA-Z_][a-zA-Z0-9_]*)(?![a-zA-Z0-9_])`,
  ported verbatim — the trailing negative lookahead stops a short param like
  `:te` from clobbering a longer `:text`), ordered by first appearance; array
  values expand to `$n, $n+1, …`; `getParams()` flattens arrays in placeholder
  order. `withParams` merges and intentionally does **not** touch the `Sql` tag
  (avoids depth blowup on long chains). **Cast-collision is intentional
  parity:** the regex matches the second colon of a PostgreSQL `::cast`, so
  `id::text` with a param named `text` expands to `id:$n`. The old package has
  the identical behavior; it is ported as-is (changing it would alter emitted
  SQL and break byte-identical output). Pinned by a test, not silently relied
  on.
- **`from(subquery-builder)`:** runtime embeds `(${source.toString()})`;
  type-level subquery inference is punted (matches old). Param-free subqueries
  embed correctly. **Parameterized subqueries throw** (`fail fast`, not silent
  wrong output): because the inner `toString()` has already expanded the inner
  builder's `:name` params to `$1, $2, …` *relative to the inner query*, and
  those positionals are not merged into the outer builder's param set, an
  inner+outer mix would double-assign `$1` and drop the inner params from the
  outer `getParams()` — a query that fails or silently misbehaves at the DB.
  Rather than ship that, `from(builder)` checks `builder.getParams()` and
  **throws** when the inner builder carries params (clear message naming the
  unsupported case). This makes nested param merging/reindexing a deliberate
  future feature, not a silent bug. (If merge/reindex is wanted now, it
  replaces the throw — see Open questions.)
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
  processing (nested, negated, dotted conditions; param mapping). Assert
  `conditionalSQL`/`processParams` remain **scalar-only** (`QueryParamValue`):
  a type-level check that an array value is rejected there (array expansion is
  builder-only), preserving old parity.
- **Type-level:** for all-required queries `BuilderReturnType<typeof builder>`
  equals `GetReturnType<BuilderSQL<typeof builder>, Schema>`; `BuilderSQL`
  equals the expected literal (with `*If` fragments present); `createSelectFn`
  rejects invalid queries/builders (`@ts-expect-error`) and infers row arrays
  for valid ones; `MergeOverrides` applies overrides and errors on unknown keys.
- **Conditional typing (selectIf/applyIf):** assert a `selectIf` column is
  typed `?` / `| undefined` while sibling `select` columns stay required —
  with a **non-literal** boolean condition (proves no runtime branching).
  Pin order-independence both ways: `selectIf("i.*")` then `select("i.id")`
  **and** the reverse — in **both**, `id` is **required** (it is in `ReqSQL`)
  and the rest optional. Assert `BuilderReturnType` equals the partition derived
  from `GetReturnType<MaxSQL>` / `GetReturnType<ReqSQL>` for a representative
  query (the partition uses the core resolver, not a separate `SelectKeys`).
  Include an **expression key** case (`select("count(*)")` unconditional stays
  required — guards the F-B naming-consistency risk). For `apply`, a `select`
  inside the transform yields a **required** column; for `applyIf`, a **new**
  column is optional while a column an unconditional fragment already guarantees
  stays **required**. Cover the **differently-typed shared-alias** edge: assert
  the type follows `GetReturnType<MaxSQL>`'s alias collapse (documented).
- **Default-`*` fallback (F-A):** `from("users").selectIf(cond, "id")` (no
  unconditional select) types as `Partial<UsersRow & { id: ... }>` — every scope
  column **and** the conditional key, all optional (the all-false runtime path
  is `SELECT *`, derived via `GetReturnType<ScopeSQL>`). Adding an unconditional
  `select` removes the `*` fallback and narrows it (sibling `selectIf` cols stay
  optional).
- **`removeSelect` + conditional (F-G):** `select("u.id")` then
  `removeSelect("...")` then `selectIf(cond, "u.id")` → after removal the only
  producer is conditional, so `id` is **optional**; assert `MaxSQL`/`ReqSQL`
  reflect the rewritten tag (removal honored, not masked).
- **Fragment-id reuse (F-G2):** `select("u.id", "x")` then
  `applyIf(cond, b => b.select("u.name", "x"))` → the conditional overwrite of
  slot `x` removes `id` from `ReqSQL`, so `id` types **optional** (documented
  edge); assert that the same chain with a **distinct** id keeps `id`
  **required** and types the new column optional.
- **Generic helper (`setPeriod` / F-helper):** a helper
  `<S, Sql extends AnySqlTag>(b) => b.whereIf(...).whereIf(...)` preserves the
  caller's full row type — call it on a concrete builder and assert the
  inferred row equals the un-helped builder's row (proves no `{}` collapse, no
  `AnyBuilder*Tag`).
- **Non-literal fragment text (allow-unknown / F3):** a builder whose fragment
  *text* is non-literal (e.g. `from(someString)`) is **accepted** by
  `createSelectFn` (compiles) with row type `{}` — assert it is not rejected.
  Also assert a builder with a genuinely invalid **literal** column/table **is**
  rejected (`@ts-expect-error`). **Mixed case (F-C):** with one dynamic fragment
  present, an invalid **real-table-qualified** column (`users.notacol`) **is
  still rejected** (`@ts-expect-error`); but an invalid **alias-qualified**
  column (`u.notacol`, `from("users u")`) **compiles** — assert it is *not*
  rejected and add a comment that alias-qualified/bare literals are unprotected
  in mixed builders (per-fragment validation runs without alias scope).
- **Two SQL forms (F4):** for a builder with named params, assert `BuilderSQL`
  equals the raw `:name` literal **and** `toString()` equals the `$n`-expanded
  string — i.e. they intentionally differ.
- **Param-regex edges (F4b):** pin the ported lookahead — `:te` and `:text` as
  distinct params don't cross-clobber — **and** the intentional `::cast`
  collision: `select("u.id::text").withParams({ text: ... })` expands the cast's
  second colon (parity with old; documents the ported quirk).
- **Parameterized subquery (F2):** assert `from(innerBuilder)` **throws** when
  the inner builder carries params, and that a **param-free** subquery embeds
  correctly (`(${inner.toString()})`).
- Reuse existing schema fixtures (`ecommerce-schema.ts`, etc.). Optionally
  adapt the old `examples/select/*` as smoke fixtures.

## Known risks & fallback strategy

The previous repo *started* with SQL-string reduction; these are the failure
modes that can push toward heavier machinery. We accept them as documented
tradeoffs now, with a clear escalation path.

1. **Non-literal fragment *text*.** A non-literal `*If` **condition** is no
   longer a risk — conditions are erased at the type level, so the SQL stays a
   known literal and conditionals are fully typed (see Conditional typing). The
   residual case is a non-literal **fragment string** (e.g. `from(dynamic)`),
   which widens `BuilderSQL<B>` to `string` → `BuilderReturnType` is `{}`. *The
   builder is still accepted* via `ValidQueryBuilder`'s allow-unknown guard —
   untyped, not rejected.
2. **Instantiation depth on long chains.** Accumulating a large SQL literal
   across many calls can approach TS depth limits (the core already carries
   TS2589 mitigations). *Mitigation:* keep the `Sql` tag a flat fragment list
   and assemble only inside `BuilderSQL<B>`; `withParams` stays out of the tag.
   Conditional typing runs `GetReturnType` up to **three** times (`MaxSQL`,
   plus `ReqSQL` *or* `ScopeSQL`) — but only when conditional selects exist; a
   pure all-required builder needs the single `MaxSQL` pass and no partition.
   `GetReturnType` is the same optimized core call each time, so the cost is a
   small constant multiple, **pay-for-use**. A long-chain `setPeriod` +
   filter-applier composition with conditional selects is the acceptance
   benchmark (the founding "more performant" bet).
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

**Parameterized-subquery `from()`:** currently throws (see Runtime behavior).
If a real need appears, replace the throw with param **merge/reindex** — the
outer `from(builder)` would re-key the inner builder's `:name` params into the
outer set and renumber `$n` positionally across the combined query. Deferred
because no current consumer embeds a parameterized subquery; promoting it is a
conscious feature add, not a silent fix.
