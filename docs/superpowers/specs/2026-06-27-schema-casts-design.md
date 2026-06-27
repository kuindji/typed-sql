# Schema-declared cast types (`casts`) — design

**Date:** 2026-06-27
**Status:** implemented (in-repo). Remaining: §7 end-to-end against Vigilocity
(out-of-repo consumer via the `file://` link).

## Goal

Let a schema teach typed-sql how to type a cast `expr::T` whose target `T` the
built-in scalar map can't resolve (custom `CREATE TYPE`/`CREATE DOMAIN` names, or
the deliberately-uninformative `json`/`jsonb`). Two complementary, layered maps:

1. **`schema.casts`** — a top-level `Record<castTypeName, TsType>` on
   `DatabaseSchema`. Keyed by the cast's target type name alone: `citext → string`,
   `geometry → Geometry`, a domain, an enum union. The per-schema, non-global
   counterpart to the augmentable `PgTypeOverrides`.
2. **`functions[name].casts`** — a `Record<castTypeName, TsType>` on a function
   signature. For cast targets that are determinate only in combination with a
   specific function: `ST_AsGeoJSON(...)::json → Point | null`, where `::json`
   alone (`some_col::json`) is genuinely ambiguous.

This **supersedes the unpublished `ModeledFnCastReturn` heuristic** (commit
`5c2611c`, never published): "an uninformative cast over a modeled function falls
back to the function's `returns`." Replacing an implicit rule with an explicit
declaration is both clearer and more correct — see Current state.

## Current state

- `DatabaseSchema` (`src/schema.ts`) has `schemas`, `defaultSchema`, and the
  optional `functions?: Record<string, FunctionSignature>`. `FunctionSignature`
  is `{ returns: any; params?: readonly any[] }`.
- Cast resolution lives in `ExprTypeCascade` (`src/expressions.ts`): a top-level
  `Inner::CastName` and the `cast(Inner as CastName)` / `cast (Inner as CastName)`
  forms each resolve the target via `SqlTypeToTs<CastName>` →
  `SqlScalarToTs` → `PgTypeOverrides` ⊕ `DefaultScalarToTs`. `json`/`jsonb` map to
  `unknown` there; an unknown/custom name also falls through to `unknown`.
- `ModeledFnCastReturn<Inner, CastName, S>` (unpublished, `5c2611c`) special-cases
  the json muddle: `IsUnknown<SqlTypeToTs<CastName>>` true **and** `Inner` is a
  call to a modeled function ⇒ `SchemaFunctionReturn<fn, S>` wins; else `never`
  (keep the cast). Wired into both cast branches; `Point | null` nullability rides
  the declared `returns`.
- **The muddle it introduces:** `ST_AsGeoJSON.returns` is authored as the *post-*
  `::json` shape (`Point | null`), but `returns` is also what the **bare** call
  resolves to (`SchemaFunctionReturn` on the no-cast path). So `ST_AsGeoJSON(x)`
  *without* the cast infers `Point | null` today, while at runtime a bare
  `ST_AsGeoJSON` returns GeoJSON **text** (a string). Latent because every call
  site casts — but unsound. The `casts` split makes `returns` honest (the bare
  result) and moves the casted shape to `casts.json`.
- `IsUnknown<T> = unknown extends T ? true : false` (`src/utils.ts`) — its only
  consumer is `ModeledFnCastReturn`.
- Tests T12–T17 in `tests/query-result/select/schema-function-returns.test.ts`
  pin the heuristic; the `st_asgeojson` fixture fn lives in
  `tests/fixtures/parser-schemas.ts`.

## 1. Schema shape

```ts
export type FunctionSignature = {
  returns: any;
  params?: readonly any[];
  casts?: Record<string, any>;   // NEW: cast target name → TS type FOR THIS fn
};

export type DatabaseSchema = {
  defaultSchema: string;
  schemas: Record<string, Record<string, Record<string, any>>>;
  functions?: Record<string, FunctionSignature>;
  casts?: Record<string, any>;   // NEW: cast target name → TS type (schema-wide)
};
```

Consumer authoring (the geo case, restated honestly):

```ts
functions: {
  ST_AsGeoJSON: {
    returns: string,                 // bare call: GeoJSON text
    casts: { json: Point | null, jsonb: Point | null },
  },
},
casts: {
  citext: string,
  geometry: Geometry,                // a custom CREATE TYPE
  // mood: "happy" | "sad",          // an enum domain, etc.
},
```

Both are optional and add no cost when absent (see §5). A schema with **no
`functions`** resolves every cast byte-identically to today. A schema that
**declares `functions` but relies on the `ModeledFnCastReturn` heuristic** is
*not* unchanged: retiring that heuristic (§3) means `modeled_fn()::json` no longer
falls back to the function's `returns` and resolves to `unknown` unless the
function adds a `casts.json` entry. That migration is intentional and safe only
because `5c2611c` is unpublished — see §3.

## 2. Resolution algorithm

A new schema-threaded `CastTypeToTs<Inner, CastName, S, …ctx>` owns cast-target
resolution and is wired into **both** cast branches in `ExprTypeCascade` (the
`Inner::CastName` arm and the two `cast(… as CastName)` arms), replacing the
inline `ModeledFnCastReturn`/`SqlTypeToTs` calls. Precedence for `Inner::CastName`:

1. **Per-function cast** — `CleanExpr<Inner>` is a call `Func(…)` **and**
   `FunctionCastType<CleanIdent<Func>, CastName, S>` is declared ⇒ use it. Most
   specific; **wins even over a built-in `CastName`** (an explicit per-fn entry is
   deliberate intent, e.g. someone modeling `fn(x)::text` as a branded string).
2. **Schema-global cast** — `SchemaCastType<Base, S>` is declared for the
   array-decomposed **base** name (see normalization) **and** the built-in map is
   uninformative for that base (`IsUnknown<SqlScalarToTs<Base>>`) ⇒ use it,
   re-wrapping `[]` if the cast was an array. **The gate is computed on the
   decomposed base, not the raw `CastName`** — `SqlTypeToTs<"geometry[]">` is
   `unknown[]` and `IsUnknown<unknown[]>` is `false`, so gating on the array form
   would wrongly skip a `casts.geometry` entry for `::geometry[]`. Array
   decomposition and chain-stripping therefore happen **before** the uninformative
   check and the map lookup. The uninformative gate keeps built-ins authoritative:
   `schema.casts` can name `citext`/`geometry`/a domain (which map to `unknown`)
   but cannot silently redefine `::text`. (Built-in *remaps* for a
   differently-configured driver stay the job of `PgTypeOverrides` — the two are
   complementary, not redundant.)
3. **Built-in** — `SqlTypeToTs<CastName>` exactly as today (`PgTypeOverrides` ⊕
   `DefaultScalarToTs`, array `[]` wrapping, `unknown` fallback).

`SqlTypeToTs` (which has no `S` in scope) is unchanged and remains the resolver
for contexts without a schema; `CastTypeToTs` is the schema-aware superset used
only where the cascade already threads `S`.

### Resolver types (`src/schema.ts`)

Mirror `SchemaFunctionSig`/`SchemaFunctionReturn` — case-insensitive name match
via `MatchKeyCaseInsensitive`, `[X] extends [never]` guards so an absent map /
missing key short-circuits to `never` (caller falls through), never distributing:

```ts
type SchemaCastType<Name, S>            // S["casts"][Name] | never
type FunctionCastType<Func, Name, S>    // S["functions"][Func]["casts"][Name] | never
```

### Cast-name normalization

`CastName` is normalized once before lookup (new `NormalizeCastKey`, reusing
`NormalizeTypeName`'s lowering). `OuterCastName<E>` returns the **whole** chained
tail (`OuterCastName<"a::text::geometry">` → `"text::geometry"`; the built-in
`SqlTypeToTs` already strips it last-wins), so normalization must reduce it to the
final target before any map lookup. In order:

- **chained casts** — strip everything up to and including the last top-level
  `::`, so `text::geometry` → `geometry` (last cast wins, mirroring
  `SqlTypeToTs`). Without this, `fn(x)::text::geometry` / `expr::text::json` would
  never match a `geometry`/`json` entry. Do this **first**, before the array and
  qualifier steps.
- **case-insensitive** — `::JSON` and `::json` match key `json`.
- **unqualified** — `::public.geometry` matches key `geometry` (mirrors the
  unqualified function-name match; consistent with `SqlTypeToTs` dropping a
  schema qualifier).
- **array** — `::geometry[]` resolves base `geometry` through the casts maps then
  wraps `[]`, mirroring `SqlTypeToTs`'s array arm. A `casts.geometry` entry
  therefore covers `::geometry[]` automatically (no separate `geometry[]` key).
  The base is what feeds both the uninformative gate (step 2) and the map lookup;
  the `[]` is re-applied to the resolved type.

### Nullability

The two map kinds differ, because a per-function entry is keyed by a *specific
call* while a schema-global entry must serve every inner expression:

- **Per-function cast (step 1) — authoritative.** Carries its own nullability
  (`Point | null`), exactly like `returns` on the bare path; the matched arm does
  **not** re-apply `CastInnerFnIsNullable`. The author knows the one function this
  describes, so `ST_AsGeoJSON(loc)::json` is `Point | null` whether or not `loc`
  is nullable — the function's contract decides.

- **Schema-global cast (step 2) — inner nullability as far as the existing cast
  machinery sees it.** A single `casts.geometry → Geometry` entry must serve every
  inner, so author it as the **non-null base** and let the matched arm re-apply
  nullability through **exactly the same paths an informative built-in cast already
  uses today** — no more, no less:
  - a **bare nullable ref** (`nullable_col::geometry`) and the **join-null**
    post-pass propagate `| null` (→ `Geometry | null`);
  - a **schema-declared nullable function** as inner
    (`convert_currency(...)::geometry`) propagates via `CastInnerFnIsNullable`.

  This is **NOT comprehensive nullability inference.** The same gaps an
  informative built-in cast has today are inherited unchanged — and are *not*
  regressions, since these inners already type non-null under `::text` etc.:
  - a **built-in function** inner (`lower(nullable_col)::citext`) — `lower` isn't
    schema-declared, so `CastInnerFnIsNullable` is `false` → `string`, non-null;
  - a **parenthesized** ref (`(nullable_col)::geometry`) — not a simple ref, and
    `CleanExpr` finds no function name → non-null;
  - **nullable arithmetic** (`(a + b)::geometry`) → non-null.

  Recover precision in those shapes with `coalesce`, a per-function `casts` entry,
  or an explicit nullable cast target. Authoring the global entry as
  `Geometry | null` is the wrong fix — it makes *every* cast to that type
  nullable, including the genuinely non-null ones.

Unmatched casts keep today's behavior: an informative cast still propagates
`| null` via `CastInnerFnIsNullable` (`convert_currency(...)::float8 → number |
null`); an uninformative one with no `casts` entry stays `unknown`.

## 3. Retire the `ModeledFnCastReturn` heuristic

Because `5c2611c` is **unpublished**, nothing released depends on the heuristic —
it can be replaced wholesale before `0.9.3` ships, with zero published-consumer
impact:

- Remove `ModeledFnCastReturn`; route both cast branches through `CastTypeToTs`.
- `IsUnknown` stays in `utils.ts` (now consumed by precedence step 2).
- The geo fixture/consumer migrates from `returns: Point|null` to
  `returns: string` + `casts: { json: Point|null }`. This also corrects the bare
  `ST_AsGeoJSON(x)` projection to `string` (the Current-state soundness gap).

## 4. Tests

`tests/query-result/select/schema-function-returns.test.ts` (rework T12–T17 +
additions):

- **Per-function cast:** `ST_AsGeoJSON(loc)::json` → `Point | null`;
  `…::jsonb` → same; bare `ST_AsGeoJSON(loc)` → `string` (regression pin for the
  fixed soundness gap); `…::text` real cast → `string` (built-in still wins when
  no per-fn `text` entry); a per-fn entry that **overrides** a built-in
  (`fn(x)::text` → a branded string) to lock step-1 precedence.
- **Schema-global cast:** `col::citext` → `string`; `col::geometry` → `Geometry`;
  `col::geometry[]` → `Geometry[]` (array wrap, pins finding-2 ordering);
  `col::PUBLIC.GEOMETRY` → `Geometry` (qualified + case-insensitive); `col::text`
  unaffected by a `casts` map (built-in wins; uninformative gate);
  `nullable_col::geometry` → `Geometry | null` and `non_nullable_col::geometry` →
  `Geometry` from the *same* entry (pins the step-2 inner-nullability rule);
  `expr::text::geometry` → `Geometry` (chained-cast strip to final target).
- **Schema-global cast — nullability gaps (pin as known limitations, mirroring
  built-in casts):** `lower(nullable_col)::citext` → `string` (built-in fn inner,
  non-null); `(nullable_col)::geometry` → `Geometry` (parenthesized ref, non-null);
  `(a + b)::geometry` over nullable operands → `Geometry` (arithmetic, non-null).
  Each pins that the global path does **not** over-promise null propagation;
  `coalesce(...)` / a per-fn entry is the documented recovery.
- **Functional `CAST(... AS ...)` global cast:** `CAST(col AS geometry)` →
  `Geometry`; `CAST(col AS geometry[])` → `Geometry[]`;
  `CAST(col AS public.geometry)` → `Geometry` — the global path must work through
  the `cast(… as …)` arms, not just `::`.
- **Adversarial / backward-compat:** `not_a_col::json` → `never` (a simple-ref
  invalid inner is rejected by the `extends never` guard *before* any `casts`
  lookup, matching the existing `not_a_col::text` → `never` pin in
  `tests/query-result/select/casts.test.ts`); `col::json` with no matching
  fn/global entry → `unknown` (unchanged); a schema with no `casts` and no
  `functions` → every cast resolves exactly as before; `nullable_col::json`
  null-propagation paths unchanged where no entry matches.

`tests/fixtures/parser-schemas.ts`: update `st_asgeojson` to the `returns:
string` + `casts` shape; add a fixture custom type (`Geometry`) + a top-level
`casts` map + an array/qualified case.

## 5. Performance

- Cost is incurred **only on cast expressions** and only past the existing
  branch dispatch. The replaced `ModeledFnCastReturn` already did one schema
  lookup; the new path adds at most one more (`functions[fn].casts` then
  `schema.casts`), each a `MatchKeyCaseInsensitive` indexed access gated by a
  `[never]` short-circuit.
- The no-`casts`-map common case must be zero-cost: gate each map with
  `[keyof Map] extends [never] ? never : …` (the `SqlScalarToTsWith` pattern), so
  a schema without the field never instantiates the lookup.
- `npm run perf` is the gate; re-record the baseline only if the (small,
  cast-only) growth is intentional and justified per CONTRIBUTING's depth/perf
  contract.

## 6. Docs

- README: a "Custom cast types" section — `schema.casts` for custom/`DOMAIN`
  types, `functions[].casts` for function-qualified casts (the geo example);
  note `PgTypeOverrides` remains the lever for *built-in* driver remaps.
- CONTRIBUTING: the three-step precedence, the normalization rules, and the
  built-ins-win (uninformative-gate) decision for `schema.casts`.
- CHANGELOG: feature entry; call out that it supersedes the unpublished
  `ModeledFnCastReturn` and that bare modeled-fn projections now reflect `returns`
  (a fix, not a break, since the heuristic was never published).

## 7. Verification gate

`npm run typecheck` (deterministic ×2), `npm run typecheck:snc`, `bun test`,
`npm run perf`. Then end-to-end against Vigilocity via the existing `file://`
link: drop the bespoke geo wiring (`functionTypes.ts` → `casts`), keep
`ipGeo.ts` on plain `db.select(q)`, re-verify the 6 apps + packages.

## Out of scope

- `params` argument-type validation (the existing reserved, unused field).
- Argument-*dependent* cast results (a function whose `::json` shape varies by
  which overload/args) — `casts` is keyed by target type only.
- `PgTypeOverrides` removal — it stays as the global built-in-remap mechanism;
  `schema.casts` is additive and names custom types, not a replacement.
- Validating that a declared cast target actually exists in the database.
