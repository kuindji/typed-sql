# Scope-aware fragment validation for the query builder

**Date:** 2026-06-03
**Status:** Approved (design) — pending implementation
**Scope:** Builder path only (`createSelectQuery` / `ValidQueryBuilder`). Raw-string
`ValidateSQL<"…">` / `GetReturnType<"…">` usage is explicitly out of scope.

## Problem

TheFloorr cannot integrate typed-sql: certain builder queries blow TypeScript's
instantiation/recursion limit (`TS2589`). An integration agent bisected the cause
against the real schema:

- The whole-query `ValidateSQL` pass that `ValidQueryBuilder` runs on the assembled
  SQL string (`src/builder/db.ts:103`) is the primary depth driver — that is the
  path that runs today and fails.
- Within per-fragment validation (the cheap path), **SELECT-fragment validation is
  itself a depth driver** on heavy projections. FROM/JOIN/WHERE/GROUP/HAVING/ORDER
  per-fragment validation are all depth-safe.
- Retention gap: current per-fragment validation skips **alias-qualified column
  typos** in WHERE/GROUP/SELECT, because the clause validators
  (`ValidateClausePart`, `src/partial.ts:123`) are called with `Tables=never,
  Aliases=never` — the alias→table binding lives in the FROM/JOIN fragments and is
  never threaded into clause validation. So a bare `l."typo"` is unresolvable in
  isolation and gets skipped.

The whole-query pass catches these typos precisely *because* it has full scope —
which is exactly what makes it expensive.

## Goal

Make per-fragment validation **scope-aware and depth-safe**, recovering the
alias-qualified-column-typo class, and demote the expensive whole-query
`ValidateSQL` pass to a **size-gated bonus** for small queries only.

## Key realization shaping the design

`SelectErrors` (`src/builder/db.ts:37`) runs the heavy `ValidateSelectPart`
(`NormalizeQuery` → `TokenizeLoose` → ref extraction) over every projection. The
bisect shows *that itself* blows depth on the ~11 heavy expressions, **independent
of scope**. Therefore "scope-aware SELECT" **cannot** be built by threading scope
into the existing SELECT validator — that is strictly heavier than the path that
already blows. It must use a genuinely lighter extraction (see component 3).

By contrast, WHERE/GROUP/HAVING/ORDER fragments are short; the existing
machinery stays depth-safe when scope is threaded in. Only SELECT needs a new,
lighter path.

## Architecture

All changes are in the builder validation layer: `src/partial.ts` and
`src/builder/db.ts` (plus a thin reuse of existing `parsing/` split helpers and
`tables.ts` / `columns.ts` collectors). The result-type tower
(`BuilderReturnType` → `GetReturnType` over the assembled string) is unchanged —
the bisect already showed it is depth-safe.

### Component 1 — Scope map (built once per query)

Concatenate the `from` fragment text + every `join` fragment text into a single
from-clause-shaped string, then derive:

- `Tables` via `TablesInQuery<…, S>`
- `Aliases` via `AliasesInQuery<…, S>`

These are the same depth-safe collectors `ValidateTableSourcePart`
(`src/partial.ts:90`) already uses per-fragment; here they run over the combined
FROM+JOIN text so the map covers the whole query's table scope. JOIN texts include
`on …` conditions, which these collectors already tolerate (they key off
join/table keywords).

### Component 2 — Scope-aware WHERE / GROUP / HAVING / ORDER

Add scoped clause validators that thread the real `Tables`/`Aliases` from the scope
map into `QualifiedColumnRefsValidPartialFor<S, Tables, Aliases, Toks>`
(`src/partial.ts:74`) — which already accepts these parameters but is currently fed
`never, never` by `ValidateClausePart`. With the real map, `PartialResolvePrefix`
(`src/partial.ts:32`) resolves alias-qualified refs, so `u."typo"` in WHERE/GROUP is
finally validated. These fragments are short → depth-safe (agent-confirmed).

### Component 3 — Identifiers-only SELECT (the depth-sensitive piece)

Replace the heavy `SelectErrors`. Do **not** normalize/tokenize projection
expression bodies. Instead:

1. Split the SELECT list at **top-level commas** using the existing depth-safe
   `SplitTopLevel` / `MarkTopLevelCommas` (`src/parsing/tokenize.ts`).
2. For each item: strip a trailing `as <alias>`. If the remainder is a **simple
   `prefix.col` shape** — exactly one dot, no parentheses, operators, spaces, or
   `*` — resolve it via `ColumnRefValidPartialWith` (`src/partial.ts:51`) against
   the scope map. Otherwise (function call, `CASE`, cast, literal, `*`, any
   expression) → **skip**.
3. Step-cap / chunk over the item list.

Net effect: `select u.typo, …` is caught; `coalesce(o.b, '')` / `case … end` item
internals are never normalized, so heavy projections cost ~one shape-test each.
This is what makes scope-aware SELECT depth-safe.

### Component 4 — Size-gated dispatch in `ValidQueryBuilder`

`FragmentErrors` (now fully scope-aware via components 1–3, and depth-safe) runs
**always**, on both paths. Then:

- Assemble `BuilderSQL<B>`.
- If the assembled SQL is a **literal** string **and** its char length is **≤ a
  conservative threshold** → *also* run the full whole-query `ValidateSQL` for
  maximum precision (current behavior, retained for small queries).
- If the assembled SQL is **larger** than the threshold → rely on the scope-aware
  fragment validation alone (skip the whole-query pass).
- If any fragment text is non-literal `string` → allow-unknown (unchanged).

The threshold is a **char-length heuristic**, consistent with the project's
existing length-gating elsewhere, tuned empirically against the heavy fixture and
set conservatively below where the whole-query pass blows. It is documented as
tunable.

Contract change (intended): `src/partial.ts`'s current "each fragment validated in
pure isolation, cross-fragment refs skipped" contract is relaxed — clause/SELECT
fragments are now validated against a scope map built from FROM+JOIN. The
file-header comment in `partial.ts` is updated to reflect this.

## Data flow

```
SelectQueryBuilder (SqlTag fragments)
        │
        ├─ from + joins ──► Scope map { Tables, Aliases }   (component 1)
        │
        ├─ FragmentErrors (ALWAYS, depth-safe):
        │     ├─ FROM/JOIN: strict table existence + in-scope refs (unchanged)
        │     ├─ WHERE/GROUP/HAVING/ORDER: scope-aware ref check (component 2)
        │     └─ SELECT: identifiers-only scope-aware check       (component 3)
        │
        └─ ValidQueryBuilder dispatch (component 4):
              FragmentErrors non-empty ──► [SQL Error] …
              else assembled SQL:
                 non-literal           ──► allow-unknown
                 literal & ≤ threshold ──► + whole-query ValidateSQL
                 literal & > threshold ──► fragments only
```

## Testing & verification

- **Heavy fixture** mirroring TheFloorr's blow-up shape (several joins, ~11 heavy
  projections with CASE/coalesce/casts, alias-qualified refs in WHERE/GROUP) that
  **currently `TS2589`s** through `ValidQueryBuilder`. Assert it type-checks
  cleanly and the inferred result type is intact.
- **Retention assertions**: injected alias-qualified typos (`u."nope"`) in WHERE,
  GROUP, and SELECT each produce a `[SQL Error]`; valid siblings stay clean.
- **Regression**: full `bun` suite + `tsc --noEmit` ×3 (deterministic), watching
  for boolean flips on existing builder pins.

## Open risk & failure protocol

The agent flagged scope-aware SELECT as *the* depth risk. Component 3's
split-and-shape-test sidesteps it by never normalizing expression bodies, so it
*should* be safe.

**Verification gate:** if the heavy fixture still blows depth with identifiers-only
SELECT enabled, we do **not** ship a degraded SELECT-skipping variant. Instead:
**revert the change, record the findings (what was tried, where depth was spent,
trace data) to memory and this doc, stop, and reconsider the approach.**

## Out of scope

- Raw-string `ValidateSQL<"…">` / `GetReturnType<"…">` usage (TheFloorr is
  builder-only).
- The result-type tower (`BuilderReturnType`) — already depth-safe.
- Any change to the whole-query `ValidateSQL` engine itself.
