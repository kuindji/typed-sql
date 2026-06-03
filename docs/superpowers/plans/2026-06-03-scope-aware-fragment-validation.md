# Scope-aware Fragment Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the query builder's per-fragment validation scope-aware and depth-safe so large builder queries stop hitting `TS2589`, while keeping the precise whole-query `ValidateSQL` pass as a size-gated bonus for small queries.

**Architecture:** Build an alias→table scope map once from the FROM+JOIN fragments. Thread it into the WHERE/GROUP/HAVING/ORDER clause validators (which today are fed `never, never`). Replace the heavy SELECT-fragment validator with a lightweight *identifiers-only* validator that splits the SELECT list at top-level commas and resolves only plain `alias.col` items against the scope map — never normalizing expression bodies. In `ValidQueryBuilder`, run the (now depth-safe) scope-aware `FragmentErrors` always; additionally run the whole-query `ValidateSQL` only when the assembled SQL is literal and under a char-length threshold.

**Tech Stack:** TypeScript type-level programming. Tests are `*.test.ts` under `tests/builder/types/` (tsc-checked + bun-run). Reference doc: `docs/superpowers/specs/2026-06-03-scope-aware-fragment-validation-design.md`.

---

## File Structure

- **Modify `src/partial.ts`** — add schema-level scope-aware validators: `ValidateClausePartScoped`, and the identifiers-only SELECT chain (`RefHasSpecial`, `IsPlainQualifiedRef`, `SelectItemRef`, `SelectItemValid`, `SelectListValidScoped`, `ValidateSelectIdentifiersScoped`). These take pre-computed `Tables`/`Aliases` strings + schema. No builder imports (keeps the layer clean).
- **Modify `src/builder/db.ts`** — add the builder-level scope-map derivation (`JoinSourceText`, `ScopeSourceText`, `ScopeTables`, `ScopeAliases`), the size gate (`MkBudget`, `BuilderSqlSmall`), thread scope through the `*Errors` helpers + `FragmentErrors`, and rewrite `ValidQueryBuilder`'s dispatch.
- **Modify `tests/builder/types/validation-edges.test.ts`** — the existing `_mixedAccepted` case (alias-qualified typo in a mixed builder) intentionally flips from "compiles" to "rejected".
- **Create `tests/builder/types/scope-aware-validation.test.ts`** — the heavy depth-reproduction fixture + retention assertions.

All scope-map/size-gate helpers are exported (`export type`) so they can be unit-tested directly. (Project convention: type tests reference exported types.)

---

## Verification commands (used throughout)

- Full typecheck (authoritative; runs under strict config): `npm run typecheck`
  - which is `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
- Full suite (tsc + bun): `npm test`
- Run a single bun file: `bun test tests/builder/types/scope-aware-validation.test.ts`

**Depth note (from project memory):** in-project `ValidateSQL`/builder validation is depth-sensitive — adding probe files can shift instantiation budgets and flip booleans. Trust only the **clean full-suite `npm run typecheck`**, and run it 3× to confirm determinism. Never probe nullability/validity with a one-off `tsc file.ts` (that disables `strictNullChecks`).

---

## Task 1: Reproduce the depth blow-up (RED baseline)

**Files:**
- Create: `tests/builder/types/scope-aware-validation.test.ts`

- [ ] **Step 1: Write a heavy builder query that mirrors TheFloorr's shape**

Create the file with a builder query: several joins, ~11 heavy projections (CASE / coalesce / casts), alias-qualified refs in WHERE and GROUP BY. Use the existing `EcommerceSchema` fixture.

```ts
// tests/builder/types/scope-aware-validation.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import { createSelectFn } from "../../../src/builder/db.js";

const select = createSelectFn<EcommerceSchema>(() => Promise.resolve([]));

// Heavy, fully-literal builder query. Mirrors the projection/JOIN weight that
// blows the whole-query ValidateSQL pass in TheFloorr.
const heavy = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .join("Network_Order_CJ_Item ci on ci.orderId = o.id", "j0")
    .join("Network_Payment_CJ pc on pc.orderId = o.id", "j1")
    .select("o.id", "s0")
    .select("coalesce(o.correctedSaleAmount, o.saleAmount) as saleAmount", "s1")
    .select("coalesce(o.correctedCommissionAmount, o.commissionAmount) as commissionAmount", "s2")
    .select("case when o.status = 'approved' then o.pseBalance else 0 end as pseBalance", "s3")
    .select("coalesce(o.correctedGrossSaleAmount, o.grossSaleAmount) as grossSaleAmount", "s4")
    .select("coalesce(o.correctedGrossCommissionAmount, o.grossCommissionAmount) as grossCommissionAmount", "s5")
    .select("(o.pseCommissionRate)::text as pseRate", "s6")
    .select("case when o.manualStatus is not null then o.manualStatus else o.internalStatus end as effectiveStatus", "s7")
    .select("coalesce(ci.itemCommission, 0) as itemCommission", "s8")
    .select("coalesce(ci.itemValue, 0) as itemValue", "s9")
    .select("case when o.psePaymentStatus = 'paid' then o.commissionAmount else 0 end as paidCommission", "s10")
    .where("o.advertiser = :adv", "w0")
    .where("o.orderDate >= :from", "w1")
    .groupBy("o.id", "g0")
    .groupBy("ci.id", "g1");

const _heavy = select(heavy);
void _heavy;
```

- [ ] **Step 2: Confirm it currently blows depth**

Run: `npm run typecheck`
Expected: a `TS2589` (Type instantiation is excessively deep…) or `TS2590` originating from `heavy` / `ValidQueryBuilder`.

If it does NOT error, the fixture is not heavy enough to be a valid baseline — scale it up (add 2–3 more `coalesce`/`case` projections and one more `.join(...)`) and re-run until `npm run typecheck` reports the depth error. Record the final shape; that is our reproduction.

- [ ] **Step 3: Commit the RED baseline**

```bash
git add tests/builder/types/scope-aware-validation.test.ts
git commit -m "test(builder): reproduce TS2589 depth blow-up on heavy builder query"
```

(Committing a known-failing baseline is intentional — it documents the bug and is greened in Task 8. Note the typecheck is red at this commit.)

---

## Task 2: Scope-map derivation (FROM + JOIN → Tables/Aliases)

**Files:**
- Modify: `src/builder/db.ts`

- [ ] **Step 1: Write failing type tests for the scope map**

Append to `tests/builder/types/scope-aware-validation.test.ts`:

```ts
import type { ScopeTables, ScopeAliases } from "../../../src/builder/db.js";
import type { SqlOf } from "../../../src/builder/return-type.js";

const scoped = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .join("Network_Order_CJ_Item ci on ci.orderId = o.id", "j0")
    .select("o.id", "s0");
type ScopedSql = SqlOf<typeof scoped>;

// The scope map resolves the `o` and `ci` aliases to their tables.
type _AliasO = RequireTrue<AssertEqual<
    // ResolveAlias over ScopeAliases finds the Network_Order key for "o".
    import("../../../src/columns.js").ResolveAlias<"o", ScopeAliases<ScopedSql, EcommerceSchema>> extends `public.network_order` | `public.Network_Order` ? true : false,
    true
>>;
```

> Note: alias-key casing depends on `NormalizeTableKey`. If the assertion's expected literal mismatches, adjust it to whatever `ScopeAliases` actually yields for `o` (read it via a hover/AssertEqual against the real value) — the point is that `o` resolves to *some* `Network_Order` key, not `never`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run typecheck`
Expected: error — `ScopeTables` / `ScopeAliases` not exported from `db.ts`.

- [ ] **Step 3: Implement the scope-map types in `db.ts`**

Add these imports at the top of `src/builder/db.ts` (extend the existing import blocks):

```ts
import type { NormalizeQuery } from "../parsing.js";
import type { TablesInQuery, AliasesInQuery } from "../tables.js";
import type { Frag } from "./sql-tag.js";
```

(`SqlTag` is already imported. If `Frag` is already imported, don't duplicate.)

Add the derivation types (place after the imports, before `FragmentErrors`):

```ts
// Concatenate the join fragment texts, each space-separated, into one string.
type JoinSourceText<List extends readonly Frag[]> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? ` ${H["text"]}${JoinSourceText<R>}`
        : "";

// Build a from-clause-shaped string from the FROM text + all JOIN texts, so the
// existing whole-query collectors can read the full table scope. `null` FROM
// (or a non-literal `string` FROM) yields "" → empty scope (everything skipped).
type ScopeSourceText<Sql extends SqlTag> =
    Sql["from"] extends null
        ? ""
        : string extends (Sql["from"] & string)
            ? ""
            : `from ${Sql["from"] & string}${JoinSourceText<Sql["joins"]>}`;

// Table keys in scope (union of `schema.table`), via the depth-safe collector.
export type ScopeTables<Sql extends SqlTag, S extends DatabaseSchema> =
    ScopeSourceText<Sql> extends infer N extends string
        ? N extends "" ? never : TablesInQuery<NormalizeQuery<N>, S>
        : never;

// Alias→key entries in scope, via the depth-safe collector.
export type ScopeAliases<Sql extends SqlTag, S extends DatabaseSchema> =
    ScopeSourceText<Sql> extends infer N extends string
        ? N extends "" ? never : AliasesInQuery<NormalizeQuery<N>, S>
        : never;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run typecheck`
Expected: the Task 1 baseline still errors (TS2589 — not yet fixed), but the new `ScopeTables`/`ScopeAliases` assertions resolve. To isolate, temporarily comment out the `heavy`/`_heavy` block, run `npm run typecheck`, confirm 0 errors, then restore it.

- [ ] **Step 5: Commit**

```bash
git add src/builder/db.ts tests/builder/types/scope-aware-validation.test.ts
git commit -m "feat(builder): derive alias->table scope map from FROM+JOIN fragments"
```

---

## Task 3: Scope-aware WHERE/GROUP/HAVING/ORDER validator

**Files:**
- Modify: `src/partial.ts`

- [ ] **Step 1: Write failing type tests**

Append to `tests/builder/types/scope-aware-validation.test.ts`:

```ts
import type { ValidateClausePartScoped } from "../../../src/partial.js";
import type { ScopeTables as ST, ScopeAliases as SA } from "../../../src/builder/db.js";

const wq = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .join("Network_Order_CJ_Item ci on ci.orderId = o.id", "j0")
    .select("o.id", "s0");
type WqSql = SqlOf<typeof wq>;

// A real alias-qualified column → valid.
type _WhereOk = RequireTrue<AssertEqual<
    ValidateClausePartScoped<"o.advertiser = :adv", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    true
>>;
// An alias-qualified TYPO → invalid (this is the class today's code misses).
type _WhereBad = RequireTrue<AssertEqual<
    ValidateClausePartScoped<"o.notacol = :adv", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    false
>>;
// An out-of-scope / unknown alias → skipped (lenient → true).
type _WhereSkip = RequireTrue<AssertEqual<
    ValidateClausePartScoped<"zz.whatever = :x", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    true
>>;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run typecheck`
Expected: error — `ValidateClausePartScoped` not exported from `partial.ts`.

- [ ] **Step 3: Implement `ValidateClausePartScoped` in `partial.ts`**

Add to `src/partial.ts` (right after `ValidateClausePart`, ~line 130). It is `ValidateClausePart` with the real `Tables`/`Aliases` threaded into `QualifiedColumnRefsValidPartialFor` instead of `never, never`:

```ts
// Scope-aware clause validation: identical to ValidateClausePart, but the
// alias->table map (built from FROM+JOIN by the builder) is threaded in so that
// alias-qualified refs (`u.col`) resolve and typos are caught.
export type ValidateClausePartScoped<
    Part extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    string extends Part
        ? false
        : NormalizeQuery<Part> extends infer N extends string
            ? TokenizeLoose<N> extends infer Toks extends string[]
                ? QualifiedColumnRefsValidPartialFor<S, Tables, Aliases, Toks>
                : true
            : false;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run typecheck` (comment out the `heavy` block first to isolate, as in Task 2 Step 4, then restore).
Expected: the three new WHERE assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/partial.ts tests/builder/types/scope-aware-validation.test.ts
git commit -m "feat(builder): scope-aware clause validator (catches alias-qualified typos)"
```

---

## Task 4: Identifiers-only SELECT validator

**Files:**
- Modify: `src/partial.ts`

- [ ] **Step 1: Write failing type tests**

Append to `tests/builder/types/scope-aware-validation.test.ts`:

```ts
import type { ValidateSelectIdentifiersScoped } from "../../../src/partial.js";

// Plain alias-qualified typo in the SELECT list → caught.
type _SelBad = RequireTrue<AssertEqual<
    ValidateSelectIdentifiersScoped<"o.id, o.notacol", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    false
>>;
// Plain valid refs (with aliases) → ok.
type _SelOk = RequireTrue<AssertEqual<
    ValidateSelectIdentifiersScoped<"o.id, o.advertiser as adv", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    true
>>;
// Expression bodies are NOT descended into → a typo buried in coalesce is skipped (true).
type _SelExprSkip = RequireTrue<AssertEqual<
    ValidateSelectIdentifiersScoped<"coalesce(o.notacol, 0) as x, o.id", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    true
>>;
// `*` and unknown-alias refs are skipped.
type _SelStar = RequireTrue<AssertEqual<
    ValidateSelectIdentifiersScoped<"o.*, zz.foo", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    true
>>;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run typecheck`
Expected: error — `ValidateSelectIdentifiersScoped` not exported.

- [ ] **Step 3: Implement the SELECT chain in `partial.ts`**

First extend the parsing imports at the top of `src/partial.ts`:

```ts
import type {
    CleanExpr,
    CleanIdent,
    NormalizeQuery,
    SplitOnDotClean,
    TokenizeLoose,
    SplitTopLevel,
    Trim,
    ExtractBefore,
    HasSpecial
} from "./parsing.js";
```

> If any of `SplitTopLevel`, `Trim`, `ExtractBefore`, `HasSpecial` is not re-exported from the `parsing.js` barrel, add it to `src/parsing.ts`'s re-export list (they live in `src/parsing/split.ts` and `src/parsing/string-utils.ts`). Verify with: `rg -n "SplitTopLevel|ExtractBefore|HasSpecial|export .*Trim" src/parsing.ts`.

Then add (after `ValidateClausePartScoped`):

```ts
// Expression-detector for a single SELECT-item token. HasSpecial covers space,
// parens, arithmetic/comparison operators, comma, `::`, `||`. We additionally
// reject `[ ] " ' :` so array-indexing, quoted-with-space idents, json arrows,
// and param/cast colons are treated as expressions (skipped, never falsely
// rejected). A token clearing this guard is a plain identifier piece.
type RefHasSpecial<S extends string> =
    HasSpecial<S> extends true ? true :
    S extends `${string}[${string}` ? true :
    S extends `${string}]${string}` ? true :
    S extends `${string}"${string}` ? true :
    S extends `${string}'${string}` ? true :
    S extends `${string}:${string}` ? true :
    false;

// True iff S is a plain two-part `alias.col` ref (no expression syntax).
// `${infer A}.${infer B}` binds A to the shortest pre-first-dot match; a 3-part
// `schema.table.col` leaves a dot in B and is rejected (skipped).
type IsPlainQualifiedRef<S extends string> =
    S extends `${infer A}.${infer B}`
        ? RefHasSpecial<A> extends true
            ? false
            : RefHasSpecial<B> extends true
                ? false
                : B extends `${string}.${string}`
                    ? false
                    : true
        : false;

// The leading token of a SELECT item with any trailing alias dropped
// (`o.id as foo` / `o.id foo` -> `o.id`). `ExtractBefore` returns the whole
// string when there is no space.
type SelectItemRef<Item extends string> = ExtractBefore<Trim<Item>, " ">;

// Validate ONE select item: resolve only plain `alias.col` refs; skip everything
// else (functions, CASE, casts, literals, `*`, quoted-space idents) -> true.
type SelectItemValid<
    Item extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = SelectItemRef<Item> extends infer Ref extends string
    ? IsPlainQualifiedRef<Ref> extends true
        ? ColumnRefValidPartialWith<Ref, Tables, Aliases, S>
        : true
    : true;

// Validate every top-level SELECT item. Early-exit on first false. Step-capped.
type SelectListValidScoped<
    List extends readonly string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> = Steps["length"] extends 200
    ? true
    : List extends readonly [infer H extends string, ...infer R extends readonly string[]]
        ? SelectItemValid<H, Tables, Aliases, S> extends false
            ? false
            : SelectListValidScoped<R, Tables, Aliases, S, [any, ...Steps]>
        : true;

// Identifiers-only SELECT validation: split the list at top-level commas
// (depth-safe, never normalizes expression bodies) and check only plain refs.
export type ValidateSelectIdentifiersScoped<
    Part extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = string extends Part
    ? false
    : SplitTopLevel<Part> extends infer Items extends readonly string[]
        ? SelectListValidScoped<Items, Tables, Aliases, S>
        : true;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run typecheck` (comment out `heavy` block to isolate, then restore).
Expected: the four new SELECT assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/partial.ts src/parsing.ts tests/builder/types/scope-aware-validation.test.ts
git commit -m "feat(builder): identifiers-only scope-aware SELECT validator"
```

---

## Task 5: Size gate (BuilderSqlSmall)

**Files:**
- Modify: `src/builder/db.ts`

- [ ] **Step 1: Write failing type tests**

Append to `tests/builder/types/scope-aware-validation.test.ts`:

```ts
import type { BuilderSqlSmall } from "../../../src/builder/db.js";

// Short literal → small (true).
type _ShortIsSmall = RequireTrue<AssertEqual<
    BuilderSqlSmall<"SELECT id FROM users WHERE id = 1">,
    true
>>;

// Long literal → large (false). Paste a single >700-char SQL-ish string literal
// here (above the 600 threshold). Keep it on one line; exact content is
// irrelevant, only its length. Example shape (extend until clearly >700 chars):
type LongLiteral = "SELECT a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z FROM t1 JOIN t2 ON t1.id=t2.id JOIN t3 ON t2.id=t3.id WHERE aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa = 1";

type _LongIsLarge = RequireTrue<AssertEqual<
    BuilderSqlSmall<LongLiteral>,
    false
>>;
```

> If `LongLiteral` happens to be under the 600 threshold, extend the `aaaa…` run until `_LongIsLarge` passes. One short→true, one long→false is the whole point.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run typecheck`
Expected: error — `BuilderSqlSmall` not exported.

- [ ] **Step 3: Implement the size gate in `db.ts`**

Add (near the scope-map types):

```ts
// One-time budget tuple of length N (a constant; instantiated once per N).
type MkBudget<N extends number, Acc extends any[] = []> =
    Acc["length"] extends N ? Acc : MkBudget<N, [any, ...Acc]>;

// Char-length threshold below which the precise whole-query ValidateSQL is safe
// to run. Tunable: raise toward where the whole-query pass starts blowing,
// lower if a query under it still blows. See Task 8.
type SqlSizeThreshold = MkBudget<600>;

// Walk S against the budget. As soon as chars remain with the budget exhausted,
// the query is "large" (false). Cost is bounded by the threshold (early-exit),
// not by the query length.
type LenWithin<S extends string, Budget extends any[]> =
    S extends `${infer _C}${infer Tail}`
        ? Budget extends [any, ...infer Rest extends any[]]
            ? LenWithin<Tail, Rest>
            : false
        : true;

// True = small enough for the precise whole-query pass.
export type BuilderSqlSmall<SQL extends string> =
    string extends SQL ? false : LenWithin<SQL, SqlSizeThreshold>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run typecheck` (isolate `heavy` block as before).
Expected: size-gate assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/builder/db.ts tests/builder/types/scope-aware-validation.test.ts
git commit -m "feat(builder): char-length size gate for the whole-query validation pass"
```

---

## Task 6: Wire scope + size gate into FragmentErrors / ValidQueryBuilder

**Files:**
- Modify: `src/builder/db.ts`

- [ ] **Step 1: Thread scope through the clause `*Errors` helpers**

In `src/builder/db.ts`, change the WHERE/GROUP/HAVING/ORDER error helpers to take `Tables`/`Aliases` and call the scoped validator, and replace `SelectErrors` with the identifiers-only validator. Update imports first:

```ts
import type {
    ValidateFromPart,
    ValidateJoinPart,
    ValidateClausePartScoped,
    ValidateSelectIdentifiersScoped,
} from "../partial.js";
```

> Remove the now-unused `ValidateSelectPart`, `ValidateWherePart`, `ValidateHavingPart`, `ValidateGroupByPart`, `ValidateOrderByPart` imports if nothing else references them. (`ValidateFromPart`/`ValidateJoinPart` stay.)

Replace `SelectErrors` (db.ts:37-41) with an identifiers-only, scoped version. The SELECT list is the concatenation of every select fragment's text; validate it as one list so commas across fragments are handled:

```ts
// Join all literal select-fragment texts into one comma list; bail to "" if any
// fragment text is non-literal (the dispatch already allow-unknowns that case).
type SelectListText<List extends readonly SelFrag[], Acc extends string = ""> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? string extends H["text"]
            ? string
            : SelectListText<R, Acc extends "" ? H["text"] : `${Acc}, ${H["text"]}`>
        : Acc;

type SelectErrors<List extends readonly SelFrag[], Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    SelectListText<List> extends infer Txt extends string
        ? string extends Txt
            ? never
            : FragErr<ValidateSelectIdentifiersScoped<Txt, Tables, Aliases, S>, "SELECT", Txt>
        : never;
```

Replace each of `WhereErrors`/`GroupErrors`/`HavingErrors`/`OrderErrors` to take + thread scope. Example for `WhereErrors` (apply the same shape to the other three, swapping the label):

```ts
type WhereErrors<List extends readonly Frag[], Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateClausePartScoped<H["text"], Tables, Aliases, S>, "WHERE", H["text"]>)
            | WhereErrors<R, Tables, Aliases, S>
        : never;
```

(`GroupErrors` → label `"GROUP BY"`; `HavingErrors` → `"HAVING"`; `OrderErrors` → `"ORDER BY"`. `FromError`/`JoinErrors` are unchanged — they remain strict and self-contained.)

- [ ] **Step 2: Rewrite `FragmentErrors` to compute scope once and thread it**

Replace `FragmentErrors` (db.ts:79-92):

```ts
export type FragmentErrors<B, Schema extends DatabaseSchema> =
    B extends SelectQueryBuilder<Schema, infer Sql extends SqlTag>
        ? ScopeTables<Sql, Schema> extends infer Tbls extends string
            ? ScopeAliases<Sql, Schema> extends infer Als extends string
                ? (
                    | SelectErrors<Sql["selects"], Tbls, Als, Schema>
                    | FromError<Sql["from"], Schema>
                    | JoinErrors<Sql["joins"], Schema>
                    | WhereErrors<Sql["wheres"], Tbls, Als, Schema>
                    | GroupErrors<Sql["groupBys"], Tbls, Als, Schema>
                    | HavingErrors<Sql["havings"], Tbls, Als, Schema>
                    | OrderErrors<Sql["orderBys"], Tbls, Als, Schema>
                ) extends infer E
                    ? [E] extends [never] ? [] : (E & string)[]
                    : []
                : []
            : []
        : [];
```

- [ ] **Step 3: Rewrite `ValidQueryBuilder` dispatch with the size gate**

Replace `ValidQueryBuilder` (db.ts:98-107):

```ts
export type ValidQueryBuilder<Schema extends DatabaseSchema, B extends SelectQueryBuilder<Schema, any>> =
    FragmentErrors<B, Schema> extends []
        ? BuilderSQL<B> extends infer SQL extends string
            ? string extends SQL
                ? B // some fragment text non-literal → allow, untyped
                : BuilderSqlSmall<SQL> extends true
                    ? ValidateSQL<SQL, Schema> extends true
                        ? B
                        : `[SQL Error] ${Extract<ValidateSQL<SQL, Schema>, string>}`
                    : B // large query: rely on scope-aware FragmentErrors (depth-safe)
            : B
        : `[SQL Error] ${FragmentErrors<B, Schema>[number]}`;
```

- [ ] **Step 4: Update the `partial.ts` file header comment**

The isolation contract has changed. Edit the top comment of `src/partial.ts` to note that clause/SELECT validation is now scope-aware via a FROM+JOIN-derived alias→table map passed in by the builder (while FROM/JOIN fragments remain self-contained). Keep it to 2–3 sentences.

- [ ] **Step 5: Run the full suite**

Run: `npm run typecheck`
Expected: this is the moment of truth. The Task 1 `heavy` fixture should now type-check (no TS2589). If it still blows, STOP — go to Task 9 (failure protocol).

- [ ] **Step 6: Commit**

```bash
git add src/builder/db.ts src/partial.ts
git commit -m "feat(builder): scope-aware FragmentErrors + size-gated whole-query validation"
```

---

## Task 7: Update the intentionally-flipped existing test

**Files:**
- Modify: `tests/builder/types/validation-edges.test.ts`

- [ ] **Step 1: Update `_mixedAccepted` (now caught)**

The block at `tests/builder/types/validation-edges.test.ts:35-44` asserts that an alias-qualified typo in a mixed (one-dynamic-fragment) builder *compiles*, because "per-fragment validation has no alias scope." That premise is now false: the scope map is built from the literal FROM fragment, so `o.notacol` is caught even though `where(dynStr)` is dynamic. Change it to a rejection and fix the comment:

```ts
//   alias-qualified invalid column is NOW REJECTED: the scope map is built from
//   the literal FROM/JOIN fragments, so `o.notacol` resolves and fails even when
//   another fragment (where) is dynamic.
const _mixedRejected2 = select(
    createSelectQuery<EcommerceSchema>()
        .from("Network_Order o")
        .where(dynStr)
        // @ts-expect-error - o.notacol invalid (caught by scope-aware FragmentErrors)
        .select("o.notacol", "s0"),
);
void _mixedRejected2;
```

> Audit the rest of `validation-edges.test.ts` for any other assertion that relied on alias-qualified refs being unvalidated, and flip those the same way. Search: `rg -n "alias-qualified|no alias scope|per-fragment" tests/builder/types/validation-edges.test.ts`.

- [ ] **Step 2: Run to verify**

Run: `npm run typecheck`
Expected: 0 errors. (If the `@ts-expect-error` is now "unused", that means the case is NOT being caught — investigate scope-map coverage for the dynamic-where case.)

- [ ] **Step 3: Commit**

```bash
git add tests/builder/types/validation-edges.test.ts
git commit -m "test(builder): alias-qualified typos now caught in mixed builders"
```

---

## Task 8: Green the heavy fixture + retention assertions + full regression

**Files:**
- Modify: `tests/builder/types/scope-aware-validation.test.ts`

- [ ] **Step 1: Add retention assertions (typos in each clause are caught)**

Append negative cases proving the recovered retention. These use a fully-literal builder (so `FragmentErrors` is authoritative):

```ts
// Alias-qualified typo in WHERE → rejected.
const _badWhere = select(
    createSelectQuery<EcommerceSchema>()
        .from("Network_Order o")
        // @ts-expect-error - o.notacol does not exist
        .where("o.notacol = :x", "w0")
        .select("o.id", "s0"),
);
void _badWhere;

// Alias-qualified typo in GROUP BY → rejected.
const _badGroup = select(
    createSelectQuery<EcommerceSchema>()
        .from("Network_Order o")
        .select("o.id", "s0")
        // @ts-expect-error - o.notacol does not exist
        .groupBy("o.notacol", "g0"),
);
void _badGroup;

// Plain alias-qualified typo in SELECT → rejected.
const _badSelect = select(
    createSelectQuery<EcommerceSchema>()
        .from("Network_Order o")
        // @ts-expect-error - o.notacol does not exist
        .select("o.notacol", "s0"),
);
void _badSelect;

// A typo buried in a SELECT expression is NOT caught (identifiers-only) — must
// compile cleanly (no @ts-expect-error). Documents the intentional limit.
const _exprTypoSkipped = select(
    createSelectQuery<EcommerceSchema>()
        .from("Network_Order o")
        .select("coalesce(o.notacol, 0) as x", "s0"),
);
void _exprTypoSkipped;
```

- [ ] **Step 2: Assert the heavy fixture's result type is intact**

Add below the `heavy` definition:

```ts
import type { BuilderReturnType } from "../../../src/builder/return-type.js";
type HeavyRow = BuilderReturnType<typeof heavy>;
type _HeavyId = RequireTrue<AssertEqual<HeavyRow["id"], string>>;
type _HeavySale = RequireTrue<AssertEqual<HeavyRow["saleAmount"], number>>;
```

> If `saleAmount` infers as `unknown` (coalesce widening rules), assert against the actual inferred type — the point is the row is computed and `id` is correct, not that every expression is precisely typed.

- [ ] **Step 3: Full typecheck, three times (determinism)**

Run: `npm run typecheck` — confirm exit 0.
Run it **two more times** and confirm exit 0 each time (the project's validation is depth-sensitive; only a deterministic clean result counts).

- [ ] **Step 4: Full runtime suite**

Run: `npm test`
Expected: tsc clean + all bun tests pass (no regressions vs. the pre-change count). Investigate any flipped boolean pins.

- [ ] **Step 5: Commit**

```bash
git add tests/builder/types/scope-aware-validation.test.ts
git commit -m "test(builder): green heavy fixture + alias-qualified typo retention"
```

---

## Task 9: Verification gate / failure protocol + record findings

**Files:**
- Modify: memory + `docs/superpowers/specs/2026-06-03-scope-aware-fragment-validation-design.md`

- [ ] **Step 1: Decide outcome**

- **If Task 6 Step 5 / Task 8 Step 3 are clean (heavy fixture greens, deterministic):** SUCCESS. Proceed to Step 2.
- **If the heavy fixture STILL blows depth with identifiers-only SELECT enabled:** per the spec's failure protocol, do NOT ship a degraded SELECT-skipping variant. Instead: (a) capture where depth is spent — run `tsc --noEmit --generateTrace ./trace` on a minimal repro and inspect the hot types; (b) `git revert` the feature commits (or reset the branch); (c) record the findings (what was tried, trace hotspots, why identifiers-only SELECT was still too deep) in memory and in a new "## Findings (failed attempt)" section of the spec; (d) STOP and report back for a rethink. Do not merge.

- [ ] **Step 2 (success path): Record progress in memory**

Update `/Users/kuindji/.claude/projects/-Users-kuindji-Projects--kuindji-typed-sql/memory/` with a new file capturing: the scope-aware fragment validation approach, the identifiers-only SELECT mechanism, the size-gate threshold actually used, the `validation-edges.test.ts` flip, and the final tsc/bun counts. Add a one-line pointer to `MEMORY.md`.

- [ ] **Step 3: Finalize**

Invoke `superpowers:finishing-a-development-branch` to choose how to integrate (merge / PR / cleanup).

---

## Self-Review

**Spec coverage:**
- Component 1 (scope map) → Task 2. ✓
- Component 2 (scope-aware WHERE/GROUP/HAVING/ORDER) → Task 3 + Task 6 Step 1. ✓
- Component 3 (identifiers-only SELECT) → Task 4 + Task 6 Step 1. ✓
- Component 4 (size-gated dispatch) → Task 5 + Task 6 Step 3. ✓
- Contract-change comment update → Task 6 Step 4. ✓
- Heavy fixture + retention + regression → Task 1, Task 8. ✓
- Intentional test flip → Task 7. ✓
- Failure protocol (revert + record, no skip-SELECT) → Task 9. ✓
- Out-of-scope (raw strings, BuilderReturnType, ValidateSQL engine) → untouched. ✓

**Type consistency:** `ScopeTables`/`ScopeAliases`, `ValidateClausePartScoped`, `ValidateSelectIdentifiersScoped`, `BuilderSqlSmall`, `SelectListText`, the `*Errors` helpers, and `FragmentErrors`/`ValidQueryBuilder` signatures are consistent across Tasks 2–6. `*Errors` helpers uniformly take `(List, Tables, Aliases, S)` except `FromError`/`JoinErrors` (unchanged, `(…, S)`).

**Placeholder scan:** All code steps contain real code. The two awkward-to-express assertions (scope-map alias casing in Task 2; long-string size gate in Task 5) carry explicit "adjust to the actual value / paste a long literal" instructions rather than `TODO`s — the intent and the concrete check are both stated.

**Known risk surfaced:** identifiers-only SELECT depth-safety is the open risk; Task 6 Step 5 and Task 9 make it an explicit go/no-go gate with a defined revert-and-record fallback.
