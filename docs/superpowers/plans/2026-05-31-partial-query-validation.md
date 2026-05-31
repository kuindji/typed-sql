# Partial Query Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-clause "partial query" validation entry points so a future query builder can validate a fragment (SELECT list, FROM, JOIN, WHERE, HAVING, GROUP BY, ORDER BY) in isolation, checking table/column existence while silently skipping references it cannot resolve within the fragment.

**Architecture:** A new `src/partial.ts` module reuses the existing tokenizer, table/alias collectors, and qualified-ref collector. The only new behavior is a *partial resolution rule*: a qualified ref whose prefix resolves to an alias/table defined in the fragment (or a real schema-qualified table) is validated strictly; an unresolvable prefix and any bare/unqualified column are skipped (treated valid). Table names in FROM/JOIN parts are validated strictly. Each clause gets its own thin entry-point type — no part-detection step.

**Tech Stack:** Pure TypeScript type-level programming. Tests are `Expect<Equal<...>>` assertions checked by `tsc --noEmit` (`npm run typecheck`).

---

## Background: why these choices

Reference the design doc at `docs/superpowers/specs/2026-05-31-partial-query-validation-design.md`.

Key facts about the existing code this plan builds on:

- `NormalizeQuery<S>` (`src/parsing.ts:3`) lowercases (outside quotes), strips block comments, collapses whitespace. Run every fragment through it first.
- `TablesInQuery<N, S>` / `AliasesInQuery<N, S>` (`src/tables.ts:6,9`) collect table keys (`"public.users"`) and alias entries (`"o=>public.orders"`) by scanning for `from`/`join`/`update`/`into` keywords. They work directly on a `from ...` or `... join ...` fragment.
- `TokenizeLoose<N>` (`src/parsing.ts:539`) splits into tokens preserving dots, so `users.id` stays one token.
- `QualifiedColumnRefs<Tokens, S, Tables, Aliases>` (`src/columns.ts:167`) collects dotted tokens that are column-ref candidates (skipping the table token right after `from`/`join`). It does not itself use `Tables`/`Aliases`, so passing `never` is safe.
- `ResolveAlias<Name, Aliases>` (`src/columns.ts:266`) and `TableKeysByName<Name, Tables>` (`src/columns.ts:273`) return a table key or `never`.
- `TableExists<S, Schema, Table>` (`src/schema.ts:68`) and `ColumnExists<TableKey, Column, S>` (`src/schema.ts:71`) are the strict existence checks.
- `TableKeyValid<Key, S>` (`src/tables.ts:12`) is `TableExists` for a full `"schema.table"` key.
- The full-query resolver (`ResolveTableKey`, `src/columns.ts:256`) ALWAYS falls back to `${defaultSchema}.${Name}` — this is exactly the phantom-table behavior we must NOT reuse for partials.

All imports below are type-only and point at lower-level modules (`parsing`, `columns`, `tables`, `schema`, `utils`) — `partial.ts` must NOT import from `validation.ts` (keeps the dependency graph clean and avoids the heavy validator types).

---

## File Structure

- **Create:** `src/partial.ts` — all partial-resolution types and the seven entry points. One module, one responsibility (fragment validation).
- **Modify:** `src/index.ts` — re-export the seven entry-point types.
- **Create:** `tests/partial/from-part.test.ts`
- **Create:** `tests/partial/join-part.test.ts`
- **Create:** `tests/partial/clause-parts.test.ts`

The shared test schema (copy verbatim into each test file's top):

```typescript
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

type Schema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: { id: number; name: string };
            orders: { id: number; user_id: number; total: number };
        };
    };
};
```

---

## Task 1: Core partial-resolution types + FROM part entry point

**Files:**
- Create: `src/partial.ts`
- Modify: `src/index.ts`
- Test: `tests/partial/from-part.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/partial/from-part.test.ts`:

```typescript
import type { ValidateFromPart } from "../../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

type Schema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: { id: number; name: string };
            orders: { id: number; user_id: number; total: number };
        };
    };
};

// valid table, with and without the leading `from`
type F1 = Expect<Equal<ValidateFromPart<"from users u", Schema>, true>>;
type F2 = Expect<Equal<ValidateFromPart<"users u", Schema>, true>>;

// typo'd table name fails (strict table existence)
type F3 = Expect<Equal<ValidateFromPart<"from userz u", Schema>, false>>;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck`
Expected: FAIL — error in `tests/partial/from-part.test.ts`: `Module '"../../src/index.js"' has no exported member 'ValidateFromPart'`.

- [ ] **Step 3: Create `src/partial.ts` with the core types + FROM entry point**

```typescript
// Partial (fragment) query validation for the query builder. Each clause of a
// query gets its own validation entry point so the builder can validate a
// fragment in isolation. A fragment usually cannot be fully validated — a
// reference whose table/alias is defined in some other (out-of-scope) part is
// SKIPPED, never failed. Only references resolvable within the fragment itself
// (its own tables/aliases, or a real schema-qualified table) are validated.

import type { DatabaseSchema, ColumnExists, TableExists } from "./schema.js";
import type {
    CleanExpr,
    CleanIdent,
    NormalizeQuery,
    SplitOnDotClean,
    TokenizeLoose
} from "./parsing.js";
import type {
    QualifiedColumnRefs,
    ResolveAlias,
    StripDoubleQuotes,
    TableKeysByName
} from "./columns.js";
import type { AliasesInQuery, TableKeyValid, TablesInQuery } from "./tables.js";
import type { AllTrue } from "./utils.js";

// Resolve a qualified-ref prefix to a known table key WITHIN the fragment, or
// `never` when it cannot be resolved (an out-of-scope alias/table -> skip):
//   1. an alias defined in this part
//   2. a table named in this part
//   3. a real table in the default schema with this name
// Unlike the full-query `ResolveTableKey`, there is NO phantom
// `${defaultSchema}.${Name}` fallback for names that are not real tables.
export type PartialResolvePrefix<
    Name extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    [ResolveAlias<CleanIdent<Name>, Aliases>] extends [never]
        ? [TableKeysByName<CleanIdent<Name>, Tables>] extends [never]
            ? TableExists<S, S["defaultSchema"], CleanIdent<Name>> extends true
                ? `${S["defaultSchema"]}.${CleanIdent<Name>}`
                : never
            : TableKeysByName<CleanIdent<Name>, Tables>
        : ResolveAlias<CleanIdent<Name>, Aliases>;

// Validate a single column-ref string in fragment mode:
//   - `prefix.*`        -> skip (no column to validate)
//   - schema.table.col  -> strict if schema.table is real, else skip
//   - prefix.col        -> strict if prefix resolves in-fragment, else skip
//   - bare col          -> skip (may belong to an out-of-fragment table)
export type ColumnRefValidPartialWith<
    ColRef extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    ColRef extends `${string}.*`
        ? true
        : SplitOnDotClean<StripDoubleQuotes<CleanExpr<ColRef>>> extends [infer A extends string, infer B extends string, infer C extends string]
            ? TableExists<S, A, B> extends true
                ? ColumnExists<`${A}.${B}`, C, S>
                : true
            : SplitOnDotClean<StripDoubleQuotes<CleanExpr<ColRef>>> extends [infer A extends string, infer B extends string]
                ? PartialResolvePrefix<A, Tables, Aliases, S> extends infer TK
                    ? [TK] extends [never]
                        ? true
                        : TK extends string
                            ? ColumnExists<TK, B, S>
                            : true
                    : true
                : true;

// Validate every qualified column ref in a token list, partial-mode.
export type QualifiedColumnRefsValidPartialFor<
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    LooseTokens extends string[]
> = QualifiedColumnRefs<LooseTokens, S, Tables, Aliases> extends infer Cols
    ? AllTrue<Cols extends string ? ColumnRefValidPartialWith<Cols, Tables, Aliases, S> : true>
    : true;

// Strict table-existence over every table named in the fragment. Vacuously
// `true` when the fragment names no table (`Tables` is `never`).
export type AllPartTablesValid<Tables extends string, S extends DatabaseSchema> =
    AllTrue<Tables extends string ? TableKeyValid<Tables, S> : true>;

// Shared validator for table-source fragments (FROM / JOIN): every named table
// must exist (strict), and every resolvable qualified ref must check out.
export type ValidateTableSourcePart<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? AllPartTablesValid<Tables, S> extends true
                ? TokenizeLoose<N> extends infer Toks extends string[]
                    ? QualifiedColumnRefsValidPartialFor<S, Tables, Aliases, Toks>
                    : true
                : false
            : true
        : true;

// A FROM fragment may arrive bare (`users u`) or led (`from users u`). The
// table/alias collectors key off the `from` keyword, so ensure it is present.
export type EnsureFromLed<N extends string> =
    N extends `from ${string}` ? N : `from ${N}`;

export type ValidateFromPart<Part extends string, S extends DatabaseSchema> =
    string extends Part
        ? false
        : NormalizeQuery<Part> extends infer N extends string
            ? ValidateTableSourcePart<EnsureFromLed<N>, S>
            : false;
```

- [ ] **Step 4: Re-export from `src/index.ts`**

Add at the end of `src/index.ts`:

```typescript
// Partial (fragment) validation entry points — for the query builder.
export type {
    ValidateFromPart
} from "./partial.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run typecheck`
Expected: PASS — no errors. (`F1`/`F2`/`F3` compile, meaning each `Expect<Equal<...>>` held.)

- [ ] **Step 6: Commit**

```bash
git add src/partial.ts src/index.ts tests/partial/from-part.test.ts
git commit -m "Add partial FROM-part validation + core partial-resolution types"
```

---

## Task 2: JOIN part entry point

**Files:**
- Modify: `src/partial.ts` (append `ValidateJoinPart`)
- Modify: `src/index.ts` (add to re-export)
- Test: `tests/partial/join-part.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/partial/join-part.test.ts`:

```typescript
import type { ValidateJoinPart } from "../../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

type Schema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: { id: number; name: string };
            orders: { id: number; user_id: number; total: number };
        };
    };
};

// joined alias `o` resolves to orders; `o.id` valid, `b.id` (out-of-part) skipped
type J1 = Expect<Equal<ValidateJoinPart<"left join orders o on o.id = b.id", Schema>, true>>;

// `o.bad` is a real-but-wrong column on the joined table -> fail
type J2 = Expect<Equal<ValidateJoinPart<"left join orders o on o.bad = b.id", Schema>, false>>;

// typo'd joined table -> fail
type J3 = Expect<Equal<ValidateJoinPart<"left join ordrs o on o.id = b.id", Schema>, false>>;

// unaliased keyword form; `u.id` (out-of-part) skipped, `o.user_id` valid
type J4 = Expect<Equal<ValidateJoinPart<"join orders o on o.user_id = u.id", Schema>, true>>;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck`
Expected: FAIL — `Module '"../../src/index.js"' has no exported member 'ValidateJoinPart'`.

- [ ] **Step 3: Append `ValidateJoinPart` to `src/partial.ts`**

A JOIN fragment already contains the `join` keyword, so the collectors find its table/alias with no rewriting:

```typescript
export type ValidateJoinPart<Part extends string, S extends DatabaseSchema> =
    string extends Part
        ? false
        : NormalizeQuery<Part> extends infer N extends string
            ? ValidateTableSourcePart<N, S>
            : false;
```

- [ ] **Step 4: Add to the `src/index.ts` re-export**

Update the partial re-export block to:

```typescript
// Partial (fragment) validation entry points — for the query builder.
export type {
    ValidateFromPart,
    ValidateJoinPart
} from "./partial.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 6: Commit**

```bash
git add src/partial.ts src/index.ts tests/partial/join-part.test.ts
git commit -m "Add partial JOIN-part validation"
```

---

## Task 3: Clause part entry points (SELECT / WHERE / HAVING / GROUP BY / ORDER BY)

**Files:**
- Modify: `src/partial.ts` (append `ValidateClausePart` + five entry points)
- Modify: `src/index.ts` (add five to re-export)
- Test: `tests/partial/clause-parts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/partial/clause-parts.test.ts`:

```typescript
import type {
    ValidateSelectPart,
    ValidateWherePart,
    ValidateHavingPart,
    ValidateGroupByPart,
    ValidateOrderByPart
} from "../../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

type Schema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: { id: number; name: string };
            orders: { id: number; user_id: number; total: number };
        };
    };
};

// SELECT: alias-qualified + function are skipped; real-table refs validated
type S1 = Expect<Equal<ValidateSelectPart<"select t.id, count(*) as n", Schema>, true>>;
type S2 = Expect<Equal<ValidateSelectPart<"select users.id, users.name", Schema>, true>>;
type S3 = Expect<Equal<ValidateSelectPart<"select users.bad", Schema>, false>>;

// WHERE: out-of-part aliases skipped; real-table refs validated; bare col skipped
type W1 = Expect<Equal<ValidateWherePart<"where t.id = 5 and b.x > 0", Schema>, true>>;
type W2 = Expect<Equal<ValidateWherePart<"where users.id = 5", Schema>, true>>;
type W3 = Expect<Equal<ValidateWherePart<"where users.bad = 5", Schema>, false>>;
type W4 = Expect<Equal<ValidateWherePart<"where id = 5", Schema>, true>>;

// HAVING behaves like WHERE
type H1 = Expect<Equal<ValidateHavingPart<"having sum(total) > 0 and b.x > 0", Schema>, true>>;
type H2 = Expect<Equal<ValidateHavingPart<"having users.bad > 0", Schema>, false>>;

// GROUP BY / ORDER BY
type G1 = Expect<Equal<ValidateGroupByPart<"group by users.id", Schema>, true>>;
type O1 = Expect<Equal<ValidateOrderByPart<"order by t.id desc", Schema>, true>>;
type O2 = Expect<Equal<ValidateOrderByPart<"order by users.bad", Schema>, false>>;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck`
Expected: FAIL — `Module '"../../src/index.js"' has no exported member 'ValidateSelectPart'` (and the four siblings).

- [ ] **Step 3: Append clause-part types to `src/partial.ts`**

In isolation a clause fragment carries no table source, so its tables/aliases are `never`: only fully-qualified (`schema.table.col`) and real-table (`table.col`) refs are validated; alias-qualified and bare columns are skipped. All five clauses share one implementation (the distinction only matters once accumulated context is added later).

```typescript
// Clause fragments (SELECT list, WHERE, HAVING, GROUP BY, ORDER BY) carry no
// table source in isolation. Validate only refs resolvable without one
// (`schema.table.col` and real `table.col`); skip alias-qualified and bare cols.
export type ValidateClausePart<Part extends string, S extends DatabaseSchema> =
    string extends Part
        ? false
        : NormalizeQuery<Part> extends infer N extends string
            ? TokenizeLoose<N> extends infer Toks extends string[]
                ? QualifiedColumnRefsValidPartialFor<S, never, never, Toks>
                : true
            : false;

export type ValidateSelectPart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
export type ValidateWherePart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
export type ValidateHavingPart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
export type ValidateGroupByPart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
export type ValidateOrderByPart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
```

- [ ] **Step 4: Add to the `src/index.ts` re-export**

Update the partial re-export block to the final form:

```typescript
// Partial (fragment) validation entry points — for the query builder.
export type {
    ValidateFromPart,
    ValidateJoinPart,
    ValidateSelectPart,
    ValidateWherePart,
    ValidateHavingPart,
    ValidateGroupByPart,
    ValidateOrderByPart
} from "./partial.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 6: Commit**

```bash
git add src/partial.ts src/index.ts tests/partial/clause-parts.test.ts
git commit -m "Add partial clause-part validation (select/where/having/group/order)"
```

---

## Task 4: Full-suite regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the entire typecheck to confirm no regressions**

Run: `npm run typecheck`
Expected: PASS — the full project (existing `tests/types.test.ts`, `tests/adversarial/**`, `tests/external/**`, plus the three new `tests/partial/**` files) compiles with zero errors.

- [ ] **Step 2: Confirm all seven entry points are exported**

Run: `grep -n "ValidateFromPart\|ValidateJoinPart\|ValidateSelectPart\|ValidateWherePart\|ValidateHavingPart\|ValidateGroupByPart\|ValidateOrderByPart" src/index.ts`
Expected: all seven names appear in the re-export block.

- [ ] **Step 3: Commit (if any stray changes remain; otherwise skip)**

```bash
git status --porcelain
# if clean, nothing to do
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §1 core rule → Task 1 (`PartialResolvePrefix`, `ColumnRefValidPartialWith`). §2 all seven entry points → Tasks 1–3. §3 implementation shape (reuse `NormalizeQuery`/`TablesInQuery`/`AliasesInQuery`/`TokenizeLoose`/`QualifiedColumnRefs`, new partial-resolution types, no `validation.ts` dependency) → Task 1. §4 testing (valid / invalid-resolvable / unresolvable-skipped per part) → Tasks 1–3 test files. No gaps.
- **Placeholder scan:** none — every step shows full code or an exact command.
- **Type consistency:** `PartialResolvePrefix`, `ColumnRefValidPartialWith`, `QualifiedColumnRefsValidPartialFor`, `AllPartTablesValid`, `ValidateTableSourcePart`, `EnsureFromLed`, `ValidateClausePart` are each defined once in Task 1/3 and referenced with matching signatures thereafter. `QualifiedColumnRefsValidPartialFor` is `<S, Tables, Aliases, LooseTokens>` everywhere it is used.
- **Unqualified-never-fails:** realized as a deliberate consequence — `ColumnRefValidPartialWith` only fails on qualified refs with a resolvable prefix; bare columns hit the final `: true`. So unqualified refs are not collected/validated at all (`QualifiedColumnRefs` only yields dotted tokens), matching the approved rule.
