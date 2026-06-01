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

Runtime call sites of the typed builder are unaffected. We are **not**
shipping deprecated aliases/shims for (1)–(4) now; if real migration friction
appears, a phantom third parameter (runtime no-op), re-exported untyped names,
and `QueryResult`/`AnyBuilder*Tag` aliases can be added without further design.

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
BuilderReturnType<B>   = optionalize(GetReturnType<BuilderSQL<B>, Schema>, OptionalKeys<B>)
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

Optionality is resolved **per output column name**, grounded in runtime
guarantees — **not** "last wins". Each select fragment is a *producer* of one
or more output keys (after star expansion against the schema, and after
`removeSelect`), tagged **unconditional** (`select`, or a `select` inside an
unconditional `apply`) or **conditional** (`selectIf`, or any projection
introduced by `applyIf`):

```
per output key k:
  producers(k) = select fragments emitting k (each tagged conditional | unconditional)
  required(k)  = ∃ p ∈ producers(k): p is unconditional   // a guarantee no condition can remove
  type(k)      = ⋃ { valueType(p) : p ∈ producers(k) }

Row = GetReturnType<BuilderSQL<B>, Schema>     // resolves stars / aliases / exprs → types
BuilderReturnType<B> =
      { [k in keyof Row :  required(k)]:  type(k) }
    & { [k in keyof Row : !required(k)]?: type(k) }
```

- **Required** iff *any* producer is unconditional — an unconditional `select`
  guarantees the column is present whatever the conditionals evaluate to.
- **Optional** (`?` / `| undefined`) iff *every* producer is conditional.
- **Value type** is the **union** of all producers' value types. In the common
  case (a member column plus an overlapping same-table star, e.g.
  `select("i.id")` + `selectIf("i.*")`) every producer is `i.id`, so the union
  collapses to one type; a union only appears when two differently-typed
  expressions share one output alias (runtime returns one of them depending on
  the condition, so the union is the sound type).

The rule is **order-independent**. `selectIf("i.*")` then `select("i.id")` →
`id` has an unconditional producer → required; every other `i` column is
conditional-only → optional. **Reversed** — `select("i.id")` then
`selectIf("i.*")` → `id` *still* has the unconditional producer → **required**
(runtime always selects `i.id`); the rest optional.

> This supersedes the earlier "last wins" wording: a later *conditional*
> re-projection cannot remove the guarantee of an earlier *unconditional* one,
> so the reversed case is **not** "everything optional" — `id` stays required.

`apply` vs `applyIf` differ by the **conditionality context** they impose on
the fragments inside. `apply` runs unconditionally: a plain `select` inside it
is an unconditional producer (required), a `selectIf` inside it stays
conditional. `applyIf` runs conditionally: **every** projection it introduces
is a conditional producer, so a column it adds is required only if some *other*
unconditional fragment also projects it — otherwise optional. `applyIf` is thus
monotonic: it can add optional columns but never downgrade a column an
unconditional fragment already guarantees.

**Default `SELECT *` and all-conditional select lists.** Runtime keeps the
ported behavior — an empty select list emits `SELECT *`. So if **every** select
fragment is conditional (no unconditional `select`), the all-conditions-false
runtime path emits `SELECT *` (the full scope row) while other paths return
subsets. No column can be guaranteed, so the sound type is **every in-scope
column plus every conditional projection key, all optional**
(`Partial<scopeRow & conditionalProjections>`). To get a narrowed, partly-
required row, include at least one **unconditional** `select` — it both anchors
the projection and removes the `*` fallback. A builder with **no** `select*`
call at all keeps the existing full-row (`SELECT *`, all required) typing.

To resolve producers for `apply`/`applyIf`, the builder captures the
transform's **output `Sql` tag** as an inferred type parameter
(`applyIf<Sql2>(cond, fn: (b: SelectQueryBuilder<S, Sql>) =>
SelectQueryBuilder<S, Sql2>)`); the producers it introduces are
`SelectKeys<Sql2> \ SelectKeys<Sql>` — tagged **conditional** when the wrapper
is `applyIf`, and per their inner `select`/`selectIf` tag when the wrapper is
`apply`. This key-set diff (with star expansion, folded across the chain) is the
heaviest part of the type machinery and is **pay-for-use** — pure
`select`/`selectIf`/`where` chains never trigger it (see Risk #2).

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
  irrelevant to `GetReturnType`/`ValidateSQL` because a param sits on the
  opaque RHS of a predicate. Matches the old package's `BuilderSQL`.
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
therefore drops only the *whole-query* check to allow-unknown; it does **not**
suppress validation of its literal siblings — a known-invalid literal column is
still rejected.

**Documented limitation:** the per-clause `Validate*Part` validators are
intentionally leaner than whole-query `ValidateSQL` (lenient on bare /
alias-qualified refs that need cross-clause scope to resolve). So when a dynamic
fragment forces the whole-query check off, a literal error that *only* the
whole-query validator would catch can still slip through. This is the bounded
price of allow-unknown — it applies only to builders mixing dynamic and literal
fragments.

The guard is unnecessary for the `createSelectFn` **string** overload
(`ValidQuery<Q>`): a non-literal `string` query cannot be typed at all, so
rejecting it is acceptable and matches old behavior. The guard applies
specifically to the **builder** overload.

The lean `Sql` tag mirrors only the **SQL side** of the old `BuilderSqlTag`
(ordered fragments per clause), with each fragment flagged plain vs conditional
and `selectIf`/`applyIf` carrying enough to recover their output keys. It is
assembled into a literal **lazily inside `BuilderSQL<B>`**, not recomputed on
every method call, to limit instantiation depth.

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
| `params.ts` | `QueryParamValue`, `QueryParamInput`; named `:name` → `$n` expansion helpers (shared by select builder + conditional SQL). |
| `condition-tree.ts` | `ConditionTreeBuilder` class + `createConditionTree`. Type param tracks the rendered string literal so `where(tree)` keeps `BuilderSQL` precise. |
| `state.ts` | `RuntimeSelectState` interface + `EMPTY_RUNTIME_STATE`. |
| `assemble.ts` | `assembleSelectSQL(state)` — ported verbatim (WITH/SELECT[/DISTINCT]/FROM/JOINs/WHERE/GROUP BY/HAVING/ORDER BY/LIMIT/OFFSET/UNION ordering, then named-param substitution). |
| `sql-tag.ts` | Lean type-level fragment tag (each fragment flagged plain vs conditional; `selectIf`/`applyIf` carry their projection text) + `BuildSQL<Sql>` that assembles it to a literal string mirroring `assembleSelectSQL`'s ordering. Also `AnySqlTag` (upper bound for generic helpers) and `SelectKeys<Sql>` / per-fragment star-expanding key resolution. |
| `select.ts` | `SelectQueryBuilder` interface, `createSelectQuery`, and the immutable impl class (clone-per-method). `apply`/`applyIf` capture the transform's output `Sql` tag as an inferred type param for the key-set diff. |
| `db.ts` | `createSelectFn`, `ValidQuery`, `ValidQueryBuilder`, `SelectResult(Array)`, `SelectBuilderResult(Array)`, `MergeOverrides`, `IsValidSelect`, `QueryHandler`. |
| `conditional-sql.ts` | `createConditionalQuery`, `conditionalSQL`, `processConditionalSQL`, `processParams`, `normalizeWhitespace`, `withConditions`. |
| `return-type.ts` | `BuilderSQL<B>`, `BuilderReturnType<B>` (incl. the `OptionalKeys<B>` fold + optionalization pass), `OptionalKeys<B>`, `BuilderResultBrand`. |
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
  additionally flag their projected keys so `BuilderReturnType` optionalizes
  them (see Conditional typing). This type/runtime split is intentional and
  pinned by tests.
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
  processing (nested, negated, dotted conditions; param mapping).
- **Type-level:** for all-required queries `BuilderReturnType<typeof builder>`
  equals `GetReturnType<BuilderSQL<typeof builder>, Schema>`; `BuilderSQL`
  equals the expected literal (with `*If` fragments present); `createSelectFn`
  rejects invalid queries/builders (`@ts-expect-error`) and infers row arrays
  for valid ones; `MergeOverrides` applies overrides and errors on unknown keys.
- **Conditional typing (selectIf/applyIf):** assert a `selectIf` column is
  typed `?` / `| undefined` while sibling `select` columns stay required —
  with a **non-literal** boolean condition (proves no runtime branching).
  Pin the order-independence both ways: `selectIf("i.*")` then `select("i.id")`
  **and** the reverse — in **both**, `id` is **required** and the rest optional
  (an unconditional producer wins regardless of order). Assert the value-type
  **union** when two differently-typed exprs share one alias. For `apply`, a
  `select` inside the transform yields a **required** column; for `applyIf`, a
  **new** column is optional while a column an unconditional fragment already
  guarantees stays **required**.
- **Default-`*` fallback:** `from("users").selectIf(cond, "id")` (no
  unconditional select) types as `Partial<UsersRow & { id: ... }>` (all
  optional — the all-false runtime path is `SELECT *`); adding an unconditional
  `select` narrows it (and `id` from a sibling `selectIf` stays optional).
- **Generic helper (`setPeriod` / F-helper):** a helper
  `<S, Sql extends AnySqlTag>(b) => b.whereIf(...).whereIf(...)` preserves the
  caller's full row type — call it on a concrete builder and assert the
  inferred row equals the un-helped builder's row (proves no `{}` collapse, no
  `AnyBuilder*Tag`).
- **Non-literal fragment text (allow-unknown / F3):** a builder whose fragment
  *text* is non-literal (e.g. `from(someString)`) is **accepted** by
  `createSelectFn` (compiles) with row type `{}` — assert it is not rejected.
  Also assert a builder with a genuinely invalid **literal** column/table **is**
  rejected (`@ts-expect-error`). **Mixed case:** a builder with one dynamic
  fragment **and** a literal invalid select column is **still rejected**
  (`@ts-expect-error`) — the dynamic sibling does not suppress per-fragment
  validation of the literal one.
- **Two SQL forms (F4):** for a builder with named params, assert `BuilderSQL`
  equals the raw `:name` literal **and** `toString()` equals the `$n`-expanded
  string — i.e. they intentionally differ.
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
   and assemble only inside `BuilderSQL<B>`; `withParams` stays out of the tag;
   the `OptionalKeys` fold runs once inside `BuilderReturnType`. The heaviest
   sub-case is the `apply`/`applyIf` key-set diff (it instantiates the
   transform's output tag) — **pay-for-use**, untouched by pure
   `select`/`selectIf`/`where` chains. A long-chain `setPeriod` + filter-applier
   composition is the acceptance benchmark (the founding "more performant" bet).
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
