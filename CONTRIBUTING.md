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
- **Probing types:** never run `tsc` on a standalone probe file (see
  [Verifying nullability](#verifying-nullability-when-probing-types)).

---

## Design contracts

These are deliberate rules. Behavior that follows them is **correct by design**,
even when it looks conservative or incomplete.

### Conservative typing — ambiguous ⇒ `unknown`

The inferrer types an expression **only when its type is unambiguous**. When it
isn't, the result is `unknown` rather than a guess.

- `||` (string concat) → `string`.
- **Literals widen to their base type** — `select 'GBP' as cur` → `{ cur: string }`,
  `select 42 as n` → `{ n: number }`, `select true as ok` → `{ ok: boolean }` —
  *not* `{ cur: "GBP" }` / `{ n: 42 }` / `{ ok: true }`. (This is a deliberate
  choice; do not "fix" it back to a literal type. A projected literal is constant
  per row, so the literal type would be *more* precise — but locked literals break
  consumers: a `useState`/mutable binding/component prop typed `42` or `true`
  rejects every other value. Widen by default; recover precision with an explicit
  cast at the call site when you actually want it.)
- `CASE`, unmodeled functions, and other ambiguous expressions → `unknown`.
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

### Nullability model

- Column nullability comes from the schema (`T | null`).
- **Outer joins** add `| null` to columns sourced from the nullable side
  (`left join … x` ⇒ `x.col` becomes `T | null`).
- This join-nullability is applied to projected columns **and** to columns nested
  inside `coalesce(...)`: `coalesce(a, b, c)` is nullable if **every** argument is
  nullable (Postgres semantics — `coalesce` is `NULL` only when all args are), so a
  non-null literal (`coalesce(x, '')`) keeps the result non-null.

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
| A `CASE` / unknown function projects as `unknown` | **Intended.** Conservative typing — ambiguous ⇒ `unknown`. |
| Some invalid-looking SQL is reported `true` by `ValidateSQL` | **Often intended.** Lenient parser biases away from false rejections. |
| A column inside `coalesce(...)` under a left join is `T \| null` | **Intended & correct.** Coalesce is nullable iff all args are. |
| A projected literal widens to its base type instead of staying precise | **Intended.** Widen-by-default; cast at the call site to recover the literal. |
| A step cap is hit and the result widens on a huge query | **Intended.** Depth-limit guard, not a parse failure. |
| "Why not just recurse deeper / raise `Steps extends N`?" | Doing so blows `TS2589`. Use the chunked-driver pattern. |
| `selectIf(cond, "x")` makes `x` optional even when `cond` is clearly true | **Intended.** Types can't read a runtime boolean; conditional ⇒ optional (max view). |
| A `joinIf` table's columns are typed as present though the join is conditional | **Intended.** Clause-`*If` infers the max view; only conditional *selects* optionalize columns. |
| `\| null` (join) and `?:` / `\| undefined` (`selectIf`) treated as interchangeable | **No.** present-but-`null` ≠ maybe-absent. See the README's "Two kinds of maybe missing". |
| All-`selectIf` builder (no plain `select`) types every column optional | **Intended.** The all-false runtime path is `SELECT *` → `Partial<…>`. |

## Verifying nullability when probing types

Running `tsc` on a standalone probe file **disables `strictNullChecks`**, which
collapses `string | null` to `string` and makes every null assertion lie. Always
probe under the project's strict config — e.g. add a temp test and run the full
`npx tsc --noEmit` — not a one-off `tsc probe.ts`.
