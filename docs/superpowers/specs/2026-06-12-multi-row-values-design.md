# Multi-row VALUES inserts — design

**Date:** 2026-06-12
**Status:** approved

## Goal

Support multi-row `INSERT … VALUES (…), (…)` on both typed surfaces:

1. **Raw typed path** (`createSql` / `ExtractParams`): stop rejecting multi-row
   VALUES with an `__error` type; type every tuple's `:name` params against
   their columns' branded types.
2. **Builder** (`createInsertQuery`): add a `.rows(array)` API that takes
   actual runtime values (schema-typed per column) and expands them to
   `VALUES ($1, $2), ($3, $4)` itself.

## Current state

- `IsMultiRowInsert` in `src/builder/extract-params.ts` detects multi-row
  VALUES (quote/dollar-quote/paren-aware walk, `HasTopLevelTupleSep`) and
  `InsertParams` maps it to
  `{ __error: true; message: "[SQL Error] multi-row VALUES not supported …" }`.
- The insert builder has no multi-row API: `.value(col, text)` builds exactly
  one row.
- `ValidateSQL` / `GetReturnType` on multi-row inserts are already
  lenient/correct (extra tuples are ignored) — no change needed there.

## 1. Raw typed path (`ExtractParams`)

Replace the `__error` arm in `InsertParams` with a per-tuple zip:

- New `MultiRowInsertParams<After, Cols, Table, S>`: walk the post-`VALUES`
  text reusing the same scanning arms as `HasTopLevelTupleSep` (skip
  single-quoted literals incl. `''` escape, skip dollar-quoted strings, track
  paren depth), but **extract each top-level tuple's content** and run the
  existing `ZipInsert<Cols, SplitCommaSimple<Tuple>, Table, S>` on it,
  intersecting the results across tuples. `values (:u1, :a1), (:u2, :a2)`
  binds all four params to their columns' branded types.
- `IsMultiRowInsert` stays as the cheap dispatch gate: single-row inserts keep
  today's exact path — zero added cost for the common case.
- **Tuple cap ~12**, tail-count audited per the chunking contract (helper
  chains multiply per jump; see depth-pressure round 11 lessons). Tuples
  beyond the cap — or any walk overrun (unterminated quote, unbalanced
  parens) — degrade the *remaining* text to the loose `DriverParamValue`
  sweep (`LooseParams`). Never an error — lenient-overrun design contract.
- `ON CONFLICT … DO UPDATE SET` and trailing `WHERE` param extraction stay
  intersected exactly as today (they operate on the whole normalized string,
  independent of the tuple walk).

## 2. Builder: `.rows(array)`

```ts
const q = createInsertQuery<Schema>()
  .into("orders")
  .rows([
    { userId: u1, amount: 100 },
    { userId: u2, amount: 250 },
  ])
  .returning("id");

q.toString();   // insert into orders (userId, amount) values ($1, $2), ($3, $4) returning id
q.getParams();  // [u1, 100, u2, 250]
```

### Runtime (`write-state.ts`, `insert.ts`, `write-assemble.ts`)

- New state field `rows: ReadonlyArray<Record<string, DriverParamValue>>`.
- Column list = the **first row's keys in insertion order**; every row is read
  in that order.
- Assembly emits a synthetic named param per cell (`:__tsqlrow_<r>_<c>`) and
  merges the cell values into the param map handed to the existing scanner —
  `$N` numbering, `assertAllProvided`, and `getParams` ordering all come for
  free from the existing machinery.
- Assemble-time throws (matching the existing "INSERT has no columns" style):
  - empty rows array;
  - a row missing a column from the first row's key set (a silent
    `undefined` param is worse than a throw);
  - `.rows()` combined with `.value()`/`.valueIf()` or `.fromSelect()`.

### Type level (`write-tag.ts`)

- `InsertTag` gains a `rows` member carrying the inferred row type
  (and the empty tag/state defaults update accordingly).
- `BuildInsertSQL` renders the rows form as
  `insert into <table> (<cols-from-row-keys>) values (…)` with a
  **placeholder-free representative tuple** — `ExtractParams` over the built
  string then contributes nothing for the rows themselves (their values are
  passed directly, not as named params), while `onConflict` text keeps its
  `:param` typing and `WriteReturnFor` works unchanged.
- `rows()` signature: a single generic `Row` inferred from the array element
  type. Keys must be existing columns of the `.into()` table
  (excess keys → compile error); values must match the branded column types;
  all elements share the one `Row` type (homogeneity enforced by the single
  generic).
- `withParams({})` remains the way to get a `BoundWrite` when no other clause
  carries `:names` — same as today's zero-param writes.

## 3. Tests

- `tests/builder/types/extract-params.test.ts`: flip `MR1`/`MR4` from
  `__error` pins to precise param expectations; keep the literal /
  dollar-quote / comment `),(` non-multi-row pins (`MR2`, `MR3`, `MR5`–`MR7`);
  add a cap-degrade pin and a branded-type-rejection pin for a tuple ≥ 2.
- New builder tests: `.rows()` SQL text + `getParams()` ordering, combination
  with `returning` / `onConflict`, the three runtime throws, and compile-time
  pins (excess key, wrong branded type, heterogeneous rows).

## 4. Docs

- README: drop the "Multi-row VALUES is rejected in the typed path" line;
  document both surfaces (raw multi-row `:param` typing + `.rows()`).
- CONTRIBUTING: record the tuple-cap → loose-degrade contract.

## 5. Verification gate

`npm run typecheck` (deterministic ×2), `bun test`, `npm run perf` —
re-record the perf baseline only if growth is intentional and justified.

## Out of scope

- `ValidateSQL` strictness for tuple arity mismatches (stays lenient by
  contract).
- `ExplainSQL` diagnostic type (the other half of pending item 5 — separate
  effort).
- Multi-row support in UPDATE/DELETE builders (no such SQL form).
