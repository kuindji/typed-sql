# Insert / Update / Delete Builders with Typed (Brand-Checked) Parameters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime INSERT/UPDATE/DELETE builders, a typed raw-SQL wrapper (`createSql`), and an executor (`createMutateFn`) whose `:name` parameters are compile-time checked against the exact (branded, nullability-correct) column type they bind to, with `RETURNING` row typing.

**Architecture:** Reuse the existing depth-tuned type-level parsers (`NormalizeQuery`, `ExtractInsertColumns`, `ExtractUpdateSetColumns`, `ExtractLastWhere`, `ExtractReturningList`, target-table extractors, `ColumnTypeFromTableKey`). Productionize the proven `tests/spike/` prototype into `src/builder/extract-params.ts`. Mirror the SELECT builder pattern (`select.ts` + `sql-tag.ts` + `return-type.ts`) for the three write builders, deriving conditional-param optionality with the same `max`/`req` partition the SELECT builder uses. Add a single quote/cast/comment/IN-aware runtime placeholder scanner that drives named-param expansion, value collection, and a live-placeholder check.

**Tech Stack:** TypeScript 5.x (strict, NodeNext), Bun test runner. Type-level tests are `tests/builder/types/*.test.ts` (pure `type _X = RequireTrue<...>`, validated by `tsc --noEmit`); runtime tests are `tests/builder/*.test.ts` (`bun:test`). The full gate is `npm test` (= `tsc --noEmit && bun test`).

---

## Reference facts (read before starting)

- **Spike to productionize:** `tests/spike/extract-params.ts` (type-level core, proven GREEN under strict tsc), `tests/spike/probe.ts` (probes), `tests/spike/schema.ts` (branded fixture). These are throwaway; productionize then delete (Task 17).
- **SELECT builder to mirror:** `src/builder/select.ts` (builder class + interface + `*If`), `src/builder/sql-tag.ts` (type-level tag + `BuildSQL` max/req/scope), `src/builder/return-type.ts` (`Partition`, `HasUncond`/`AllUncond`), `src/builder/assemble.ts` (runtime SQL assembly), `src/builder/state.ts` (runtime state), `src/builder/db.ts` (`createSelectFn`, `ValidQuery`).
- **Param runtime to extend:** `src/builder/params.ts` — `QueryParamValue`, `QueryParamInput`, `PARAM_REGEX`, `expandNamedParams`, `collectParamValues`. **Do NOT change these existing functions or `PARAM_REGEX`** — their behavior (including the `::cast` second-colon quirk) is pinned by `tests/builder/params.test.ts`. The new scanner is **additive**; the SELECT-path retrofit (spec §9) is out of scope.
- **Type-test helpers:** `tests/fixtures/helpers.ts` exports `AssertEqual<T,U>`, `RequireTrue<T extends true>`, `RequireFalse`, `AssertExtends`. Pattern: `type _Name = RequireTrue<AssertEqual<Actual, Expected>>;`. No `it()` in type-only test files.
- **Schema helpers (already exported from `src/schema.ts`):** `ColumnTypeFromTableKey<TableKey, Column, S>` (brand-preserving, case-insensitive), `RowTypeForTable<TableKey, S>`, `DatabaseSchema`.
- **Parsing helpers (already exported from `src/parsing.ts`):** `NormalizeQuery`, `ExtractInsertColumns`, `ExtractConflictColumns`, `ExtractConflictUpdateSetColumns`, `ExtractUpdateSetColumns`, `SplitAssignments`, `ExtractLastWhere`, `ExtractReturningList`, `ExtractBefore`, `SplitCommaSimple`, `SplitTopLevel`, `Trim`, `CleanIdent`.
- **Target tables (already exported from `src/tables.ts`):** `InsertTargetTable`, `UpdateTargetTable`, `DeleteTargetTable`.
- **Baseline:** `npx tsc --noEmit` is currently GREEN (~28s, includes the spike). Keep it green after every task.
- **Depth discipline (project contract):** char-walks are chunked + step-capped. The fix for `TS2589` is the chunked-driver pattern (a bounded worker that yields its state, re-invoked with a fresh step counter), **never** raising a `Steps extends N` cap toward ~1000. Validate depth incrementally after each construct.

---

## File structure

**New type-level modules**
- `src/builder/extract-params.ts` — `DriverParamValue` re-export, `ParamName`/`ColOf`, `ZipInsert`, `SetParams`, `WhereParams` (recognized §6.4 patterns + loose include + between/distinct), `ConflictSetBlock`, multi-row `[SQL Error]` guard, `ExtractParams<Q,S>`, `ExtractReturning<Q,S>`.
- `src/builder/write-tag.ts` — `InsertTag`/`UpdateTag`/`DeleteTag` (fragment lists with `cond` flags), `BuildInsertSQL`/`BuildUpdateSQL`/`BuildDeleteSQL` (`max`/`req`), `WriteParamsFor` (Partition of `ExtractParams<Max>` keyed-required-by `ExtractParams<Req>`), `WriteReturnFor`.

**New runtime modules**
- `src/builder/scanner.ts` — `DriverParamValue`, `PlaceholderOccurrence`, `scanPlaceholders`, `expandScanned`, `collectScanned`, `assertAllProvided`, `assertNoMixedExpansion`, `prepareScanned` (one-shot helper).
- `src/builder/write-state.ts` — `RuntimeInsertState`, `RuntimeUpdateState`, `RuntimeDeleteState` + `EMPTY_*`.
- `src/builder/write-assemble.ts` — `assembleInsertSQL`, `assembleUpdateSQL`, `assembleDeleteSQL` (+ empty-set throws).
- `src/builder/insert.ts`, `src/builder/update.ts`, `src/builder/delete.ts` — builders.
- `src/builder/sql.ts` — `createSql<Schema>()` raw typed wrapper.
- `src/builder/mutate.ts` — `MutationHandler`, `createMutateFn<Schema>`, `MutationReturnType`.

**New tests**
- `tests/builder/scanner.test.ts`, `tests/builder/write-runtime.test.ts`, `tests/builder/mutate-runtime.test.ts`
- `tests/builder/types/extract-params.test.ts`, `tests/builder/types/extract-returning.test.ts`, `tests/builder/types/write-builders.test.ts`, `tests/builder/types/write-depth.test.ts`
- `tests/builder/fixtures/write-schema.ts` — shared branded schema fixture (ported from `tests/spike/schema.ts`).

---

## Phase 0 — Runtime param foundation (scanner + value domain)

### Task 1: Quote/cast/comment/IN-aware placeholder scanner

**Files:**
- Create: `src/builder/scanner.ts`
- Create: `tests/builder/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/builder/scanner.test.ts`:

```ts
// tests/builder/scanner.test.ts
import { describe, it, expect } from "bun:test";
import { scanPlaceholders } from "../../src/builder/scanner.js";

const names = (sql: string) => scanPlaceholders(sql).map(o => o.name);

describe("scanPlaceholders", () => {
    it("finds plain placeholders", () => {
        expect(names("a = :x and b = :y")).toEqual(["x", "y"]);
    });

    it("treats ::type as a cast, not a placeholder", () => {
        // The second colon of ::uuid must NOT start a placeholder.
        expect(names("where id = :id::uuid")).toEqual(["id"]);
    });

    it("ignores placeholders inside single-quoted string literals", () => {
        expect(names("note = ':nope' and id = :id")).toEqual(["id"]);
    });

    it("ignores placeholders inside line comments", () => {
        expect(names("id = :id -- :nope\n and b = :b")).toEqual(["id", "b"]);
    });

    it("ignores placeholders inside block comments", () => {
        expect(names("id = :id /* :nope */ and b = :b")).toEqual(["id", "b"]);
    });

    it("ignores placeholders inside dollar-quoted strings", () => {
        expect(names("x = $tag$ :nope $tag$ and id = :id")).toEqual(["id"]);
    });

    it("flags IN-list occurrences as inExpansion", () => {
        const occ = scanPlaceholders("id in (:ids) and x = :y");
        expect(occ.find(o => o.name === "ids")!.inExpansion).toBe(true);
        expect(occ.find(o => o.name === "y")!.inExpansion).toBe(false);
    });

    it("flags NOT IN occurrences as inExpansion", () => {
        const occ = scanPlaceholders("id not in (:ids)");
        expect(occ.find(o => o.name === "ids")!.inExpansion).toBe(true);
    });

    it("does not flag a non-IN parenthesised placeholder as inExpansion", () => {
        const occ = scanPlaceholders("x = (:y)");
        expect(occ.find(o => o.name === "y")!.inExpansion).toBe(false);
    });

    it("does not clobber a longer name sharing a prefix", () => {
        expect(names("a = :te and b = :text")).toEqual(["te", "text"]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/builder/scanner.test.ts`
Expected: FAIL — `Cannot find module ".../scanner.js"`.

- [ ] **Step 3: Implement the scanner**

Create `src/builder/scanner.ts`:

```ts
// src/builder/scanner.ts

/**
 * Value domain at the typed boundary (spec §6.5). Default `unknown` accepts
 * scalars, branded scalars, arrays, dates, and JSON/object columns. The driver
 * adapter is responsible for serialization.
 */
export type DriverParamValue = unknown;

/** One real `:name` occurrence found by the scanner. */
export interface PlaceholderOccurrence {
    /** Param name without leading ":" and without any `::cast` suffix. */
    readonly name: string;
    /** True iff this occurrence sits directly inside an `IN (...)` / `NOT IN (...)` group. */
    readonly inExpansion: boolean;
    /** Index of the ":" in the source SQL. */
    readonly start: number;
    /** Index just past the last char of the name. */
    readonly end: number;
}

const isIdentStart = (c: string) => /[a-zA-Z_]/.test(c);
const isIdentChar = (c: string) => /[a-zA-Z0-9_]/.test(c);

/**
 * Scan `sql` and return every real placeholder occurrence, skipping string
 * literals (single-quote + dollar-quote), `--` line comments, and block
 * comments, and treating `::type` casts as non-placeholders. Tracks, per paren
 * group, whether the group opened immediately after `in` / `not in`, so each
 * occurrence carries an accurate `inExpansion` flag (spec §6.3/§6.5).
 */
export function scanPlaceholders(sql: string): PlaceholderOccurrence[] {
    const out: PlaceholderOccurrence[] = [];
    // Stack of paren contexts: true = this "(" opened right after IN / NOT IN.
    const parenStack: boolean[] = [];
    let i = 0;
    const n = sql.length;

    // Returns true if the run of word chars ending just before `idx` (skipping
    // trailing whitespace) is `in`, optionally preceded by `not`.
    const opensInList = (idx: number): boolean => {
        let j = idx - 1;
        while (j >= 0 && /\s/.test(sql[j])) j--;
        let end = j + 1;
        while (j >= 0 && isIdentChar(sql[j])) j--;
        const w1 = sql.slice(j + 1, end).toLowerCase();
        return w1 === "in";
    };

    while (i < n) {
        const c = sql[i];

        // -- line comment
        if (c === "-" && sql[i + 1] === "-") {
            i += 2;
            while (i < n && sql[i] !== "\n") i++;
            continue;
        }
        // /* block comment */
        if (c === "/" && sql[i + 1] === "*") {
            i += 2;
            while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
            i += 2;
            continue;
        }
        // single-quoted string (with '' escape)
        if (c === "'") {
            i++;
            while (i < n) {
                if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
                if (sql[i] === "'") { i++; break; }
                i++;
            }
            continue;
        }
        // dollar-quoted string: $tag$ ... $tag$
        if (c === "$") {
            const m = /^\$([a-zA-Z_]\w*)?\$/.exec(sql.slice(i));
            if (m) {
                const tag = m[0];
                const close = sql.indexOf(tag, i + tag.length);
                i = close === -1 ? n : close + tag.length;
                continue;
            }
        }
        // parens — track IN-list context
        if (c === "(") {
            parenStack.push(opensInList(i));
            i++;
            continue;
        }
        if (c === ")") {
            parenStack.pop();
            i++;
            continue;
        }
        // cast `::` — skip both colons, never a placeholder
        if (c === ":" && sql[i + 1] === ":") {
            i += 2;
            continue;
        }
        // placeholder `:name`
        if (c === ":" && isIdentStart(sql[i + 1] ?? "")) {
            const start = i;
            i++;
            const from = i;
            while (i < n && isIdentChar(sql[i])) i++;
            const name = sql.slice(from, i);
            const inExpansion = parenStack.length > 0 && parenStack[parenStack.length - 1];
            out.push({ name, inExpansion, start, end: i });
            continue;
        }
        i++;
    }
    return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/builder/scanner.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Confirm tsc still green**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/builder/scanner.ts tests/builder/scanner.test.ts
git commit -m "feat(builder): add quote/cast/comment/IN-aware placeholder scanner"
```

---

### Task 2: Scanner-based expansion, collection, live-check, mixed-reuse guard

**Files:**
- Modify: `src/builder/scanner.ts` (append functions)
- Create: `tests/builder/scanner-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/builder/scanner-runtime.test.ts`:

```ts
// tests/builder/scanner-runtime.test.ts
import { describe, it, expect } from "bun:test";
import {
    expandScanned,
    collectScanned,
    assertAllProvided,
} from "../../src/builder/scanner.js";

describe("expandScanned", () => {
    it("replaces :name with $n in first-appearance order, reusing repeats", () => {
        expect(expandScanned("a = :x and b = :y or c = :x", { x: 1, y: 2 }))
            .toBe("a = $1 and b = $2 or c = $1");
    });

    it("expands an IN-list array to consecutive placeholders", () => {
        expect(expandScanned("id in (:ids)", { ids: [10, 20, 30] }))
            .toBe("id in ($1, $2, $3)");
    });

    it("passes an array-VALUED column as a single placeholder (not expanded)", () => {
        // Not in IN-context → single slot even though the value is an array.
        expect(expandScanned("tags = :tags where id = :id", { tags: ["a", "b"], id: "p1" }))
            .toBe("tags = $1 where id = $2");
    });

    it("does not expand the ::cast second colon", () => {
        expect(expandScanned("id = :id::uuid", { id: "x" })).toBe("id = $1::uuid");
    });

    it("throws on mixed IN / non-IN reuse of one name", () => {
        expect(() => expandScanned("id in (:ids) and x = :ids", { ids: [1] }))
            .toThrow(/mixed IN and non-IN/i);
    });
});

describe("collectScanned", () => {
    it("flattens only IN-list arrays, in placeholder order", () => {
        expect(collectScanned("a = :x and id in (:ids) and b = :x", { x: 5, ids: [1, 2] }))
            .toEqual([5, 1, 2]);
    });

    it("passes an array-VALUED column through as a single value", () => {
        expect(collectScanned("tags = :tags", { tags: ["a", "b"] }))
            .toEqual([["a", "b"]]);
    });
});

describe("assertAllProvided", () => {
    it("throws for a live placeholder with no supplied key", () => {
        expect(() => assertAllProvided("a = :x and b = :y", { x: 1 }))
            .toThrow('Missing value for query parameter ":y"');
    });

    it("does not throw when every live placeholder has a key", () => {
        expect(() => assertAllProvided("a = :x", { x: 1 })).not.toThrow();
    });

    it("ignores placeholders inside string literals / comments", () => {
        expect(() => assertAllProvided("a = :x -- :nope", { x: 1 })).not.toThrow();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/builder/scanner-runtime.test.ts`
Expected: FAIL — `expandScanned` etc. not exported.

- [ ] **Step 3: Implement the runtime helpers**

Append to `src/builder/scanner.ts`:

```ts
/** Ordered unique names (first appearance) with their merged expansion flag. */
function uniqueNames(
    occ: readonly PlaceholderOccurrence[],
): { name: string; inExpansion: boolean }[] {
    const order: string[] = [];
    const expand = new Map<string, boolean>();
    const seenNonExpand = new Map<string, boolean>();
    for (const o of occ) {
        if (!order.includes(o.name)) order.push(o.name);
        if (o.inExpansion) expand.set(o.name, true);
        else seenNonExpand.set(o.name, true);
    }
    // Mixed IN / non-IN reuse is unsound (spec §6.5) — one value cannot be both
    // N positional slots and one slot.
    for (const name of order) {
        if (expand.get(name) && seenNonExpand.get(name)) {
            throw new Error(
                `Query parameter ":${name}" is used in mixed IN and non-IN positions; ` +
                `a name cannot be both an expanded IN list and a scalar.`,
            );
        }
    }
    return order.map(name => ({ name, inExpansion: expand.get(name) ?? false }));
}

/**
 * Replace `:name` with `$n` (first-appearance order; repeats reuse the same
 * `$n`). Only IN-list occurrences with an array value expand to multiple slots;
 * every other value (including array-VALUED columns and JSON objects) is a
 * single slot. Driven entirely by the shared scanner (spec §6.5).
 */
export function expandScanned(
    sql: string,
    params: Record<string, DriverParamValue>,
): string {
    const occ = scanPlaceholders(sql);
    const names = uniqueNames(occ).filter(u => u.name in params);
    // Assign starting positions in appearance order.
    const startPos = new Map<string, number>();
    let pos = 1;
    for (const u of names) {
        startPos.set(u.name, pos);
        const v = params[u.name];
        pos += u.inExpansion && Array.isArray(v) ? v.length : 1;
    }
    // Rewrite right-to-left so indices stay valid; skip occurrences whose name
    // isn't supplied (left as a literal — caught by assertAllProvided when live).
    let out = sql;
    for (let k = occ.length - 1; k >= 0; k--) {
        const o = occ[k];
        if (!(o.name in params)) continue;
        const p = startPos.get(o.name)!;
        const v = params[o.name];
        const replacement = o.inExpansion && Array.isArray(v)
            ? v.map((_, idx) => `$${p + idx}`).join(", ")
            : `$${p}`;
        out = out.slice(0, o.start) + replacement + out.slice(o.end);
    }
    return out;
}

/**
 * Flattened param values in placeholder order. IN-list arrays are spread; all
 * other values pass through as one entry. Throws if a used value is undefined.
 */
export function collectScanned(
    sql: string,
    params: Record<string, DriverParamValue>,
): DriverParamValue[] {
    const occ = scanPlaceholders(sql);
    const names = uniqueNames(occ).filter(u => u.name in params);
    const result: DriverParamValue[] = [];
    for (const u of names) {
        const v = params[u.name];
        if (v === undefined) {
            throw new Error(
                `Query parameter ":${u.name}" is used but its value is undefined`,
            );
        }
        if (u.inExpansion && Array.isArray(v)) result.push(...v);
        else result.push(v);
    }
    return result;
}

/**
 * Live-placeholder check (spec §6.3): throw for any real placeholder in the
 * assembled SQL whose name is absent from `params`. Conditional fragments that
 * were excluded contribute no placeholder, so they never trip this.
 */
export function assertAllProvided(
    sql: string,
    params: Record<string, DriverParamValue>,
): void {
    for (const o of scanPlaceholders(sql)) {
        if (!(o.name in params)) {
            throw new Error(`Missing value for query parameter ":${o.name}"`);
        }
    }
}

/** One-shot: live-check then return `{ sql: expanded, values }`. */
export function prepareScanned(
    sql: string,
    params: Record<string, DriverParamValue>,
): { sql: string; values: DriverParamValue[] } {
    assertAllProvided(sql, params);
    return { sql: expandScanned(sql, params), values: collectScanned(sql, params) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/builder/scanner-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the pinned legacy params test is untouched**

Run: `bun test tests/builder/params.test.ts && npx tsc --noEmit`
Expected: PASS (legacy behavior unchanged), tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/builder/scanner.ts tests/builder/scanner-runtime.test.ts
git commit -m "feat(builder): scanner-based expand/collect/live-check with position-aware IN-expansion"
```

---

## Phase 1 — Type-level inference (`ExtractParams` / `ExtractReturning`)

### Task 3: Productionize the spike core into `src/builder/extract-params.ts`

**Files:**
- Create: `src/builder/extract-params.ts`
- Create: `tests/builder/fixtures/write-schema.ts`
- Create: `tests/builder/types/extract-params.test.ts`
- Create: `tests/builder/types/extract-returning.test.ts`

- [ ] **Step 1: Create the shared branded fixture**

Create `tests/builder/fixtures/write-schema.ts` by copying `tests/spike/schema.ts` content verbatim (it is the realistic monorepo-shaped fixture), changing only the header comment:

```ts
// tests/builder/fixtures/write-schema.ts
// Realistic branded schema fixture for the write-builder tests. Mirrors the
// monorepo shape: branded scalar field types, FK columns referencing other
// brands, nullable columns, JSON columns, and wide tables (the TS2589 stressor).
import type { DatabaseSchema } from "../../../src/schema.js";

export type User_id = string & { __table: "User" };
export type Order_id = string & { __table: "Order" };
export type Product_id = string & { __table: "Product" };
export type Team_id = string & { __table: "Team" };
export type Invoice_id = string & { __table: "Invoice" };
export type Json = unknown;

type WideUser = {
    id: User_id;
    teamId: Team_id | null;
    email: string;
    name: string | null;
    phone: string | null;
    status: "active" | "pending" | "banned";
    age: number;
    score: number | null;
    verified: boolean;
    createdAt: string;
    updatedAt: string | null;
    metadata: Json;
    c13: string; c14: string; c15: string; c16: string;
    c17: string; c18: string; c19: string; c20: string;
    c21: number | null; c22: number; c23: boolean; c24: boolean;
    c25: string | null; c26: string; c27: string; c28: string;
    c29: string; c30: string; c31: string; c32: string;
};

type WideOrder = {
    id: Order_id;
    userId: User_id;
    productId: Product_id | null;
    teamId: Team_id | null;
    invoiceId: Invoice_id | null;
    amount: number;
    currency: string;
    quantity: number;
    note: string | null;
    paid: boolean;
    createdAt: string;
    d12: string; d13: string; d14: string; d15: string;
    d16: string; d17: string; d18: string; d19: string;
    d20: number | null; d21: number; d22: boolean; d23: boolean;
    d24: string | null; d25: string; d26: string; d27: string;
    d28: string; d29: string; d30: string;
};

type Product = {
    id: Product_id;
    name: string;
    price: number;
    active: boolean;
    tags: string[];          // array-VALUED column (distinct from IN-expansion)
    meta: { sku: string };   // JSON/object column
};

export type WriteSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: WideUser;
            orders: WideOrder;
            products: Product;
        };
    };
};

export const asUserId = (s: string) => s as User_id;
export const asOrderId = (s: string) => s as Order_id;
export const asProductId = (s: string) => s as Product_id;
export const asTeamId = (s: string) => s as Team_id;
```

- [ ] **Step 2: Write the failing type test**

Create `tests/builder/types/extract-params.test.ts` (ported probes from `tests/spike/probe.ts`, retargeted to the production module):

```ts
// tests/builder/types/extract-params.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ExtractParams } from "../../../src/builder/extract-params.js";
import type {
    WriteSchema, User_id, Team_id, Order_id, Product_id,
} from "../fixtures/write-schema.js";
import { asUserId } from "../fixtures/write-schema.js";

// INSERT — positional column↔value pairing
type I1 = ExtractParams<
    "insert into orders (userId, amount, currency) values (:uid, :amt, :cur)", WriteSchema>;
type _I1 = RequireTrue<AssertEqual<I1, { uid: User_id; amt: number; cur: string }>>;

// branded FK + nullability
type I2 = ExtractParams<
    "insert into users (id, teamId, email) values (:id, :team, :email)", WriteSchema>;
type _I2 = RequireTrue<AssertEqual<I2, { id: User_id; team: Team_id | null; email: string }>>;

// non-:name fragments (literal/expr) contribute no param
type I3 = ExtractParams<
    "insert into orders (userId, amount, createdAt) values (:uid, 100, now())", WriteSchema>;
type _I3 = RequireTrue<AssertEqual<I3, { uid: User_id }>>;

// UPDATE set + where
type U1 = ExtractParams<
    "update orders set amount = :amt, currency = :cur where id = :oid", WriteSchema>;
type _U1 = RequireTrue<AssertEqual<U1, { amt: number; cur: string; oid: Order_id }>>;

// DELETE where incl. IN → array
type D2 = ExtractParams<"delete from products where id in (:ids)", WriteSchema>;
type _D2 = RequireTrue<AssertEqual<D2, { ids: Product_id[] }>>;

// ON CONFLICT DO UPDATE SET params resolve against target table
type C1 = ExtractParams<
    "insert into orders (id, amount) values (:id, :amt) on conflict (id) do update set amount = :amt2, currency = :cur",
    WriteSchema>;
type _C1 = RequireTrue<AssertEqual<C1, { id: Order_id; amt: number; amt2: number; cur: string }>>;

// excluded.col contributes no param; conflict WHERE param does
type C3 = ExtractParams<
    "insert into orders (id, amount) values (:id, :amt) on conflict (id) do update set amount = excluded.amount where amount > :floor",
    WriteSchema>;
type _C3 = RequireTrue<AssertEqual<C3, { id: Order_id; amt: number; floor: number }>>;

// array-VALUED column and JSON column flow through as the column type
type AR2 = ExtractParams<"update products set tags = :tags where id = :id", WriteSchema>;
type _AR2 = RequireTrue<AssertEqual<AR2, { tags: string[]; id: Product_id }>>;
type AR3 = ExtractParams<"update products set meta = :meta where id = :id", WriteSchema>;
type _AR3 = RequireTrue<AssertEqual<AR3, { meta: { sku: string }; id: Product_id }>>;

// Exact-brand enforcement at call sites
type InsP = ExtractParams<
    "insert into orders (userId, amount, currency) values (:uid, :amt, :cur)", WriteSchema>;
const _ok: InsP = { uid: asUserId("u1"), amt: 5, cur: "GBP" };
// @ts-expect-error plain string is not assignable to User_id (exact brand)
const _bad1: InsP = { uid: "u1", amt: 5, cur: "GBP" };
// @ts-expect-error number where string column expected
const _bad2: InsP = { uid: asUserId("u1"), amt: 5, cur: 123 };
void _ok; void _bad1; void _bad2;
```

- [ ] **Step 3: Run tsc to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — `Cannot find module '.../extract-params.js'`.

- [ ] **Step 4: Create the production module**

Create `src/builder/extract-params.ts` by copying the proven body of `tests/spike/extract-params.ts`, with these exact edits:
1. Fix import paths to `../` (it now lives in `src/builder/`): `../schema.js`, `../parsing.js`, `../tables.js`, `../utils.js`.
2. Import `DriverParamValue` from `./scanner.js` (used by the loose fallback in Task 4).
3. Keep `ExtractParams` and `ExtractReturning` exported; keep all helpers as-is for now (Tasks 4–8 evolve them).

```ts
// src/builder/extract-params.ts
import type { DatabaseSchema } from "../schema.js";
import type { ColumnTypeFromTableKey, RowTypeForTable } from "../schema.js";
import type { NormalizeQuery } from "../parsing.js";
import type {
    ExtractInsertColumns, ExtractReturningList, ExtractLastWhere,
    ExtractBefore, SplitCommaSimple, SplitTopLevel, Trim, CleanIdent,
} from "../parsing.js";
import type {
    InsertTargetTable, UpdateTargetTable, DeleteTargetTable,
} from "../tables.js";
import type { Simplify } from "../utils.js";
import type { DriverParamValue } from "./scanner.js";

// ---- :name detection ----
export type ParamName<Token extends string> =
    Trim<Token> extends `:${infer Name}` ? CleanParamIdent<Name> : never;

type CleanParamIdent<S extends string> =
    S extends `${infer Head}::${string}` ? CleanParamIdent<Head>
    : S extends `${infer Head}${")" | "," | " "}${string}` ? Head
    : S;

type ColOf<S extends string> =
    FirstToken<Trim<S>> extends infer T extends string
        ? T extends `${infer _A}.${infer C}` ? C : T : never;
type FirstToken<S extends string> = S extends `${infer A} ${infer _}` ? A : S;

// ---- INSERT ----
export type ExtractInsertValues<N extends string> =
    N extends `${string} values (${infer V})${string}` ? SplitCommaSimple<V>
    : N extends `${string} values(${infer V2})${string}` ? SplitCommaSimple<V2>
    : [];

type ZipInsert<
    Cols extends readonly string[], Vals extends readonly string[],
    Table extends string, S extends DatabaseSchema, Acc = {},
> = Cols extends readonly [infer C extends string, ...infer CR extends string[]]
    ? Vals extends readonly [infer V extends string, ...infer VR extends string[]]
        ? ParamName<V> extends infer P
            ? [P] extends [never] ? ZipInsert<CR, VR, Table, S, Acc>
            : P extends string
                ? ZipInsert<CR, VR, Table, S, Acc & { [K in P]: ColumnTypeFromTableKey<Table, CleanIdent<C>, S> }>
                : ZipInsert<CR, VR, Table, S, Acc>
            : Acc
        : Acc
    : Acc;

type ConflictSetBlock<N extends string> =
    N extends `${string} do update set ${infer Rest}`
        ? ExtractBefore<ExtractBefore<Rest, " where ">, " returning "> : "";

type InsertParams<N extends string, S extends DatabaseSchema> =
    InsertTargetTable<N, S> extends infer Table extends string
        ? ZipInsert<ExtractInsertColumns<N>, ExtractInsertValues<N>, Table, S>
            & SetParams<SplitTopLevel<ConflictSetBlock<N>>, Table, S>
            & WhereParamsFor<N, Table, S>
        : {};

// ---- UPDATE SET ----
type ExtractSetBlock<N extends string> =
    N extends `${string} set ${infer Rest}`
        ? ExtractBefore<ExtractBefore<Rest, " where ">, " returning "> : "";

type SetParams<
    Pairs extends readonly string[], Table extends string,
    S extends DatabaseSchema, Acc = {},
> = Pairs extends readonly [infer P extends string, ...infer R extends string[]]
    ? P extends `${infer Left}=${infer Right}`
        ? ParamName<Right> extends infer Name
            ? [Name] extends [never] ? SetParams<R, Table, S, Acc>
            : Name extends string
                ? SetParams<R, Table, S, Acc & { [K in Name]: ColumnTypeFromTableKey<Table, CleanIdent<Left>, S> }>
                : SetParams<R, Table, S, Acc>
            : Acc
        : SetParams<R, Table, S, Acc>
    : Acc;

// ---- WHERE / USING ----
type WhereBlock<N extends string> =
    N extends `${string} where ${string}` ? ExtractLastWhere<N> : "";

type SplitConds<S extends string> =
    SplitOn<S, " and "> extends infer A extends string[] ? FlatSplit<A, " or "> : [];
type SplitOn<S extends string, D extends string> =
    S extends `${infer H}${D}${infer T}` ? [H, ...SplitOn<T, D>] : [S];
type FlatSplit<Parts extends readonly string[], D extends string, Acc extends string[] = []> =
    Parts extends readonly [infer H extends string, ...infer R extends string[]]
        ? FlatSplit<R, D, [...Acc, ...SplitOn<H, D>]> : Acc;

type WhereParam<Cond extends string, Table extends string, S extends DatabaseSchema> =
    Trim<Cond> extends `${infer Lhs} in (${infer Inner})`
        ? ParamName<Inner> extends infer P
            ? [P] extends [never] ? {}
            : P extends string ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S>[] } : {}
            : {}
        : Trim<Cond> extends `${infer Lhs}:${infer Tail}`
            ? CleanParamIdent<Tail> extends infer P
                ? [P] extends [never] ? {}
                : P extends "" ? {}
                : P extends string ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> } : {}
                : {}
            : {};

type WhereParams<
    Conds extends readonly string[], Table extends string,
    S extends DatabaseSchema, Acc = {},
> = Conds extends readonly [infer C extends string, ...infer R extends string[]]
    ? WhereParams<R, Table, S, Acc & WhereParam<C, Table, S>> : Acc;

type WhereParamsFor<N extends string, Table extends string, S extends DatabaseSchema> =
    WhereParams<SplitConds<WhereBlock<N>>, Table, S>;

// ---- dispatch ----
type ParamsForKind<N extends string, S extends DatabaseSchema> =
    N extends `insert into ${string}` ? InsertParams<N, S>
    : N extends `update ${string}`
        ? UpdateTargetTable<N, S> extends infer T extends string
            ? SetParams<SplitTopLevel<ExtractSetBlock<N>>, T, S> & WhereParamsFor<N, T, S> : {}
    : N extends `delete from ${string}`
        ? DeleteTargetTable<N, S> extends infer T extends string ? WhereParamsFor<N, T, S> : {}
    : N extends `${"select" | "with"} ${string}`
        ? DeleteTargetTable<N, S> extends infer T extends string ? WhereParamsFor<N, T, S> : {}
    : {};

export type ExtractParams<Query extends string, S extends DatabaseSchema> =
    NormalizeQuery<Query> extends infer N extends string ? Simplify<ParamsForKind<N, S>> : {};

// ---- RETURNING ----
type TargetForReturning<N extends string, S extends DatabaseSchema> =
    N extends `insert into ${string}` ? InsertTargetTable<N, S>
    : N extends `update ${string}` ? UpdateTargetTable<N, S>
    : N extends `delete from ${string}` ? DeleteTargetTable<N, S>
    : never;

type ReturningRow<
    Cols extends readonly string[], Table extends string,
    S extends DatabaseSchema, Acc = {},
> = Cols extends readonly [infer C extends string, ...infer R extends string[]]
    ? CleanIdent<C> extends "*" ? RowTypeForTable<Table, S>
    : ReturningRow<R, Table, S, Acc & { [K in CleanIdent<C>]: ColumnTypeFromTableKey<Table, CleanIdent<C>, S> }>
    : Acc;

export type ExtractReturning<Query extends string, S extends DatabaseSchema> =
    NormalizeQuery<Query> extends infer N extends string
        ? ExtractReturningList<N> extends infer L extends string
            ? L extends "" ? {}
            : TargetForReturning<N, S> extends infer T extends string
                ? Simplify<ReturningRow<SplitTopLevel<L>, T, S>> : {}
            : {}
        : {};

// Referenced here so the import is retained until Task 4 wires the loose
// fallback; removing it before then is fine if unused.
export type __DriverParamValue = DriverParamValue;
```

- [ ] **Step 5: Create the RETURNING type test**

Create `tests/builder/types/extract-returning.test.ts`:

```ts
// tests/builder/types/extract-returning.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ExtractReturning } from "../../../src/builder/extract-params.js";
import type { WriteSchema, Order_id } from "../fixtures/write-schema.js";

type R1 = ExtractReturning<
    "insert into orders (userId, amount) values (:uid, :amt) returning id, currency", WriteSchema>;
type _R1 = RequireTrue<AssertEqual<R1, { id: Order_id; currency: string }>>;

type R2 = ExtractReturning<
    "update orders set amount = :amt where id = :oid returning id, amount", WriteSchema>;
type _R2 = RequireTrue<AssertEqual<R2, { id: Order_id; amount: number }>>;

// no RETURNING → {}
type R3 = ExtractReturning<"delete from orders where id = :id", WriteSchema>;
type _R3 = RequireTrue<AssertEqual<R3, {}>>;

// returning * → full row
type R4 = ExtractReturning<"delete from products where id = :id returning *", WriteSchema>;
type _R4 = RequireTrue<AssertEqual<R4["id"], import("../fixtures/write-schema.js").Product_id>>;
```

- [ ] **Step 6: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0 (the spike already proves this core compiles; the production copy must too).

- [ ] **Step 7: Commit**

```bash
git add src/builder/extract-params.ts tests/builder/fixtures/write-schema.ts tests/builder/types/extract-params.test.ts tests/builder/types/extract-returning.test.ts
git commit -m "feat(builder): productionize ExtractParams/ExtractReturning from spike"
```

---

### Task 4: Loose fallback as include-not-drop (`DriverParamValue`)

Spec §4.1 + §6.5: an unrecognized WHERE condition currently returns `{}`, **dropping** the param. It must instead include the name typed `DriverParamValue`.

**Files:**
- Modify: `src/builder/extract-params.ts`
- Modify: `tests/builder/types/extract-params.test.ts`

- [ ] **Step 1: Add the failing probe**

Append to `tests/builder/types/extract-params.test.ts`:

```ts
import type { DriverParamValue } from "../../../src/builder/scanner.js";

// Reversed operand order → loose, present (not dropped)
type L1 = ExtractParams<"delete from orders where :p = amount", WriteSchema>;
type _L1 = RequireTrue<AssertEqual<L1, { p: DriverParamValue }>>;

// Placeholder inside a function → loose, present
type L2 = ExtractParams<"delete from orders where lower(currency) = :c", WriteSchema>;
type _L2 = RequireTrue<AssertEqual<L2, { c: DriverParamValue }>>;
```

- [ ] **Step 2: Run tsc to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — `L1`/`L2` are `{}` (param dropped), not `{ p: DriverParamValue }`.

- [ ] **Step 3: Make `WhereParam` include unrecognized placeholders as loose**

In `src/builder/extract-params.ts`, replace the three `: {}` fallback arms inside `WhereParam` with a loose-include helper, and add it. The final `: {}` (a condition with no placeholder at all) stays `{}`:

```ts
// Extract EVERY placeholder name in a fragment and type each DriverParamValue.
// Used as the loose fallback (spec §6.5) — present, not dropped, not column-typed.
type LooseParams<S extends string, Acc = {}> =
    S extends `${infer _Pre}:${infer Tail}`
        ? CleanParamIdent<Tail> extends infer P
            ? [P] extends [never] ? Acc
            : P extends "" ? Acc
            : P extends string ? LooseParams<AfterName<Tail>, Acc & { [K in P]: DriverParamValue }>
            : Acc
            : Acc
        : Acc;
// Advance past the just-consumed name so multiple placeholders are all caught.
type AfterName<S extends string> =
    S extends `${infer Head}${")" | "," | " "}${infer Rest}`
        ? Head extends `${string}:${string}` ? S : Rest
        : "";

type WhereParam<Cond extends string, Table extends string, S extends DatabaseSchema> =
    Trim<Cond> extends `${infer Lhs} in (${infer Inner})`
        ? ParamName<Inner> extends infer P
            ? [P] extends [never] ? LooseParams<Inner>
            : P extends string ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S>[] } : LooseParams<Inner>
            : LooseParams<Inner>
        : Trim<Cond> extends `${infer Lhs}:${infer Tail}`
            ? CleanParamIdent<Tail> extends infer P
                ? [P] extends [never] ? LooseParams<Cond>
                : P extends "" ? LooseParams<Cond>
                : P extends string
                    // Recognized `col <op> :p` only when Lhs reduces to a bare column.
                    ? IsBareColumn<Lhs> extends true
                        ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> }
                        : LooseParams<Cond>
                    : LooseParams<Cond>
                : LooseParams<Cond>
            : LooseParams<Cond>;

// `Lhs` is a bare column ref (optionally alias-qualified) followed by an
// operator — i.e. it contains no "(" (no function) and no extra ":".
type IsBareColumn<Lhs extends string> =
    Lhs extends `${string}(${string}` ? false
    : Lhs extends `${string}:${string}` ? false
    : true;
```

> Note: `IsBareColumn` makes `lower(currency) = :c` and `:p = amount` (Lhs `:p = amount` contains `:` after the split? — here Lhs is the text before the matched `:`, so for `:p = amount` the first `:` is at the start, Lhs is empty → `ColOf<"">` fails → falls to loose via the empty-name guard). Run the probes to confirm both resolve loose.

- [ ] **Step 4: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0. If `_L1`/`_L2` still fail, adjust `IsBareColumn`/`AfterName` and re-run (TDD loop). Re-confirm the Task 3 probes (`I1`,`U1`,`D2`,`C1`,`C3`,`AR2`,`AR3`) still pass — recognized patterns must be unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/builder/extract-params.ts tests/builder/types/extract-params.test.ts
git commit -m "feat(builder): loose WHERE fallback includes placeholders as DriverParamValue"
```

---

### Task 5: `between :lo and :hi` and `is [not] distinct from :p`

Spec §4.1/§6.4: the naive `and`/`or` splitter breaks `between` (the inner `and` splits the range). Add a range-aware pass **before** the boolean split.

**Files:**
- Modify: `src/builder/extract-params.ts`
- Modify: `tests/builder/types/extract-params.test.ts`

- [ ] **Step 1: Add the failing probes**

Append to `tests/builder/types/extract-params.test.ts`:

```ts
type B1 = ExtractParams<"delete from orders where amount between :lo and :hi", WriteSchema>;
type _B1 = RequireTrue<AssertEqual<B1, { lo: number; hi: number }>>;

type B2 = ExtractParams<
    "delete from orders where amount between :lo and :hi and currency = :cur", WriteSchema>;
type _B2 = RequireTrue<AssertEqual<B2, { lo: number; hi: number; cur: string }>>;

type DN1 = ExtractParams<
    "update orders set paid = :paid where currency is distinct from :cur", WriteSchema>;
type _DN1 = RequireTrue<AssertEqual<DN1, { paid: boolean; cur: string }>>;

type DN2 = ExtractParams<
    "delete from orders where currency is not distinct from :cur", WriteSchema>;
type _DN2 = RequireTrue<AssertEqual<DN2, { cur: string }>>;
```

- [ ] **Step 2: Run tsc to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — `between` splits at the inner `and` leaving `:hi` unresolved; `is distinct from` not recognized.

- [ ] **Step 3: Recognize the two patterns**

In `src/builder/extract-params.ts`, add a recognizer at the **top** of `WhereParam` (before the `in (...)` arm) so it wins on the whole condition. Also pre-protect `between` so the boolean splitter does not cut it: detect a `between ... and ...` leaf inside `WhereParam` directly (the leaf still contains `... and ...`, so handle it before splitting by recognizing the `between` keyword in the condition text passed in). Implement by giving `WhereParam` first crack at the un-split fragment via `SplitConds` emitting `between` leaves intact:

Replace `SplitConds` with a range-protecting variant:

```ts
// Split on top-level " and "/" or ", but keep a `between X and Y` range intact:
// when a part ends with a dangling `between ... ` (no closing operand yet),
// re-glue it with the following part.
type SplitConds<S extends string> =
    Reglue<SplitOn<S, " and ">> extends infer A extends string[]
        ? FlatSplit<A, " or "> : [];

type Reglue<Parts extends readonly string[], Acc extends string[] = []> =
    Parts extends readonly [infer H extends string, infer N extends string, ...infer R extends string[]]
        ? EndsWithBetween<H> extends true
            ? Reglue<[`${H} and ${N}`, ...R], Acc>
            : Reglue<[N, ...R], [...Acc, H]>
        : Parts extends readonly [infer L extends string]
            ? [...Acc, L]
            : Acc;

type EndsWithBetween<S extends string> =
    Lowercase<Trim<S>> extends `${string} between ${infer Rest}`
        ? Rest extends `${string} and ${string}` ? false : true
        : false;
```

Then add the two recognizers at the top of `WhereParam`:

```ts
type WhereParam<Cond extends string, Table extends string, S extends DatabaseSchema> =
    // col between :lo and :hi
    Lowercase<Trim<Cond>> extends `${infer Lhs} between ${infer Lo} and ${infer Hi}`
        ? BetweenParams<Lhs, Lo, Hi, Table, S>
    // col is [not] distinct from :p
    : Lowercase<Trim<Cond>> extends `${infer Lhs} is not distinct from ${infer Rhs}`
        ? DistinctParam<Lhs, Rhs, Table, S>
    : Lowercase<Trim<Cond>> extends `${infer Lhs} is distinct from ${infer Rhs}`
        ? DistinctParam<Lhs, Rhs, Table, S>
    // ... existing `in (...)` / `col <op> :p` / loose arms unchanged ...
    : Trim<Cond> extends `${infer Lhs} in (${infer Inner})` ? /* unchanged */ never
    : never; // (keep the remaining existing arms verbatim below this point)
```

> Implementation detail: `Lowercase<Trim<Cond>>` is matched only to *find* the keyword boundaries; pass the **original-case** `Lhs`/operands to `ColOf`/`ParamName` so identifier case and brand resolution are unaffected. Capture both by matching the original `Trim<Cond>` with the same shape once the keyword position is known, OR split on a case-insensitive helper. The simplest correct approach: since `NormalizeQuery` lowercases keywords but preserves identifier/quoted case, match `Trim<Cond>` directly against `between`/`is distinct from` (already lowercase post-normalize) without `Lowercase<>`. Verify against the probes.

Add the helpers:

```ts
type BetweenParams<Lhs extends string, Lo extends string, Hi extends string,
    Table extends string, S extends DatabaseSchema> =
    ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> extends infer CT
        ? IsBareColumn<Lhs> extends true
            ? MergeName<ParamName<Lo>, CT> & MergeName<ParamName<Hi>, CT>
                & LooseLeftover<Lo, Hi>
            : LooseParams<`${Lo} ${Hi}`>
        : {};

type DistinctParam<Lhs extends string, Rhs extends string,
    Table extends string, S extends DatabaseSchema> =
    IsBareColumn<Lhs> extends true
        ? MergeName<ParamName<Rhs>, ColumnTypeFromTableKey<Table, ColOf<Lhs>, S>>
        : LooseParams<Rhs>;

// { name: T } when name is a real param, else {} (a literal operand contributes none).
type MergeName<P, T> = [P] extends [never] ? {} : P extends string ? { [K in P]: T } : {};
// If an operand is not a placeholder it contributes nothing; this no-op keeps
// the between arm total.
type LooseLeftover<_Lo extends string, _Hi extends string> = {};
```

- [ ] **Step 4: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0; `_B1`,`_B2`,`_DN1`,`_DN2` pass, all earlier probes still pass.

- [ ] **Step 5: Commit**

```bash
git add src/builder/extract-params.ts tests/builder/types/extract-params.test.ts
git commit -m "feat(builder): recognize BETWEEN and IS [NOT] DISTINCT FROM param patterns"
```

---

### Task 6: Expression-wrapped RHS placeholders → present-but-loose

Spec §6: a placeholder **inside an expression** in an INSERT value or a SET RHS (`coalesce(:p,'')`, `col + :n`, `lower(:s)`, or two placeholders in one RHS) must have its name(s) extracted and typed **loose**, not dropped, not column-typed. Only an RHS that is *exactly* `:name` binds to the column.

**Files:**
- Modify: `src/builder/extract-params.ts`
- Modify: `tests/builder/types/extract-params.test.ts`

- [ ] **Step 1: Add the failing probes**

```ts
// INSERT value wrapped in an expression → loose
type E1 = ExtractParams<
    "insert into orders (userId, currency) values (:uid, coalesce(:cur, ''))", WriteSchema>;
type _E1 = RequireTrue<AssertEqual<E1, { uid: User_id; cur: DriverParamValue }>>;

// SET RHS expression → loose
type E2 = ExtractParams<"update orders set amount = amount + :n where id = :oid", WriteSchema>;
type _E2 = RequireTrue<AssertEqual<E2, { n: DriverParamValue; oid: Order_id }>>;

// two placeholders in one RHS → both loose
type E3 = ExtractParams<
    "update orders set note = concat(:a, :b) where id = :oid", WriteSchema>;
type _E3 = RequireTrue<AssertEqual<E3, { a: DriverParamValue; b: DriverParamValue; oid: Order_id }>>;
```

- [ ] **Step 2: Run tsc to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — current `ZipInsert`/`SetParams` only match an RHS that is exactly `:name` (via `ParamName`), so these drop the params.

- [ ] **Step 3: Add the exact-vs-expression branch**

In `ZipInsert`, when `ParamName<V>` is `never` but the value text still contains a `:`, fall back to `LooseParams<V>` instead of contributing nothing:

```ts
type ZipInsert<Cols, Vals, Table, S, Acc = {}> =
    Cols extends readonly [infer C extends string, ...infer CR extends string[]]
        ? Vals extends readonly [infer V extends string, ...infer VR extends string[]]
            ? ParamName<V> extends infer P
                ? [P] extends [never]
                    // not exactly `:name` → extract any inner placeholders loose
                    ? ZipInsert<CR, VR, Table, S, Acc & LooseParams<V>>
                    : P extends string
                        ? ZipInsert<CR, VR, Table, S, Acc & { [K in P]: ColumnTypeFromTableKey<Table, CleanIdent<C>, S> }>
                        : ZipInsert<CR, VR, Table, S, Acc>
                : Acc
            : Acc
        : Acc;
```

Apply the identical change to `SetParams` (the `[Name] extends [never]` arm becomes `SetParams<R, Table, S, Acc & LooseParams<Right>>`).

- [ ] **Step 4: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0; `_E1`–`_E3` pass. Re-confirm `I3` (`now()` / `100` contribute nothing — they have no `:`, so `LooseParams` yields `{}`).

- [ ] **Step 5: Commit**

```bash
git add src/builder/extract-params.ts tests/builder/types/extract-params.test.ts
git commit -m "feat(builder): expression-wrapped RHS placeholders typed loose, not dropped"
```

---

### Task 7: Target-alias qualifier scoping + foreign-qualifier loose fallback

Spec §6.1: capture the target's own alias (`update orders o … where o.id`, `insert into orders as o …`), resolve unqualified + target-alias-qualified refs against the target table, and widen **other** qualifiers to loose.

**Files:**
- Modify: `src/builder/extract-params.ts`
- Modify: `tests/builder/types/extract-params.test.ts`

- [ ] **Step 1: Add the failing probes**

```ts
// target alias qualifier resolves against target table
type Q1 = ExtractParams<"update orders o set amount = :amt where o.id = :oid", WriteSchema>;
type _Q1 = RequireTrue<AssertEqual<Q1, { amt: number; oid: Order_id }>>;

// foreign qualifier (FROM alias) → loose, not mis-bound
type Q2 = ExtractParams<
    "update orders o set amount = :amt from users u where u.id = :uid and o.id = :oid", WriteSchema>;
type _Q2 = RequireTrue<AssertEqual<Q2, { amt: number; uid: DriverParamValue; oid: Order_id }>>;
```

- [ ] **Step 2: Run tsc to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — `ColOf` strips any alias and resolves every qualified ref against the target, so `u.id` mis-binds to `orders.id` (or errors) instead of going loose.

- [ ] **Step 3: Capture the target alias and gate qualified refs**

Add an alias extractor and thread it into WHERE resolution. The target alias is the token after the target table name in `update <table> <alias>`, `delete from <table> <alias>`, `insert into <table> as <alias>`:

```ts
type TargetAlias<N extends string> =
    N extends `update ${infer Rest}` ? AliasAfterTable<Rest>
    : N extends `delete from ${infer Rest}` ? AliasAfterTable<Rest>
    : N extends `insert into ${infer Rest}`
        ? Rest extends `${infer _T} as ${infer A} ${string}` ? FirstToken<Trim<A>>
        : Rest extends `${infer _T} as ${infer A}` ? FirstToken<Trim<A>> : ""
    : "";
// `<table> <alias> set|from|where|using|...` — alias is the 2nd token if it is
// not itself a clause keyword.
type AliasAfterTable<Rest extends string> =
    Rest extends `${infer _Table} ${infer After}`
        ? FirstToken<Trim<After>> extends infer A extends string
            ? A extends "set" | "where" | "from" | "using" | "(" | "as" ? ""
            : A extends `(${string}` ? "" : A
            : ""
        : "";
```

Change `WhereParam` to take the alias and only honor a qualifier equal to the target table name or the captured alias; otherwise route to loose. Add a qualifier check to the `col <op> :p` arm:

```ts
// In the recognized `col <op> :p` arm, replace the bind with a scoped bind:
ScopedBind<Lhs, P, Alias, Table, S>

type ScopedBind<Lhs extends string, P extends string, Alias extends string,
    Table extends string, S extends DatabaseSchema> =
    Trim<Lhs> extends `${infer Qual}.${infer _Col}`
        ? Qual extends Alias ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> }
        : LowerEq<Qual, BaseName<Table>> extends true ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> }
        : { [K in P]: DriverParamValue }                      // foreign qualifier → loose
        : { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> }; // unqualified

type BaseName<TableKey extends string> =
    TableKey extends `${string}.${infer T}` ? T : TableKey;
type LowerEq<A extends string, B extends string> =
    Lowercase<A> extends Lowercase<B> ? true : false;
```

Thread `Alias = TargetAlias<N>` through `WhereParamsFor → WhereParams → WhereParam → ScopedBind` (add the parameter to each). Apply the same `ScopedBind` inside `BetweenParams`/`DistinctParam`.

- [ ] **Step 4: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0; `_Q1`,`_Q2` pass; all earlier WHERE probes (`U1`,`D2`,`C3`,`B*`,`DN*`) still pass (unqualified refs unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/builder/extract-params.ts tests/builder/types/extract-params.test.ts
git commit -m "feat(builder): target-alias scoping; foreign qualifiers widen to loose (§6.1)"
```

---

### Task 8: Multi-row INSERT → `[SQL Error]` type

Spec §3: detect a top-level tuple separator after `VALUES` (scanner-aware, whitespace-tolerant) and resolve to a `[SQL Error] multi-row VALUES not supported …` type so `.withParams` is unusable.

**Files:**
- Modify: `src/builder/extract-params.ts`
- Modify: `tests/builder/types/extract-params.test.ts`

- [ ] **Step 1: Add the failing probes**

```ts
// multi-row INSERT → error type (not a usable param object)
type MR1 = ExtractParams<
    "insert into orders (userId, amount) values (:a, 1), (:b, 2)", WriteSchema>;
type _MR1 = RequireTrue<AssertExtends<MR1, { __error: true }>>;

// `),(` inside a string literal is NOT multi-row
type MR2 = ExtractParams<
    "insert into orders (userId, note) values (:uid, '),(')", WriteSchema>;
type _MR2 = RequireTrue<AssertEqual<MR2, { uid: User_id }>>;
```

Add `AssertExtends` to the imports from `../../fixtures/helpers.js`.

- [ ] **Step 2: Run tsc to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — `MR1` currently infers from the first tuple only; no error type.

- [ ] **Step 3: Detect the top-level tuple separator**

Add a type-level scanner that, restricted to the substring after ` values `, walks char-by-char tracking quote and paren depth, and reports `true` if it ever sees depth returning to 0 then re-opening a `(` (i.e. `) ... (` at top level). Use the chunked-driver pattern (step cap + yielded state) per the depth contract:

```ts
type IsMultiRowInsert<N extends string> =
    N extends `${string} values ${infer After}` ? HasTopLevelTupleSep<After> : false;

// Walk After: skip single-quoted literals; track paren depth; once we've closed
// the first tuple (depth back to 0 after having been >0), a subsequent "(" at
// depth 0 means another tuple. Step-capped; widens to false on overrun.
type HasTopLevelTupleSep<
    S extends string, Depth extends any[] = [], Closed extends boolean = false,
    Steps extends any[] = [],
> = Steps["length"] extends 400 ? false
    : S extends `''${infer R}` ? HasTopLevelTupleSep<R, Depth, Closed, [any, ...Steps]>
    : S extends `'${infer _Q}'${infer R}` ? HasTopLevelTupleSep<R, Depth, Closed, [any, ...Steps]>
    : S extends `(${infer R}`
        ? Depth extends [] // depth 0
            ? Closed extends true ? true : HasTopLevelTupleSep<R, [any], Closed, [any, ...Steps]>
            : HasTopLevelTupleSep<R, [any, ...Depth], Closed, [any, ...Steps]>
        : S extends `)${infer R}`
            ? Depth extends [any, ...infer Rest extends any[]]
                ? Rest extends [] ? HasTopLevelTupleSep<R, [], true, [any, ...Steps]>
                : HasTopLevelTupleSep<R, Rest, Closed, [any, ...Steps]>
                : HasTopLevelTupleSep<R, [], Closed, [any, ...Steps]>
        : S extends `${infer _C}${infer R}` ? HasTopLevelTupleSep<R, Depth, Closed, [any, ...Steps]>
        : false;
```

> The `'${infer _Q}'` arm consumes a whole single-quoted literal (the `''` arm handles the empty/`''` escape first), so `'),('` inside a literal is skipped — satisfying `MR2`.

Gate `InsertParams` on it:

```ts
type InsertParams<N extends string, S extends DatabaseSchema> =
    IsMultiRowInsert<N> extends true
        ? { __error: true; message: "[SQL Error] multi-row VALUES not supported in the typed path; use the untyped driver call" }
    : InsertTargetTable<N, S> extends infer Table extends string
        ? ZipInsert<ExtractInsertColumns<N>, ExtractInsertValues<N>, Table, S>
            & SetParams<SplitTopLevel<ConflictSetBlock<N>>, Table, S>
            & WhereParamsFor<N, Table, S>
        : {};
```

- [ ] **Step 4: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0; `_MR1`,`_MR2` pass; single-row INSERT probes unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/builder/extract-params.ts tests/builder/types/extract-params.test.ts
git commit -m "feat(builder): reject multi-row VALUES in typed path via [SQL Error] type (§3)"
```

---

## Phase 2 — `createSql` (raw typed wrapper)

### Task 9: `createSql<Schema>()`

Spec §5.2: a factory that binds `Schema` once and wraps a raw I/U/D string into a reusable typed query object with `.withParams()`, `.toString()`, `.getParams()`.

**Files:**
- Create: `src/builder/sql.ts`
- Create: `tests/builder/types/createsql.test.ts`
- Create: `tests/builder/createsql-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime test**

Create `tests/builder/createsql-runtime.test.ts`:

```ts
// tests/builder/createsql-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createSql } from "../../src/builder/sql.js";
import type { WriteSchema } from "./fixtures/write-schema.js";

const sql = createSql<WriteSchema>();

describe("createSql", () => {
    it("expands named params and collects values", () => {
        const q = sql("delete from orders where id = :id").withParams({ id: "o1" });
        expect(q.toString()).toBe("delete from orders where id = $1");
        expect([...q.getParams()]).toEqual(["o1"]);
    });

    it("runs the live-placeholder check", () => {
        const q = sql("delete from orders where id = :id and paid = :paid")
            .withParams({ id: "o1" } as any);
        expect(() => q.getParams()).toThrow('Missing value for query parameter ":paid"');
    });

    it("expands IN-list arrays", () => {
        const q = sql("delete from products where id in (:ids)").withParams({ ids: ["a", "b"] });
        expect(q.toString()).toBe("delete from products where id in ($1, $2)");
        expect([...q.getParams()]).toEqual(["a", "b"]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/builder/createsql-runtime.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `createSql`**

Create `src/builder/sql.ts`:

```ts
// src/builder/sql.ts
import type { DatabaseSchema } from "../schema.js";
import type { ExtractParams, ExtractReturning } from "./extract-params.js";
import {
    assertAllProvided, collectScanned, expandScanned, type DriverParamValue,
} from "./scanner.js";

/** A reusable, typed raw-SQL query object. */
export interface TypedSql<Q extends string, S extends DatabaseSchema> {
    withParams(params: ExtractParams<Q, S>): BoundSql<Q, S>;
    toString(): string;
}

export interface BoundSql<Q extends string, S extends DatabaseSchema> {
    toString(): string;
    getParams(): ReadonlyArray<DriverParamValue>;
    /** Phantom carrier for the RETURNING row type (read by createMutateFn). */
    readonly __returning?: ExtractReturning<Q, S>;
}

class BoundSqlImpl<Q extends string, S extends DatabaseSchema> {
    constructor(
        private readonly raw: string,
        private readonly params: Record<string, DriverParamValue>,
    ) {}
    toString(): string {
        assertAllProvided(this.raw, this.params);
        return expandScanned(this.raw, this.params);
    }
    getParams(): ReadonlyArray<DriverParamValue> {
        assertAllProvided(this.raw, this.params);
        return collectScanned(this.raw, this.params);
    }
}

class TypedSqlImpl<Q extends string, S extends DatabaseSchema> {
    constructor(private readonly raw: string) {}
    withParams(params: Record<string, DriverParamValue>): any {
        return new BoundSqlImpl<Q, S>(this.raw, params);
    }
    toString(): string {
        return this.raw;
    }
}

/** Factory binding the schema once; covers INSERT/UPDATE/DELETE in Phase 1. */
export function createSql<S extends DatabaseSchema>() {
    return function sql<Q extends string>(query: Q): TypedSql<Q, S> {
        return new TypedSqlImpl<Q, S>(query) as unknown as TypedSql<Q, S>;
    };
}
```

- [ ] **Step 4: Run the runtime test to verify it passes**

Run: `bun test tests/builder/createsql-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the type test**

Create `tests/builder/types/createsql.test.ts`:

```ts
// tests/builder/types/createsql.test.ts
import { createSql } from "../../../src/builder/sql.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asOrderId } from "../fixtures/write-schema.js";

const sql = createSql<WriteSchema>();

// exact brand required
sql("delete from orders where id = :id").withParams({ id: asOrderId("o1") });
// @ts-expect-error plain string is not Order_id
sql("delete from orders where id = :id").withParams({ id: "o1" });

// multi-row INSERT cannot be parameterized (params type is an error object)
// @ts-expect-error multi-row VALUES rejected in typed path
sql("insert into orders (userId, amount) values (:a, 1), (:b, 2)").withParams({ a: "x", b: "y" });
```

- [ ] **Step 6: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0 (the `@ts-expect-error` lines are expected errors; tsc passes when they fire).

- [ ] **Step 7: Commit**

```bash
git add src/builder/sql.ts tests/builder/types/createsql.test.ts tests/builder/createsql-runtime.test.ts
git commit -m "feat(builder): createSql typed raw-SQL wrapper"
```

---

## Phase 3 — Write builders

### Task 10: Write tag + `max`/`req` SQL assembly + conditional-param partition

Spec §5.1 + §6.6 + "*If → optional param contract". Mirror `sql-tag.ts`/`return-type.ts`: a tag with `cond` flags, a `max`/`req` SQL builder, and a `WriteParamsFor` that types a param **optional** iff it appears only in conditional fragments (`Partition` of `ExtractParams<Max>` keyed-required-by `ExtractParams<Req>`).

**Files:**
- Create: `src/builder/write-tag.ts`
- Create: `tests/builder/types/write-tag.test.ts`

- [ ] **Step 1: Write the failing type test**

Create `tests/builder/types/write-tag.test.ts`:

```ts
// tests/builder/types/write-tag.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { BuildInsertSQL, WriteParamsFor } from "../../../src/builder/write-tag.js";
import type { WriteSchema, User_id } from "../fixtures/write-schema.js";

// A tag with an unconditional (userId) and a conditional (note) value pair.
type Tag = {
    kind: "insert";
    table: "orders";
    values: readonly [
        { col: "userId"; text: ":uid"; cond: false },
        { col: "note"; text: ":note"; cond: true },
    ];
    conflict: null;
    wheres: readonly [];
    using: readonly [];
    from: readonly [];
    returning: null;
};

type _Max = RequireTrue<AssertEqual<
    BuildInsertSQL<Tag, "max">,
    "insert into orders (userId, note) values (:uid, :note)">>;
type _Req = RequireTrue<AssertEqual<
    BuildInsertSQL<Tag, "req">,
    "insert into orders (userId) values (:uid)">>;

// uid required (unconditional), note optional (conditional)
type P = WriteParamsFor<Tag, WriteSchema>;
type _Puid = RequireTrue<AssertEqual<P["uid"], User_id>>;
type _Pnote = RequireTrue<AssertEqual<P["note"], string | undefined>>;
```

- [ ] **Step 2: Run tsc to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the write tag**

Create `src/builder/write-tag.ts`:

```ts
// src/builder/write-tag.ts
import type { DatabaseSchema } from "../schema.js";
import type { ExtractParams, ExtractReturning } from "./extract-params.js";

export type WriteMode = "max" | "req";

export interface ValueFrag { readonly col: string; readonly text: string; readonly cond: boolean; }
export interface ClauseFrag { readonly text: string; readonly cond: boolean; }

export interface InsertTag {
    readonly kind: "insert";
    readonly table: string;
    readonly values: readonly ValueFrag[];
    readonly conflict: string | null;
    readonly wheres: readonly ClauseFrag[];     // unused for insert; kept uniform
    readonly using: readonly ClauseFrag[];
    readonly from: readonly ClauseFrag[];
    readonly returning: string | null;
}
export interface UpdateTag {
    readonly kind: "update";
    readonly table: string;
    readonly sets: readonly ClauseFrag[];
    readonly from: readonly ClauseFrag[];
    readonly wheres: readonly ClauseFrag[];
    readonly returning: string | null;
}
export interface DeleteTag {
    readonly kind: "delete";
    readonly table: string;
    readonly using: readonly ClauseFrag[];
    readonly wheres: readonly ClauseFrag[];
    readonly returning: string | null;
}

// keep only the fragments live for a mode ("req" drops cond=true).
type ForMode<List extends readonly { cond: boolean }[], Mode extends WriteMode> =
    Mode extends "max" ? List : DropCond<List>;
type DropCond<List extends readonly { cond: boolean }[]> =
    List extends readonly [infer H extends { cond: boolean }, ...infer R extends readonly { cond: boolean }[]]
        ? H["cond"] extends true ? DropCond<R> : readonly [H, ...DropCond<R>]
        : readonly [];

type ColList<List extends readonly ValueFrag[], Acc extends string = ""> =
    List extends readonly [infer H extends ValueFrag, ...infer R extends readonly ValueFrag[]]
        ? ColList<R, Acc extends "" ? H["col"] : `${Acc}, ${H["col"]}`> : Acc;
type ValList<List extends readonly ValueFrag[], Acc extends string = ""> =
    List extends readonly [infer H extends ValueFrag, ...infer R extends readonly ValueFrag[]]
        ? ValList<R, Acc extends "" ? H["text"] : `${Acc}, ${H["text"]}`> : Acc;
type JoinText<List extends readonly { text: string }[], Sep extends string, Acc extends string = ""> =
    List extends readonly [infer H extends { text: string }, ...infer R extends readonly { text: string }[]]
        ? JoinText<R, Sep, Acc extends "" ? H["text"] : `${Acc}${Sep}${H["text"]}`> : Acc;

type Conflict<C extends string | null> = C extends string ? ` on conflict ${C}` : "";
type Returning<R extends string | null> = R extends string ? ` returning ${R}` : "";
type FromClause<L extends readonly ClauseFrag[]> = L extends readonly [] ? "" : ` from ${JoinText<L, ", ">}`;
type UsingClause<L extends readonly ClauseFrag[]> = L extends readonly [] ? "" : ` using ${JoinText<L, ", ">}`;
type WhereClause<L extends readonly ClauseFrag[]> = L extends readonly [] ? "" : ` where ${JoinText<L, " and ">}`;

export type BuildInsertSQL<T extends InsertTag, Mode extends WriteMode> =
    ForMode<T["values"], Mode> extends infer V extends readonly ValueFrag[]
        ? `insert into ${T["table"]} (${ColList<V>}) values (${ValList<V>})${Conflict<T["conflict"]>}${Returning<T["returning"]>}`
        : never;

export type BuildUpdateSQL<T extends UpdateTag, Mode extends WriteMode> =
    `update ${T["table"]} set ${JoinText<ForMode<T["sets"], Mode>, ", ">}${FromClause<ForMode<T["from"], Mode>>}${WhereClause<ForMode<T["wheres"], Mode>>}${Returning<T["returning"]>}`;

export type BuildDeleteSQL<T extends DeleteTag, Mode extends WriteMode> =
    `delete from ${T["table"]}${UsingClause<ForMode<T["using"], Mode>>}${WhereClause<ForMode<T["wheres"], Mode>>}${Returning<T["returning"]>}`;

type BuildSQL<T, Mode extends WriteMode> =
    T extends InsertTag ? BuildInsertSQL<T, Mode>
    : T extends UpdateTag ? BuildUpdateSQL<T, Mode>
    : T extends DeleteTag ? BuildDeleteSQL<T, Mode>
    : never;

// Required iff present in the req-mode params; value type taken from max-mode
// (full §6.2 intersection over all occurrences). Mirrors return-type.ts Partition.
type Partition<Max, Req> =
    & { [K in keyof Max as K extends keyof Req ? K : never]: Max[K] }
    & { [K in keyof Max as K extends keyof Req ? never : K]?: Max[K] };

export type WriteParamsFor<T, S extends DatabaseSchema> =
    Partition<ExtractParams<BuildSQL<T, "max">, S>, ExtractParams<BuildSQL<T, "req">, S>> extends infer P
        ? { [K in keyof P]: P[K] } : never;

export type WriteReturnFor<T, S extends DatabaseSchema> =
    ExtractReturning<BuildSQL<T, "max"> & string, S>;
```

- [ ] **Step 4: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0; `_Max`,`_Req`,`_Puid`,`_Pnote` pass.

- [ ] **Step 5: Commit**

```bash
git add src/builder/write-tag.ts tests/builder/types/write-tag.test.ts
git commit -m "feat(builder): write tag with max/req SQL and conditional-param partition"
```

---

### Task 11: `createInsertQuery`

Spec §5.1 (INSERT) + §6.6 (empty-set throw).

**Files:**
- Create: `src/builder/write-state.ts`
- Create: `src/builder/write-assemble.ts`
- Create: `src/builder/insert.ts`
- Create: `tests/builder/insert-runtime.test.ts`
- Create: `tests/builder/types/insert-types.test.ts`

- [ ] **Step 1: Write the failing runtime test**

Create `tests/builder/insert-runtime.test.ts`:

```ts
// tests/builder/insert-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createInsertQuery } from "../../src/builder/insert.js";
import type { WriteSchema } from "./fixtures/write-schema.js";

describe("createInsertQuery", () => {
    it("assembles columns/values and expands params", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("userId", ":uid")
            .value("amount", ":amt")
            .value("createdAt", "now()")
            .returning("id")
            .withParams({ uid: "u1", amt: 5 });
        expect(q.toString()).toBe(
            "insert into orders (userId, amount, createdAt) values ($1, $2, now()) returning id");
        expect([...q.getParams()]).toEqual(["u1", 5]);
    });

    it("includes a conditional value only when its flag is true", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("userId", ":uid")
            .valueIf(false, "note", ":note")
            .withParams({ uid: "u1" });
        expect(q.toString()).toBe("insert into orders (userId) values ($1)");
        expect([...q.getParams()]).toEqual(["u1"]);
    });

    it("appends onConflict params resolved against target table", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("id", ":id")
            .value("amount", ":amt")
            .onConflict("(id) do update set amount = :amt2")
            .withParams({ id: "o1", amt: 1, amt2: 2 });
        expect(q.toString()).toBe(
            "insert into orders (id, amount) values ($1, $2) on conflict (id) do update set amount = $3");
        expect([...q.getParams()]).toEqual(["o1", 1, 2]);
    });

    it("throws when all value fragments were conditional and excluded", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .valueIf(false, "userId", ":uid")
            .withParams({});
        expect(() => q.toString()).toThrow(/INSERT has no columns/);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/builder/insert-runtime.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement state, assembler, and builder**

Create `src/builder/write-state.ts`:

```ts
// src/builder/write-state.ts
import type { DriverParamValue } from "./scanner.js";

export interface InsertValueEntry { readonly col: string; readonly text: string; }
export interface RuntimeInsertState {
    readonly table: string;
    readonly values: ReadonlyArray<InsertValueEntry>;
    readonly conflict?: string;
    readonly returning?: string;
    readonly namedParams: Record<string, DriverParamValue>;
}
export interface RuntimeUpdateState {
    readonly table: string;
    readonly sets: ReadonlyArray<string>;
    readonly froms: ReadonlyArray<string>;
    readonly wheres: ReadonlyArray<string>;
    readonly returning?: string;
    readonly namedParams: Record<string, DriverParamValue>;
}
export interface RuntimeDeleteState {
    readonly table: string;
    readonly usings: ReadonlyArray<string>;
    readonly wheres: ReadonlyArray<string>;
    readonly returning?: string;
    readonly namedParams: Record<string, DriverParamValue>;
}
export const EMPTY_INSERT_STATE: RuntimeInsertState = { table: "", values: [], namedParams: {} };
export const EMPTY_UPDATE_STATE: RuntimeUpdateState = { table: "", sets: [], froms: [], wheres: [], namedParams: {} };
export const EMPTY_DELETE_STATE: RuntimeDeleteState = { table: "", usings: [], wheres: [], namedParams: {} };
```

Create `src/builder/write-assemble.ts`:

```ts
// src/builder/write-assemble.ts
import type { RuntimeInsertState, RuntimeUpdateState, RuntimeDeleteState } from "./write-state.js";

export function assembleInsertSQL(s: RuntimeInsertState): string {
    if (s.values.length === 0) {
        throw new Error("INSERT has no columns — all value fragments were conditional and excluded");
    }
    const cols = s.values.map(v => v.col).join(", ");
    const vals = s.values.map(v => v.text).join(", ");
    let sql = `insert into ${s.table} (${cols}) values (${vals})`;
    if (s.conflict) sql += ` on conflict ${s.conflict}`;
    if (s.returning) sql += ` returning ${s.returning}`;
    return sql;
}

export function assembleUpdateSQL(s: RuntimeUpdateState): string {
    if (s.sets.length === 0) {
        throw new Error("UPDATE has no assignments — all SET fragments were conditional and excluded");
    }
    let sql = `update ${s.table} set ${s.sets.join(", ")}`;
    if (s.froms.length) sql += ` from ${s.froms.join(", ")}`;
    if (s.wheres.length) sql += ` where ${s.wheres.join(" and ")}`;
    if (s.returning) sql += ` returning ${s.returning}`;
    return sql;
}

export function assembleDeleteSQL(s: RuntimeDeleteState): string {
    let sql = `delete from ${s.table}`;
    if (s.usings.length) sql += ` using ${s.usings.join(", ")}`;
    if (s.wheres.length) sql += ` where ${s.wheres.join(" and ")}`;
    if (s.returning) sql += ` returning ${s.returning}`;
    return sql;
}
```

Create `src/builder/insert.ts`:

```ts
// src/builder/insert.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleInsertSQL } from "./write-assemble.js";
import { EMPTY_INSERT_STATE, type RuntimeInsertState } from "./write-state.js";
import {
    assertAllProvided, collectScanned, expandScanned, type DriverParamValue,
} from "./scanner.js";
import type { InsertTag, ValueFrag, WriteParamsFor, WriteReturnFor } from "./write-tag.js";

type PushVal<T extends InsertTag, Col extends string, Text extends string, Cond extends boolean> =
    Omit<T, "values"> & { readonly values: readonly [...T["values"], { col: Col; text: Text; cond: Cond }] };

export interface InsertQueryBuilder<S extends DatabaseSchema, T extends InsertTag> {
    into<Tbl extends string>(table: Tbl): InsertQueryBuilder<S, Omit<T, "table"> & { table: Tbl }>;
    value<Col extends string, Text extends string>(col: Col, text: Text):
        InsertQueryBuilder<S, PushVal<T, Col, Text, false>>;
    valueIf<Col extends string, Text extends string>(cond: boolean, col: Col, text: Text):
        InsertQueryBuilder<S, PushVal<T, Col, Text, true>>;
    onConflict<C extends string>(clause: C):
        InsertQueryBuilder<S, Omit<T, "conflict"> & { conflict: C }>;
    returning<R extends string>(cols: R):
        InsertQueryBuilder<S, Omit<T, "returning"> & { returning: R }>;
    withParams(params: WriteParamsFor<T, S>): BoundWrite<S, T>;
    toString(): string;
}

export interface BoundWrite<S extends DatabaseSchema, T> {
    toString(): string;
    getParams(): ReadonlyArray<DriverParamValue>;
    readonly __returning?: WriteReturnFor<T, S>;
}

class InsertImpl<S extends DatabaseSchema, T extends InsertTag> {
    constructor(private readonly st: RuntimeInsertState) {}
    private next(st: RuntimeInsertState): any { return new InsertImpl<S, any>(st); }
    into(table: string): any { return this.next({ ...this.st, table }); }
    value(col: string, text: string): any {
        return this.next({ ...this.st, values: [...this.st.values, { col, text }] });
    }
    valueIf(cond: boolean, col: string, text: string): any {
        return cond ? this.value(col, text) : this.next(this.st);
    }
    onConflict(clause: string): any { return this.next({ ...this.st, conflict: clause }); }
    returning(cols: string): any { return this.next({ ...this.st, returning: cols }); }
    withParams(params: Record<string, DriverParamValue>): any {
        return this.next({ ...this.st, namedParams: { ...this.st.namedParams, ...params } });
    }
    toString(): string {
        const sql = assembleInsertSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return expandScanned(sql, this.st.namedParams);
    }
    getParams(): ReadonlyArray<DriverParamValue> {
        const sql = assembleInsertSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return collectScanned(sql, this.st.namedParams);
    }
}

export type EmptyInsertTag = {
    kind: "insert"; table: ""; values: readonly []; conflict: null;
    wheres: readonly []; using: readonly []; from: readonly []; returning: null;
};

export function createInsertQuery<S extends DatabaseSchema>(): InsertQueryBuilder<S, EmptyInsertTag> {
    return new InsertImpl<S, EmptyInsertTag>(EMPTY_INSERT_STATE) as unknown as InsertQueryBuilder<S, EmptyInsertTag>;
}
```

> Note: `EmptyInsertTag["conflict"]` / `returning` are `null` to match `InsertTag`; `into`/`onConflict`/`returning` overwrite the field. The unused `wheres`/`using`/`from` keep the tag uniform with `BuildInsertSQL` (which ignores them).

- [ ] **Step 4: Run the runtime test to verify it passes**

Run: `bun test tests/builder/insert-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the type test**

Create `tests/builder/types/insert-types.test.ts`:

```ts
// tests/builder/types/insert-types.test.ts
import { createInsertQuery } from "../../../src/builder/insert.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asUserId } from "../fixtures/write-schema.js";

// unconditional uid required (exact brand), conditional note optional
createInsertQuery<WriteSchema>()
    .into("orders")
    .value("userId", ":uid")
    .valueIf(true, "note", ":note")
    .withParams({ uid: asUserId("u1") });               // note omitted → ok (optional)

createInsertQuery<WriteSchema>()
    .into("orders")
    .value("userId", ":uid")
    // @ts-expect-error plain string is not assignable to User_id
    .withParams({ uid: "u1" });
```

- [ ] **Step 6: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/builder/write-state.ts src/builder/write-assemble.ts src/builder/insert.ts tests/builder/insert-runtime.test.ts tests/builder/types/insert-types.test.ts
git commit -m "feat(builder): createInsertQuery with value/valueIf/onConflict/returning"
```

---

### Task 12: `createUpdateQuery`

Spec §5.1 (UPDATE) + §6.6 (empty-SET throw).

**Files:**
- Create: `src/builder/update.ts`
- Create: `tests/builder/update-runtime.test.ts`
- Create: `tests/builder/types/update-types.test.ts`

- [ ] **Step 1: Write the failing runtime test**

Create `tests/builder/update-runtime.test.ts`:

```ts
// tests/builder/update-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createUpdateQuery } from "../../src/builder/update.js";
import type { WriteSchema } from "./fixtures/write-schema.js";

describe("createUpdateQuery", () => {
    it("assembles set + where and expands params", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders")
            .set("amount = :amt")
            .where("id = :oid")
            .returning("id")
            .withParams({ amt: 5, oid: "o1" });
        expect(q.toString()).toBe("update orders set amount = $1 where id = $2 returning id");
        expect([...q.getParams()]).toEqual([5, "o1"]);
    });

    it("omits a conditional set fragment when false", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders")
            .set("amount = :amt")
            .setIf(false, "currency = :cur")
            .where("id = :oid")
            .withParams({ amt: 5, oid: "o1" });
        expect(q.toString()).toBe("update orders set amount = $1 where id = $2");
    });

    it("supports UPDATE ... FROM", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders")
            .set("amount = :amt")
            .from("users u")
            .where("id = :oid")
            .withParams({ amt: 1, oid: "o1" });
        expect(q.toString()).toBe("update orders set amount = $1 from users u where id = $2");
    });

    it("throws when all SET fragments were conditional and excluded", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders")
            .setIf(false, "amount = :amt")
            .where("id = :oid")
            .withParams({ oid: "o1" });
        expect(() => q.toString()).toThrow(/UPDATE has no assignments/);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/builder/update-runtime.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the builder**

Create `src/builder/update.ts`:

```ts
// src/builder/update.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleUpdateSQL } from "./write-assemble.js";
import { EMPTY_UPDATE_STATE, type RuntimeUpdateState } from "./write-state.js";
import {
    assertAllProvided, collectScanned, expandScanned, type DriverParamValue,
} from "./scanner.js";
import type { UpdateTag, ClauseFrag, WriteParamsFor, WriteReturnFor } from "./write-tag.js";
import type { BoundWrite } from "./insert.js";

type PushSet<T extends UpdateTag, Text extends string, Cond extends boolean> =
    Omit<T, "sets"> & { readonly sets: readonly [...T["sets"], { text: Text; cond: Cond }] };
type PushFrom<T extends UpdateTag, Text extends string, Cond extends boolean> =
    Omit<T, "from"> & { readonly from: readonly [...T["from"], { text: Text; cond: Cond }] };
type PushWhere<T extends UpdateTag, Text extends string, Cond extends boolean> =
    Omit<T, "wheres"> & { readonly wheres: readonly [...T["wheres"], { text: Text; cond: Cond }] };

export interface UpdateQueryBuilder<S extends DatabaseSchema, T extends UpdateTag> {
    table<Tbl extends string>(table: Tbl): UpdateQueryBuilder<S, Omit<T, "table"> & { table: Tbl }>;
    set<Text extends string>(assignment: Text): UpdateQueryBuilder<S, PushSet<T, Text, false>>;
    setIf<Text extends string>(cond: boolean, assignment: Text): UpdateQueryBuilder<S, PushSet<T, Text, true>>;
    from<Text extends string>(source: Text): UpdateQueryBuilder<S, PushFrom<T, Text, false>>;
    fromIf<Text extends string>(cond: boolean, source: Text): UpdateQueryBuilder<S, PushFrom<T, Text, true>>;
    where<Text extends string>(cond: Text): UpdateQueryBuilder<S, PushWhere<T, Text, false>>;
    whereIf<Text extends string>(cond: boolean, clause: Text): UpdateQueryBuilder<S, PushWhere<T, Text, true>>;
    returning<R extends string>(cols: R): UpdateQueryBuilder<S, Omit<T, "returning"> & { returning: R }>;
    withParams(params: WriteParamsFor<T, S>): BoundWrite<S, T>;
    toString(): string;
}

class UpdateImpl<S extends DatabaseSchema, T extends UpdateTag> {
    constructor(private readonly st: RuntimeUpdateState) {}
    private next(st: RuntimeUpdateState): any { return new UpdateImpl<S, any>(st); }
    table(table: string): any { return this.next({ ...this.st, table }); }
    set(a: string): any { return this.next({ ...this.st, sets: [...this.st.sets, a] }); }
    setIf(c: boolean, a: string): any { return c ? this.set(a) : this.next(this.st); }
    from(src: string): any { return this.next({ ...this.st, froms: [...this.st.froms, src] }); }
    fromIf(c: boolean, src: string): any { return c ? this.from(src) : this.next(this.st); }
    where(cond: string): any { return this.next({ ...this.st, wheres: [...this.st.wheres, cond] }); }
    whereIf(c: boolean, cond: string): any { return c ? this.where(cond) : this.next(this.st); }
    returning(cols: string): any { return this.next({ ...this.st, returning: cols }); }
    withParams(params: Record<string, DriverParamValue>): any {
        return this.next({ ...this.st, namedParams: { ...this.st.namedParams, ...params } });
    }
    toString(): string {
        const sql = assembleUpdateSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return expandScanned(sql, this.st.namedParams);
    }
    getParams(): ReadonlyArray<DriverParamValue> {
        const sql = assembleUpdateSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return collectScanned(sql, this.st.namedParams);
    }
}

export type EmptyUpdateTag = {
    kind: "update"; table: ""; sets: readonly []; from: readonly [];
    wheres: readonly []; returning: null;
};

export function createUpdateQuery<S extends DatabaseSchema>(): UpdateQueryBuilder<S, EmptyUpdateTag> {
    return new UpdateImpl<S, EmptyUpdateTag>(EMPTY_UPDATE_STATE) as unknown as UpdateQueryBuilder<S, EmptyUpdateTag>;
}
```

- [ ] **Step 4: Run the runtime test to verify it passes**

Run: `bun test tests/builder/update-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the type test**

Create `tests/builder/types/update-types.test.ts`:

```ts
// tests/builder/types/update-types.test.ts
import { createUpdateQuery } from "../../../src/builder/update.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asOrderId } from "../fixtures/write-schema.js";

createUpdateQuery<WriteSchema>()
    .table("orders")
    .set("amount = :amt")
    .setIf(true, "currency = :cur")          // conditional → cur optional
    .where("id = :oid")
    .withParams({ amt: 5, oid: asOrderId("o1") });  // cur omitted → ok

createUpdateQuery<WriteSchema>()
    .table("orders")
    .set("amount = :amt")
    .where("id = :oid")
    // @ts-expect-error number where Order_id expected
    .withParams({ amt: 5, oid: 1 });
```

- [ ] **Step 6: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/builder/update.ts tests/builder/update-runtime.test.ts tests/builder/types/update-types.test.ts
git commit -m "feat(builder): createUpdateQuery with set/setIf/from/where + empty-SET throw"
```

---

### Task 13: `createDeleteQuery`

Spec §5.1 (DELETE).

**Files:**
- Create: `src/builder/delete.ts`
- Create: `tests/builder/delete-runtime.test.ts`
- Create: `tests/builder/types/delete-types.test.ts`

- [ ] **Step 1: Write the failing runtime test**

Create `tests/builder/delete-runtime.test.ts`:

```ts
// tests/builder/delete-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createDeleteQuery } from "../../src/builder/delete.js";
import type { WriteSchema } from "./fixtures/write-schema.js";

describe("createDeleteQuery", () => {
    it("assembles where and expands params", () => {
        const q = createDeleteQuery<WriteSchema>()
            .from("orders")
            .where("id = :id")
            .returning("*")
            .withParams({ id: "o1" });
        expect(q.toString()).toBe("delete from orders where id = $1 returning *");
        expect([...q.getParams()]).toEqual(["o1"]);
    });

    it("supports USING and conditional where", () => {
        const q = createDeleteQuery<WriteSchema>()
            .from("orders")
            .using("payments p")
            .where("id = :id")
            .whereIf(false, "paid = :paid")
            .withParams({ id: "o1" });
        expect(q.toString()).toBe("delete from orders using payments p where id = $1");
    });

    it("expands an IN-list array", () => {
        const q = createDeleteQuery<WriteSchema>()
            .from("products")
            .where("id in (:ids)")
            .withParams({ ids: ["a", "b", "c"] });
        expect(q.toString()).toBe("delete from products where id in ($1, $2, $3)");
        expect([...q.getParams()]).toEqual(["a", "b", "c"]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/builder/delete-runtime.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the builder**

Create `src/builder/delete.ts`:

```ts
// src/builder/delete.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleDeleteSQL } from "./write-assemble.js";
import { EMPTY_DELETE_STATE, type RuntimeDeleteState } from "./write-state.js";
import {
    assertAllProvided, collectScanned, expandScanned, type DriverParamValue,
} from "./scanner.js";
import type { DeleteTag, WriteParamsFor, WriteReturnFor } from "./write-tag.js";
import type { BoundWrite } from "./insert.js";

type PushUsing<T extends DeleteTag, Text extends string, Cond extends boolean> =
    Omit<T, "using"> & { readonly using: readonly [...T["using"], { text: Text; cond: Cond }] };
type PushWhere<T extends DeleteTag, Text extends string, Cond extends boolean> =
    Omit<T, "wheres"> & { readonly wheres: readonly [...T["wheres"], { text: Text; cond: Cond }] };

export interface DeleteQueryBuilder<S extends DatabaseSchema, T extends DeleteTag> {
    from<Tbl extends string>(table: Tbl): DeleteQueryBuilder<S, Omit<T, "table"> & { table: Tbl }>;
    using<Text extends string>(source: Text): DeleteQueryBuilder<S, PushUsing<T, Text, false>>;
    usingIf<Text extends string>(cond: boolean, source: Text): DeleteQueryBuilder<S, PushUsing<T, Text, true>>;
    where<Text extends string>(cond: Text): DeleteQueryBuilder<S, PushWhere<T, Text, false>>;
    whereIf<Text extends string>(cond: boolean, clause: Text): DeleteQueryBuilder<S, PushWhere<T, Text, true>>;
    returning<R extends string>(cols: R): DeleteQueryBuilder<S, Omit<T, "returning"> & { returning: R }>;
    withParams(params: WriteParamsFor<T, S>): BoundWrite<S, T>;
    toString(): string;
}

class DeleteImpl<S extends DatabaseSchema, T extends DeleteTag> {
    constructor(private readonly st: RuntimeDeleteState) {}
    private next(st: RuntimeDeleteState): any { return new DeleteImpl<S, any>(st); }
    from(table: string): any { return this.next({ ...this.st, table }); }
    using(src: string): any { return this.next({ ...this.st, usings: [...this.st.usings, src] }); }
    usingIf(c: boolean, src: string): any { return c ? this.using(src) : this.next(this.st); }
    where(cond: string): any { return this.next({ ...this.st, wheres: [...this.st.wheres, cond] }); }
    whereIf(c: boolean, cond: string): any { return c ? this.where(cond) : this.next(this.st); }
    returning(cols: string): any { return this.next({ ...this.st, returning: cols }); }
    withParams(params: Record<string, DriverParamValue>): any {
        return this.next({ ...this.st, namedParams: { ...this.st.namedParams, ...params } });
    }
    toString(): string {
        const sql = assembleDeleteSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return expandScanned(sql, this.st.namedParams);
    }
    getParams(): ReadonlyArray<DriverParamValue> {
        const sql = assembleDeleteSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return collectScanned(sql, this.st.namedParams);
    }
}

export type EmptyDeleteTag = {
    kind: "delete"; table: ""; using: readonly []; wheres: readonly []; returning: null;
};

export function createDeleteQuery<S extends DatabaseSchema>(): DeleteQueryBuilder<S, EmptyDeleteTag> {
    return new DeleteImpl<S, EmptyDeleteTag>(EMPTY_DELETE_STATE) as unknown as DeleteQueryBuilder<S, EmptyDeleteTag>;
}
```

- [ ] **Step 4: Run the runtime test to verify it passes**

Run: `bun test tests/builder/delete-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the type test**

Create `tests/builder/types/delete-types.test.ts`:

```ts
// tests/builder/types/delete-types.test.ts
import { createDeleteQuery } from "../../../src/builder/delete.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asProductId } from "../fixtures/write-schema.js";

createDeleteQuery<WriteSchema>()
    .from("products")
    .where("id in (:ids)")
    .withParams({ ids: [asProductId("p1"), asProductId("p2")] });   // Product_id[]

createDeleteQuery<WriteSchema>()
    .from("orders")
    .where("id = :id")
    .whereIf(true, "paid = :paid")          // conditional → paid optional
    .withParams({ id: "o1" as any });       // paid omitted → ok
```

- [ ] **Step 6: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/builder/delete.ts tests/builder/delete-runtime.test.ts tests/builder/types/delete-types.test.ts
git commit -m "feat(builder): createDeleteQuery with using/where + IN-expansion"
```

---

## Phase 4 — Executor

### Task 14: `createMutateFn` + `MutationHandler`

Spec §5.3: an executor analog of `createSelectFn`. Takes a builder/`createSql` object **or** a raw string + named params; expands named→`$n`, runs the live-check, calls a `MutationHandler` that returns the row array, casts to the inferred `Row[]`.

**Files:**
- Create: `src/builder/mutate.ts`
- Create: `tests/builder/mutate-runtime.test.ts`
- Create: `tests/builder/types/mutate-types.test.ts`

- [ ] **Step 1: Write the failing runtime test**

Create `tests/builder/mutate-runtime.test.ts`:

```ts
// tests/builder/mutate-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createMutateFn } from "../../src/builder/mutate.js";
import { createInsertQuery } from "../../src/builder/insert.js";
import type { WriteSchema } from "./fixtures/write-schema.js";

describe("createMutateFn", () => {
    it("executes a builder query and returns the driver's row array", async () => {
        const calls: { sql: string; params: unknown[] }[] = [];
        const mutate = createMutateFn<WriteSchema>(async (sql, params) => {
            calls.push({ sql, params });
            return [{ id: "o1" }];
        });
        const q = createInsertQuery<WriteSchema>()
            .into("orders").value("userId", ":uid").value("amount", ":amt").returning("id")
            .withParams({ uid: "u1", amt: 5 });
        const rows = await mutate(q);
        expect(rows).toEqual([{ id: "o1" }]);
        expect(calls[0].sql).toBe(
            "insert into orders (userId, amount) values ($1, $2) returning id");
        expect(calls[0].params).toEqual(["u1", 5]);
    });

    it("raw overload expands named params to $n and runs the live-check", async () => {
        const calls: { sql: string; params: unknown[] }[] = [];
        const mutate = createMutateFn<WriteSchema>(async (sql, params) => {
            calls.push({ sql, params });
            return [];
        });
        await mutate("insert into orders (userId) values (:uid) returning id", { uid: "u1" });
        expect(calls[0].sql).toBe("insert into orders (userId) values ($1) returning id");
        expect(calls[0].params).toEqual(["u1"]);
    });

    it("raw overload throws on a missing live placeholder", async () => {
        const mutate = createMutateFn<WriteSchema>(async () => []);
        await expect(
            mutate("delete from orders where id = :id and paid = :paid", { id: "o1" } as any),
        ).rejects.toThrow('Missing value for query parameter ":paid"');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/builder/mutate-runtime.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the executor**

Create `src/builder/mutate.ts`:

```ts
// src/builder/mutate.ts
import type { DatabaseSchema } from "../schema.js";
import type { ExtractParams, ExtractReturning } from "./extract-params.js";
import type { BoundWrite } from "./insert.js";
import type { BoundSql } from "./sql.js";
import { prepareScanned, type DriverParamValue } from "./scanner.js";

/** Driver contract: returns the RETURNING rows, or [] for a no-RETURNING mutation. */
export type MutationHandler = (
    sql: string,
    params: DriverParamValue[],
) => Promise<unknown[]>;

/** Row type a bound builder / createSql object yields. */
export type MutationReturnType<B> =
    B extends { readonly __returning?: infer R } ? R : {};

interface Executable {
    toString(): string;
    getParams(): ReadonlyArray<DriverParamValue>;
}

export function createMutateFn<S extends DatabaseSchema>(handler: MutationHandler) {
    // Builder / createSql object overload.
    function mutate<B extends BoundWrite<S, any> | BoundSql<any, S>>(
        query: B,
    ): Promise<MutationReturnType<B>[]>;
    // Raw string + named params overload (brand-checked).
    function mutate<Q extends string>(
        query: Q,
        params: ExtractParams<Q, S>,
    ): Promise<ExtractReturning<Q, S>[]>;

    function mutate(query: Executable | string, params?: Record<string, DriverParamValue>) {
        if (typeof query === "string") {
            const { sql, values } = prepareScanned(query, params ?? {});
            return handler(sql, values) as Promise<any>;
        }
        const sql = query.toString();                 // already expanded + live-checked
        const values = [...query.getParams()];
        return handler(sql, values) as Promise<any>;
    }

    return mutate;
}
```

- [ ] **Step 4: Run the runtime test to verify it passes**

Run: `bun test tests/builder/mutate-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the type test (return shape + brand-checked raw overload)**

Create `tests/builder/types/mutate-types.test.ts`:

```ts
// tests/builder/types/mutate-types.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import { createMutateFn } from "../../../src/builder/mutate.js";
import { createInsertQuery } from "../../../src/builder/insert.js";
import type { WriteSchema, Order_id } from "../fixtures/write-schema.js";
import { asUserId } from "../fixtures/write-schema.js";

declare const mutate: ReturnType<typeof createMutateFn<WriteSchema>>;

// with RETURNING → typed Row[]
const q = createInsertQuery<WriteSchema>()
    .into("orders").value("userId", ":uid").value("amount", ":amt").returning("id")
    .withParams({ uid: asUserId("u1"), amt: 5 });
type Rows = Awaited<ReturnType<typeof mutate<typeof q>>>;
type _Rows = RequireTrue<AssertEqual<Rows, { id: Order_id }[]>>;

// raw overload is brand-checked
mutate("insert into orders (userId) values (:uid) returning id", { uid: asUserId("u1") });
// @ts-expect-error plain string is not assignable to User_id
mutate("insert into orders (userId) values (:uid) returning id", { uid: "u1" });
```

- [ ] **Step 6: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/builder/mutate.ts tests/builder/mutate-runtime.test.ts tests/builder/types/mutate-types.test.ts
git commit -m "feat(builder): createMutateFn executor with builder + brand-checked raw overload"
```

---

## Phase 5 — Wiring, duplicate-name & loose-vs-recognized coverage, depth, cleanup

### Task 15: Public exports

Spec §5.4: export the new runtime + type surface.

**Files:**
- Modify: `src/builder/index.ts`
- Modify: `src/index.ts:42-67` area (DML helpers already there; add the new type exports)

- [ ] **Step 1: Add builder exports**

In `src/builder/index.ts`, add under "Values":

```ts
export { createInsertQuery, type InsertQueryBuilder } from "./insert.js";
export { createUpdateQuery, type UpdateQueryBuilder } from "./update.js";
export { createDeleteQuery, type DeleteQueryBuilder } from "./delete.js";
export { createSql } from "./sql.js";
export { createMutateFn, type MutationHandler, type MutationReturnType } from "./mutate.js";
export {
    scanPlaceholders, expandScanned, collectScanned, assertAllProvided, prepareScanned,
} from "./scanner.js";
```

and under "Types":

```ts
export type { DriverParamValue, PlaceholderOccurrence } from "./scanner.js";
export type { ExtractParams, ExtractReturning } from "./extract-params.js";
export type { TypedSql, BoundSql } from "./sql.js";
export type { BoundWrite } from "./insert.js";
export type { WriteParamsFor, WriteReturnFor } from "./write-tag.js";
```

- [ ] **Step 2: Verify the top-level barrel re-exports them**

`src/index.ts:81` already does `export * from "./builder/index.js";` — confirm `ExtractParams`, `createInsertQuery`, `createMutateFn`, `DriverParamValue`, `createSql` are reachable from the package root.

- [ ] **Step 3: Add a barrel smoke test**

Create `tests/builder/write-exports.test.ts`:

```ts
// tests/builder/write-exports.test.ts
import { describe, it, expect } from "bun:test";
import {
    createInsertQuery, createUpdateQuery, createDeleteQuery, createSql, createMutateFn,
} from "../../src/index.js";

describe("write builder exports", () => {
    it("are reachable from the package root", () => {
        expect(typeof createInsertQuery).toBe("function");
        expect(typeof createUpdateQuery).toBe("function");
        expect(typeof createDeleteQuery).toBe("function");
        expect(typeof createSql).toBe("function");
        expect(typeof createMutateFn).toBe("function");
    });
});
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/builder/write-exports.test.ts && npx tsc --noEmit`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/builder/index.ts tests/builder/write-exports.test.ts
git commit -m "feat(builder): export write builders, createSql, createMutateFn, ExtractParams"
```

---

### Task 16: Duplicate-name, mixed-IN, and recognized-vs-loose coverage

Spec §6.2, §6.4, §6.5 — pin the remaining type/runtime contracts not yet covered.

**Files:**
- Create: `tests/builder/types/param-semantics.test.ts`
- Modify: `tests/builder/scanner-runtime.test.ts` (add mixed-IN runtime case if not already present)

- [ ] **Step 1: Write the type test**

Create `tests/builder/types/param-semantics.test.ts`:

```ts
// tests/builder/types/param-semantics.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ExtractParams } from "../../../src/builder/extract-params.js";
import type { DriverParamValue } from "../../../src/builder/scanner.js";
import type { WriteSchema, User_id } from "../fixtures/write-schema.js";
import { asUserId } from "../fixtures/write-schema.js";

// §6.2 compatible reuse: same column twice → one key, the column type
type Dup1 = ExtractParams<
    "update orders set userId = :u where userId = :u", WriteSchema>;
type _Dup1 = RequireTrue<AssertEqual<Dup1["u"], User_id>>;

// §6.2 conflicting brands: intersection is unsatisfiable → key cannot be supplied
type Dup2 = ExtractParams<
    "delete from orders where userId = :id and id = :id", WriteSchema>;
// User_id & Order_id collapses (__table: "User" & "Order"); a plain value is rejected.
const _dup2bad = (v: Dup2) => v;
// @ts-expect-error no value satisfies User_id & Order_id
_dup2bad({ id: asUserId("x") });
void _dup2bad;

// §6.4 recognized vs loose
type Rec = ExtractParams<"delete from orders where amount = :a", WriteSchema>;
type _Rec = RequireTrue<AssertEqual<Rec, { a: number }>>;
type Loose = ExtractParams<"delete from orders where amount = any(:a)", WriteSchema>;
type _Loose = RequireTrue<AssertEqual<Loose, { a: DriverParamValue }>>;
```

> If `Dup2` does not collapse to an unsatisfiable type (e.g. the brands' `__table` literals don't intersect to `never` in this TS version), adjust to assert the value type is `User_id & Order_id` via `AssertEqual<Dup2["id"], User_id & Order_id>` instead — the spec only requires the call site be unable to supply a value, which both encodings achieve.

- [ ] **Step 2: Run tsc to verify it fails (or passes)**

Run: `npx tsc --noEmit`
Expected: FAIL only if a contract is unmet (e.g. `any(:a)` not loose). Fix `extract-params.ts` per Task 4's loose fallback if needed, then re-run to GREEN.

- [ ] **Step 3: Confirm mixed-IN runtime rejection is covered**

Verify `tests/builder/scanner-runtime.test.ts` includes the "throws on mixed IN / non-IN reuse" case from Task 2 (it does). No change needed unless missing.

- [ ] **Step 4: Commit**

```bash
git add tests/builder/types/param-semantics.test.ts
git commit -m "test(builder): pin duplicate-name intersection and recognized-vs-loose contracts"
```

---

### Task 17: Depth regression fixture, full gate, spike removal, README

Spec §8 (depth regression) + §9 (delete the spike) + README write section.

**Files:**
- Create: `tests/builder/types/write-depth.test.ts`
- Delete: `tests/spike/extract-params.ts`, `tests/spike/probe.ts`, `tests/spike/schema.ts` (and the dir if empty)
- Modify: `README.md` (add a short write-builder section)

- [ ] **Step 1: Create the depth-stress fixture**

Create `tests/builder/types/write-depth.test.ts` (stacks many wide-table write queries in one module — the TS2589 stressor; ported from the spike's depth block):

```ts
// tests/builder/types/write-depth.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ExtractParams, ExtractReturning } from "../../../src/builder/extract-params.js";
import type { WriteSchema, Team_id, User_id, Order_id } from "../fixtures/write-schema.js";

type W1 = ExtractParams<"insert into users (id, teamId, email, name, phone, status, age, score, verified, createdAt) values (:id, :team, :email, :name, :phone, :status, :age, :score, :verified, :created)", WriteSchema>;
type W2 = ExtractParams<"insert into orders (id, userId, productId, teamId, invoiceId, amount, currency, quantity, note, paid) values (:id, :uid, :pid, :team, :inv, :amt, :cur, :qty, :note, :paid)", WriteSchema>;
type W3 = ExtractParams<"update users set email = :email, name = :name, phone = :phone, status = :status, age = :age, score = :score, verified = :verified where id = :id and teamId = :team", WriteSchema>;
type W4 = ExtractParams<"update orders set amount = :amt, currency = :cur, quantity = :qty, note = :note, paid = :paid where userId = :uid and id = :oid", WriteSchema>;
type W6 = ExtractParams<"delete from orders where userId = :uid and currency = :cur and amount > :min and paid = :paid", WriteSchema>;
type W7 = ExtractReturning<"insert into orders (userId, amount, currency, quantity, note, paid) values (:uid, :amt, :cur, :qty, :note, :paid) returning id, userId, amount, currency, createdAt", WriteSchema>;

type _W1 = RequireTrue<AssertEqual<W1["team"], Team_id | null>>;
type _W2 = RequireTrue<AssertEqual<W2["uid"], User_id>>;
type _W3 = RequireTrue<AssertEqual<W3["team"], Team_id | null>>;
type _W4 = RequireTrue<AssertEqual<W4["oid"], Order_id>>;
type _W6 = RequireTrue<AssertEqual<W6["uid"], User_id>>;
type _W7 = RequireTrue<AssertEqual<W7["id"], Order_id>>;
```

- [ ] **Step 2: Run tsc with diagnostics and confirm no TS2589 + a sane budget**

Run: `npx tsc --noEmit --extendedDiagnostics 2>&1 | grep -E "Instantiations|Types|error TS2589|Errors"`
Expected: no `TS2589`; instantiations within a modest delta of baseline (~spike measured +173k for ~20 queries). If `TS2589` appears, apply the chunked-driver pattern to the offending char-walk (the multi-row scanner in Task 8 and any `WhereParam` recursion are the likely sites) — never raise a step cap toward ~1000.

- [ ] **Step 3: Delete the spike**

Run:

```bash
git rm tests/spike/extract-params.ts tests/spike/probe.ts tests/spike/schema.ts
```

- [ ] **Step 4: Run the full gate**

Run: `npm test`
Expected: `tsc --noEmit` exit 0 **and** all bun tests pass (no spike, all new write tests green).

- [ ] **Step 5: Add a README write-builder section**

In `README.md`, after the SELECT builder example (the `createSelectQuery` block), add:

```md
### Write builders (INSERT / UPDATE / DELETE) with typed params

```ts
import { createInsertQuery, createMutateFn, createSql } from "@kuindji/typed-sql";

const q = createInsertQuery<Schema>()
  .into("orders")
  .value("userId", ":uid")     // :uid typed to orders.userId's exact (branded) type
  .value("amount", ":amt")
  .valueIf(hasNote, "note", ":note")   // conditional → :note optional in withParams
  .returning("id")
  .withParams({ uid, amt, ...(hasNote ? { note } : {}) });

q.toString();        // "insert into orders (userId, amount) values ($1, $2) returning id"
[...q.getParams()];  // [uid, amt]

// Raw typed SQL:
const sql = createSql<Schema>();
const d = sql("delete from orders where id = :id").withParams({ id });

// Executor — bring your driver; it returns the RETURNING rows (or [] when none):
const mutate = createMutateFn<Schema>((s, p) => pool.query(s, p).then(r => r.rows));
const rows = await mutate(q);   // typed from RETURNING

// Passing a plain string where a branded column is expected is a compile error.
// Multi-row VALUES is rejected in the typed path — use the untyped driver call.
```
```

- [ ] **Step 6: Commit**

```bash
git add tests/builder/types/write-depth.test.ts README.md
git commit -m "test(builder): depth regression fixture; remove spike; document write builders"
```

---

## Self-review notes (for the executor)

- **Spec coverage map:** §3 multi-row reject → Task 8; §5.1 builders → Tasks 11–13; §5.2 createSql → Task 9; §5.3 executor → Task 14; §5.4 exports → Task 15; §6 / §6.1 / §6.4 / §6.5 inference → Tasks 3–8, 16; §6.2 duplicate names → Task 16 (intersection already in `ZipInsert`/`SetParams`/`WhereParams` via `&`); §6.3 scanner + live-check → Tasks 1–2; §6.6 empty-set throws → Tasks 11–12; *If optionality → Task 10; depth → Task 17.
- **Type-name consistency:** the value domain is `DriverParamValue` everywhere (scanner.ts is the source of truth); runtime helpers are `scanPlaceholders` / `expandScanned` / `collectScanned` / `assertAllProvided` / `prepareScanned`; tag builders are `BuildInsertSQL` / `BuildUpdateSQL` / `BuildDeleteSQL`; param/return types are `WriteParamsFor` / `WriteReturnFor`; bound objects are `BoundWrite` (builders) and `BoundSql` (createSql). Keep these names exactly when implementing later tasks.
- **Known TDD-iteration points (spec §4.1 flagged these as not-yet-proven):** the loose-fallback boundary (Task 4 `IsBareColumn`/`AfterName`), the `between` re-glue (Task 5 `Reglue`/`EndsWithBetween`), and the alias scoping (Task 7 `AliasAfterTable`/`ScopedBind`). Treat the failing test as the spec; iterate the type code under `tsc` until green. If any introduces `TS2589`, apply the chunked-driver pattern, not a higher cap.
- **Do not regress** `tests/builder/params.test.ts` (legacy `expandNamedParams`/`collectParamValues` + `PARAM_REGEX` quirks) — the new scanner is additive; the SELECT-path retrofit is deferred (spec §9).
