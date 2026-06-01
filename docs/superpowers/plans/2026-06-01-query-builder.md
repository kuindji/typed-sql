# Query Builder for `@kuindji/typed-sql` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runtime query builder under `src/builder/` that is a drop-in replacement for the typed-builder subset of `@kuindji/sql-type-parser`, producing byte-identical runtime SQL while deriving row types and validation from the existing string-based type core.

**Architecture:** SQL-string reduction (spec "Approach A"). Each fluent method clones an immutable `RuntimeSelectState` (runtime) and appends a fragment to a lean type-level `Sql` tag (types). Row type and validity are derived by assembling that tag into a SQL string literal and feeding it to the existing core (`GetReturnType` / `ValidateSQL` / `Validate*Part`). Conditions are erased at the type level; only `selectIf`/`applyIf` flag their projected columns optional.

**Tech Stack:** TypeScript 5.x (NodeNext, `strict`), bun test runner, `tsc --noEmit` for type-level tests. Source ports from the predecessor package at `/Users/kuindji/Projects/@kuindji/sql-type-parser` (referred to below as **OLD**).

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-06-01-query-builder-design.md`
- Core public API: `src/index.ts` (`GetReturnType`, `ValidateSQL`, `Validate*Part`)
- Fragment validators: `src/partial.ts`
- Test helpers: `tests/fixtures/helpers.ts` (`AssertEqual`, `RequireTrue`, `AssertExtends`)
- Schema fixtures: `tests/fixtures/ecommerce-schema.ts`, `tests/fixtures/query-result-schemas.ts`
- **OLD source** (verbatim ports): `/Users/kuindji/Projects/@kuindji/sql-type-parser/src/...` (paths cited per task).

**Real-world acceptance sources (Phase 8 — the why of this rewrite).** Production builder usage lives in TheFloorr's monorepo and is reused directly as tests. These are the **highest-value** tests: they prove the library handles the exact code the predecessor could not type. Paths (read-only references; copy the query chains, do NOT import across repos):

| Source file (absolute) | What it exercises |
|---|---|
| `/Users/kuindji/Projects/TheFloorr/monorepo/packages/common/src/lib/sql/setQueryBuilderPeriod.ts` | The `setPeriod` **generic helper** + its `untypedSetPeriod` fallback. The fallback exists *only because* the old typed builder collapsed generic-helper builders to `any`/untyped. **Eliminating it is the headline goal.** |
| `/Users/kuindji/Projects/TheFloorr/monorepo/serverless/api/reporting-v2/src/controller/team/invoices.ts` | Array-form `.select([...])`, `.where` ×N, `.orderBy`, `.limit`, `.offset`, `.applyIf(!!period, b => setPeriod(b, …))`, `.whereIf`. The spec's named acceptance composition (helper applied conditionally). |
| `/Users/kuindji/Projects/TheFloorr/monorepo/serverless/api/reporting-v2/src/controller/my/payments-summary.ts` | Aggregate/`convert_currency(...)::float8 as "x"` expression selects, mutually-exclusive `selectIf`/`selectIf` on the same `currency` key, `:name` params, `.where`. Comments preserve the full raw→untyped→typed migration history. |
| `serverless/api/reporting-v2/src/controller/{invoices,pses,team/*,my/*}.ts`, `src/lib/{pseAnalytics,psePayments}.ts` | Additional real chains; mine for extra fixtures if coverage gaps appear. |

**`untypedSelect` / untyped-builder inventory (must become typeable).** These three sites in the monorepo currently depend on the untyped escape hatch the new library removes:
1. `packages/common/src/lib/sql/setQueryBuilderPeriod.ts` — `untypedSetPeriod` + `UntypedSelectBuilder`, `AnyBuilderStateTag`, `AnyBuilderSqlTag` imports.
2. `packages/common/src/db/api.ts` — `untypedSelect` handler overload + `UntypedSelectBuilder` import (db wrapper around `createSelectFn`).
3. `serverless/api/reporting-v2/src/controller/my/payments-summary.ts` — commented-out `createUntypedQuery`/`untypedSetPeriod` path (the pre-migration version).

Phase 8 proves (1) is no longer needed by porting `setPeriod` to the two-generic `AnySqlTag` form and showing it preserves the full row type — including through `applyIf`.

**Conventions to follow:**
- 4-space indentation, double-quoted strings, trailing commas (match existing `src/*.ts`).
- Imports use `.js` suffixes (NodeNext).
- Type-level tests are `.test.ts` files containing type assertions; "running" them = `tsc --noEmit`. They "fail" when they do not compile (or an assertion resolves to a non-`true` type passed to `RequireTrue`).
- Runtime tests use `import { describe, it, expect } from "bun:test"`.
- Negative type tests use `// @ts-expect-error` immediately above the offending line.

**Verification commands (used throughout):**
- Type check everything: `npx tsc --noEmit` (run from repo root)
- Runtime tests: `bun test <path>`
- Build emits: `npm run build` (added in Task 1)

---

## File Structure

New files, all under `src/builder/` unless noted (mirrors spec "Module layout"):

| File | Responsibility |
|---|---|
| `src/builder/params.ts` | `QueryParamValue`, `QueryParamInput`; `:name`→`$n` expansion + `getParams` ordering helpers. Builder-only array expansion lives here. |
| `src/builder/state.ts` | `RuntimeSelectState` interface + `EMPTY_RUNTIME_STATE`. Runtime-only fields (no old type-level state). |
| `src/builder/assemble.ts` | `assembleSelectSQL(state)` — clause ordering + named-param substitution. Ported verbatim. |
| `src/builder/condition-tree.ts` | `ConditionTreeBuilder` class + `createConditionTree`. Carries rendered-string literal type param. |
| `src/builder/sql-tag.ts` | Lean type-level fragment tag (`SqlTag`, `Frag`, `SelFrag`, `EmptySqlTag`, `AnySqlTag`) + `BuildSQL<Sql, Mode>` literal assembler + tag-mutation helpers (`WithSelect`, `WithWhere`, …, `WithoutSelect`, `WithoutJoin`). |
| `src/builder/return-type.ts` | `BuilderSQL<B>`, `BuilderReturnType<B>` (required/optional partition), `BuilderResultBrand`. |
| `src/builder/select.ts` | `SelectQueryBuilder<Schema, Sql>` interface, `createSelectQuery`, immutable impl class. |
| `src/builder/db.ts` | `createSelectFn`, `ValidQuery`, `ValidQueryBuilder`, `FragmentErrors`, `SelectResult(Array)`, `SelectBuilderResult(Array)`, `MergeOverrides`, `IsValidSelect`, `QueryHandler`. |
| `src/builder/conditional-sql.ts` | `createConditionalQuery`, `conditionalSQL`, `processConditionalSQL`, `processParams`, `normalizeWhitespace`, `withConditions`, `ConditionalQueryResult` (rewired onto the new core). |
| `src/builder/index.ts` | Re-exports all builder values + kept types. |
| `src/index.ts` (modify) | Add `export * from "./builder/index.js"` (value re-exports). |
| `tsconfig.build.json` (new, repo root) | Emit config (`outDir: ./dist`, `declaration`, etc.). |
| `package.json` (modify) | `build` / `prepublishOnly` / `test` scripts. |

Tests live under `tests/builder/` (runtime) and `tests/builder/types/` (type-level), reusing existing fixtures.

---

## Phase 0 — Build tooling

### Task 1: Add build config and scripts

**Files:**
- Create: `tsconfig.build.json`
- Modify: `package.json` (scripts block)

- [x] **Step 1: Create `tsconfig.build.json`** (ported from OLD `tsconfig.build.json`)

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "strict": true,
        "skipLibCheck": true,
        "esModuleInterop": true,
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true,
        "outDir": "./dist",
        "rootDir": "./src",
        "removeComments": false,
        "preserveConstEnums": true
    },
    "include": [
        "src/**/*.ts"
    ],
    "exclude": [
        "node_modules",
        "dist"
    ]
}
```

- [x] **Step 2: Update `package.json` scripts**

Replace the existing `"scripts"` block:

```json
    "scripts": {
        "typecheck": "tsc --noEmit",
        "build": "tsc -p tsconfig.build.json",
        "prepublishOnly": "npm run build",
        "test": "tsc --noEmit && bun test"
    },
```

- [x] **Step 3: Verify the current tree still type-checks**

Run: `npx tsc --noEmit`
Expected: exit 0 (no builder code yet; this confirms the baseline).

- [x] **Step 4: Verify the build script runs (emits nothing yet but must not error)**

Run: `npm run build && ls dist`
Expected: exit 0, `dist/` contains `index.js` + `index.d.ts` for the existing type-only core.

- [x] **Step 5: Add `dist/` to `.gitignore` if not present**

Run: `grep -q '^dist' .gitignore || printf 'dist\n' >> .gitignore`
Expected: `dist` appears in `.gitignore`.

- [x] **Step 6: Commit**

```bash
git add tsconfig.build.json package.json .gitignore
git commit -m "build: add dist build config and scripts for runtime builder"
```

---

## Phase 1 — Runtime primitives

These are self-contained, portable verbatim from OLD, and fully testable in isolation.

### Task 2: `params.ts` — param value types + expansion helpers

**Files:**
- Create: `src/builder/params.ts`
- Test: `tests/builder/params.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/builder/params.test.ts
import { describe, it, expect } from "bun:test";
import { expandNamedParams, collectParamValues } from "../../src/builder/params.js";

describe("expandNamedParams", () => {
    it("replaces :name with $n in first-appearance order", () => {
        const out = expandNamedParams("a = :x AND b = :y OR c = :x", { x: 1, y: 2 });
        expect(out).toBe("a = $1 AND b = $2 OR c = $1");
    });

    it("expands array params to consecutive placeholders", () => {
        const out = expandNamedParams("id IN (:ids)", { ids: [10, 20, 30] });
        expect(out).toBe("id IN ($1, $2, $3)");
    });

    it("does not clobber a longer param with a shorter prefix (:te vs :text)", () => {
        const out = expandNamedParams("a = :te AND b = :text", { te: 1, text: 2 });
        expect(out).toBe("a = $1 AND b = $2");
    });

    it("matches the second colon of a ::cast (intentional parity quirk)", () => {
        const out = expandNamedParams("u.id::text = :y", { text: 1, y: 2 });
        // The regex matches `:text` inside `::text` → expands the cast.
        expect(out).toBe("u.id:$1 = $2");
    });

    it("ignores :names with no provided value", () => {
        const out = expandNamedParams("a = :x AND b = :missing", { x: 1 });
        expect(out).toBe("a = $1 AND b = :missing");
    });
});

describe("collectParamValues", () => {
    it("returns values in first-appearance order, flattening arrays", () => {
        const vals = collectParamValues("a = :x AND id IN (:ids) AND b = :x", {
            x: 5,
            ids: [1, 2],
        });
        expect(vals).toEqual([5, 1, 2]);
    });

    it("throws when a used param value is undefined", () => {
        expect(() => collectParamValues("a = :x", { x: undefined })).toThrow(
            'Query parameter ":x" is used but its value is undefined',
        );
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/builder/params.test.ts`
Expected: FAIL — cannot resolve `../../src/builder/params.js`.

- [x] **Step 3: Write the implementation**

```ts
// src/builder/params.ts

/** Runtime parameter value type supported by query builders. */
export type QueryParamValue = string | number | boolean | null;

/**
 * Input parameter value type — allows arrays (expanded to multiple
 * placeholders, e.g. :ids with [1,2,3] → "$1, $2, $3") and undefined
 * (throws at runtime only if the param is actually used).
 *
 * Array expansion is BUILDER-ONLY. Conditional SQL keeps a scalar-only
 * signature (see conditional-sql.ts) for parity with the old package.
 */
export type QueryParamInput =
    | QueryParamValue
    | readonly QueryParamValue[]
    | undefined;

// Ported verbatim from OLD: trailing negative lookahead stops a short param
// (:te) from clobbering a longer one (:text). Matching the second colon of a
// ::cast is intentional parity (pinned by params.test.ts).
const PARAM_REGEX = /:([a-zA-Z_][a-zA-Z0-9_]*)(?![a-zA-Z0-9_])/g;

/** Param names in order of first appearance that are present in `params`. */
function usedParamNames(
    sql: string,
    params: Record<string, QueryParamInput>,
): string[] {
    const used: string[] = [];
    let match: RegExpExecArray | null;
    PARAM_REGEX.lastIndex = 0;
    while ((match = PARAM_REGEX.exec(sql)) !== null) {
        const name = match[1];
        if (name in params && !used.includes(name)) {
            used.push(name);
        }
    }
    return used;
}

/**
 * Replace :name placeholders with $n positional placeholders, ordered by
 * first appearance. Array values expand to consecutive placeholders.
 */
export function expandNamedParams(
    sql: string,
    params: Record<string, QueryParamInput>,
): string {
    const used = usedParamNames(sql, params);
    let out = sql;
    let position = 1;
    for (const name of used) {
        const value = params[name];
        const regex = new RegExp(`:${name}(?![a-zA-Z0-9_])`, "g");
        if (Array.isArray(value)) {
            const placeholders = value
                .map((_, i) => `$${position + i}`)
                .join(", ");
            out = out.replace(regex, placeholders);
            position += value.length;
        }
        else {
            out = out.replace(regex, `$${position}`);
            position++;
        }
    }
    return out;
}

/**
 * Flattened param values in placeholder order. Throws if a used param's
 * value is undefined.
 */
export function collectParamValues(
    sql: string,
    params: Record<string, QueryParamInput>,
): QueryParamValue[] {
    const used = usedParamNames(sql, params);
    const result: QueryParamValue[] = [];
    for (const name of used) {
        const value = params[name];
        if (value === undefined) {
            throw new Error(
                `Query parameter ":${name}" is used but its value is undefined`,
            );
        }
        if (Array.isArray(value)) {
            result.push(...value);
        }
        else {
            result.push(value as QueryParamValue);
        }
    }
    return result;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/builder/params.test.ts`
Expected: PASS (all cases).

- [x] **Step 5: Commit**

```bash
git add src/builder/params.ts tests/builder/params.test.ts
git commit -m "feat(builder): named-param expansion helpers"
```

---

### Task 3: `state.ts` — `RuntimeSelectState` + `EMPTY_RUNTIME_STATE`

**Files:**
- Create: `src/builder/state.ts`
- Test: `tests/builder/state.test.ts`

The new state is standalone — it does NOT extend the old `SelectBuilderState`. It carries only the fields `assembleSelectSQL` and `getParams` read.

- [x] **Step 1: Write the failing test**

```ts
// tests/builder/state.test.ts
import { describe, it, expect } from "bun:test";
import { EMPTY_RUNTIME_STATE } from "../../src/builder/state.js";

describe("EMPTY_RUNTIME_STATE", () => {
    it("starts with empty fragment maps and no clauses", () => {
        expect(EMPTY_RUNTIME_STATE.selectSql).toEqual({});
        expect(EMPTY_RUNTIME_STATE.joins).toEqual([]);
        expect(EMPTY_RUNTIME_STATE.fromSql).toBeUndefined();
        expect(EMPTY_RUNTIME_STATE.distinct).toBe(false);
        expect(EMPTY_RUNTIME_STATE.namedParams).toEqual({});
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/builder/state.test.ts`
Expected: FAIL — cannot resolve `state.js`.

- [x] **Step 3: Write the implementation**

```ts
// src/builder/state.ts
import type { QueryParamInput, QueryParamValue } from "./params.js";

/**
 * Immutable runtime state for the SELECT builder. Standalone — carries only
 * the fields consumed by assembleSelectSQL / getParams. Fragments are keyed
 * by id; join ORDER is preserved by the `joins` array.
 */
export interface RuntimeSelectState {
    /** Raw SELECT fragments by id; each is the array of column strings. */
    readonly selectSql: { readonly [id: string]: string[] };
    /** Raw FROM fragment (if present). */
    readonly fromSql?: string;
    /** Raw JOIN fragments by id. */
    readonly joinSql: { readonly [id: string]: string };
    /** Join ordering — only the id is needed for assembly. */
    readonly joins: ReadonlyArray<{ readonly id: string }>;
    /** Raw WHERE fragments by id (joined with AND). */
    readonly whereSql: { readonly [id: string]: string };
    /** Raw GROUP BY fragments by id (joined with ", "). */
    readonly groupBySql: { readonly [id: string]: string };
    /** Raw HAVING fragments by id (joined with AND). */
    readonly havingSql: { readonly [id: string]: string };
    /** Raw ORDER BY fragments by id (joined with ", "). */
    readonly orderBySql: { readonly [id: string]: string };
    /** Raw CTE fragments by id. */
    readonly cteSql: { readonly [id: string]: string };
    /** Raw UNION fragment (if any). */
    readonly unionSql?: string;
    readonly distinct: boolean;
    readonly limit?: number;
    readonly offset?: number;
    /** Legacy positional params (kept for getParams() fallback). */
    readonly params: ReadonlyArray<QueryParamValue>;
    /** Named params; :name placeholders resolve from here. */
    readonly namedParams: Record<string, QueryParamInput>;
}

export const EMPTY_RUNTIME_STATE: RuntimeSelectState = {
    selectSql: {},
    fromSql: undefined,
    joinSql: {},
    joins: [],
    whereSql: {},
    groupBySql: {},
    havingSql: {},
    orderBySql: {},
    cteSql: {},
    unionSql: undefined,
    distinct: false,
    limit: undefined,
    offset: undefined,
    params: [],
    namedParams: {},
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/builder/state.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/builder/state.ts tests/builder/state.test.ts
git commit -m "feat(builder): RuntimeSelectState + empty state"
```

---

### Task 4: `assemble.ts` — `assembleSelectSQL`

**Files:**
- Create: `src/builder/assemble.ts`
- Test: `tests/builder/assemble.test.ts`

Ported from OLD `src/select/builder-runtime/assemble-select-sql.ts`, but the inline param substitution now delegates to `expandNamedParams` from `params.ts` (identical regex/order, deduplicated).

- [x] **Step 1: Write the failing test**

```ts
// tests/builder/assemble.test.ts
import { describe, it, expect } from "bun:test";
import { assembleSelectSQL } from "../../src/builder/assemble.js";
import { EMPTY_RUNTIME_STATE } from "../../src/builder/state.js";

const base = EMPTY_RUNTIME_STATE;

describe("assembleSelectSQL", () => {
    it("defaults to SELECT * with no select fragments", () => {
        expect(assembleSelectSQL({ ...base, fromSql: "users" })).toBe(
            "SELECT * FROM users",
        );
    });

    it("emits clauses in canonical order", () => {
        const sql = assembleSelectSQL({
            ...base,
            selectSql: { select_0: ["u.id", "u.name"] },
            fromSql: "users u",
            joinSql: { join_0: "JOIN orders o ON o.user_id = u.id" },
            joins: [{ id: "join_0" }],
            whereSql: { where_0: "u.active = true", where_1: "o.total > 0" },
            groupBySql: { group_0: "u.id" },
            havingSql: { having_0: "count(*) > 1" },
            orderBySql: { order_0: "u.name" },
            limit: 10,
            offset: 5,
        });
        expect(sql).toBe(
            "SELECT u.id, u.name FROM users u " +
            "JOIN orders o ON o.user_id = u.id " +
            "WHERE u.active = true AND o.total > 0 " +
            "GROUP BY u.id HAVING count(*) > 1 ORDER BY u.name LIMIT 10 OFFSET 5",
        );
    });

    it("emits SELECT DISTINCT when distinct is set", () => {
        expect(
            assembleSelectSQL({
                ...base,
                selectSql: { select_0: ["id"] },
                fromSql: "users",
                distinct: true,
            }),
        ).toBe("SELECT DISTINCT id FROM users");
    });

    it("substitutes named params to $n", () => {
        expect(
            assembleSelectSQL({
                ...base,
                fromSql: "users",
                whereSql: { where_0: "id = :id" },
                namedParams: { id: 7 },
            }),
        ).toBe("SELECT * FROM users WHERE id = $1");
    });

    it("emits WITH and UNION around the core query", () => {
        expect(
            assembleSelectSQL({
                ...base,
                cteSql: { cte_0: "t AS (SELECT 1)" },
                selectSql: { select_0: ["*"] },
                fromSql: "t",
                unionSql: "UNION SELECT * FROM t2",
            }),
        ).toBe("WITH t AS (SELECT 1) SELECT * FROM t UNION SELECT * FROM t2");
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/builder/assemble.test.ts`
Expected: FAIL — cannot resolve `assemble.js`.

- [x] **Step 3: Write the implementation**

```ts
// src/builder/assemble.ts
import { expandNamedParams } from "./params.js";
import type { RuntimeSelectState } from "./state.js";

/**
 * Assemble a SQL string from runtime builder state.
 *
 * - Uses user-provided fragments as-is (no parsing/normalization).
 * - Inserts SQL keywords in uppercase.
 * - Skips empty clauses; defaults to SELECT * when no select fragments.
 * - Expands :name params to $n (first-appearance order; arrays expand).
 *
 * Ported from the predecessor package; byte-identical output.
 */
export function assembleSelectSQL(state: RuntimeSelectState): string {
    const parts: string[] = [];

    const cteIds = Object.keys(state.cteSql);
    if (cteIds.length > 0) {
        const withParts = cteIds.map(id => state.cteSql[id]).join(", ");
        parts.push(`WITH ${withParts}`);
    }

    const selectIds = Object.keys(state.selectSql);
    if (selectIds.length === 0) {
        parts.push("SELECT *");
    }
    else {
        const selectFragments: string[] = [];
        for (const id of selectIds) {
            const cols = state.selectSql[id];
            if (cols && cols.length > 0) {
                selectFragments.push(cols.join(", "));
            }
        }
        const selectSql = selectFragments.length > 0
            ? selectFragments.join(", ")
            : "*";
        parts.push(
            state.distinct ? `SELECT DISTINCT ${selectSql}` : `SELECT ${selectSql}`,
        );
    }

    if (state.fromSql) {
        parts.push(`FROM ${state.fromSql}`);
    }

    for (const join of state.joins) {
        const sql = state.joinSql[join.id];
        if (sql) {
            parts.push(sql);
        }
    }

    const whereParts = Object.keys(state.whereSql)
        .map(id => state.whereSql[id])
        .filter(Boolean);
    if (whereParts.length > 0) {
        parts.push(`WHERE ${whereParts.join(" AND ")}`);
    }

    const groupParts = Object.keys(state.groupBySql)
        .map(id => state.groupBySql[id])
        .filter(Boolean);
    if (groupParts.length > 0) {
        parts.push(`GROUP BY ${groupParts.join(", ")}`);
    }

    const havingParts = Object.keys(state.havingSql)
        .map(id => state.havingSql[id])
        .filter(Boolean);
    if (havingParts.length > 0) {
        parts.push(`HAVING ${havingParts.join(" AND ")}`);
    }

    const orderParts = Object.keys(state.orderBySql)
        .map(id => state.orderBySql[id])
        .filter(Boolean);
    if (orderParts.length > 0) {
        parts.push(`ORDER BY ${orderParts.join(", ")}`);
    }

    if (typeof state.limit === "number") {
        parts.push(`LIMIT ${state.limit}`);
    }
    if (typeof state.offset === "number") {
        parts.push(`OFFSET ${state.offset}`);
    }

    if (state.unionSql) {
        parts.push(state.unionSql);
    }

    const sql = parts.join(" ");
    const namedParams = state.namedParams;
    if (namedParams && Object.keys(namedParams).length > 0) {
        return expandNamedParams(sql, namedParams);
    }
    return sql;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/builder/assemble.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/builder/assemble.ts tests/builder/assemble.test.ts
git commit -m "feat(builder): assembleSelectSQL (ported, param expansion shared)"
```

---

### Task 5: `condition-tree.ts` — `ConditionTreeBuilder` + `createConditionTree`

**Files:**
- Create: `src/builder/condition-tree.ts`
- Test: `tests/builder/condition-tree.test.ts`

Ported from OLD `src/common/builder.ts` (the `ConditionTreeBuilder` class, `createConditionTree`). **Drop** the `WhereExpr` import — represent parts as opaque strings/nested trees. Keep the `Expr` string-literal type param (so `where(tree)` keeps `BuilderSQL` precise).

- [x] **Step 1: Write the failing test**

```ts
// tests/builder/condition-tree.test.ts
import { describe, it, expect } from "bun:test";
import { createConditionTree } from "../../src/builder/condition-tree.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

describe("createConditionTree", () => {
    it("wraps in parens and uppercases the operator", () => {
        const t = createConditionTree("and").add("a = 1").add("b = 2");
        expect(t.toString()).toBe("(a = 1 AND b = 2)");
    });

    it("renders nested trees recursively", () => {
        const inner = createConditionTree("or").add("x = 1").add("y = 2");
        const t = createConditionTree("and").add("a = 1").add(inner);
        expect(t.toString()).toBe("(a = 1 AND (x = 1 OR y = 2))");
    });

    it("remove(id) is a no-op when absent", () => {
        const t = createConditionTree("and").add("a = 1", "p1");
        expect(t.remove("nope").toString()).toBe("(a = 1)");
        expect(t.remove("p1").toString()).toBe("()");
    });

    it("replaces a part with the same id", () => {
        const t = createConditionTree("and").add("a = 1", "p").add("a = 2", "p");
        expect(t.toString()).toBe("(a = 2)");
    });

    it(".when applies the true branch", () => {
        const t = createConditionTree("and")
            .add("a = 1")
            .when(true, b => b.add("b = 2"));
        expect(t.toString()).toBe("(a = 1 AND b = 2)");
    });
});

// Type-level: the rendered literal is tracked in the Expr param.
const litTree = createConditionTree("and").add("a = 1").add("b = 2");
type _Expr = RequireTrue<
    AssertEqual<ReturnType<typeof litTree.toString>, "(a = 1 AND b = 2)">
>;
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/builder/condition-tree.test.ts`
Expected: FAIL — cannot resolve `condition-tree.js`.

- [x] **Step 3: Write the implementation**

Port OLD `src/common/builder.ts` lines 1–220 (the `ConditionTreePart`/`ConditionTreeState` types, `UppercaseOperator`, `AppendCondition`, the `ConditionTreeBuilder` class, and `createConditionTree`). Apply these edits while porting:

- Replace `import type { WhereExpr } from "./ast.js";` and every `WhereExpr` occurrence with `string` (parts are opaque strings or nested `ConditionTreeState`). `ConditionTreePart = string | ConditionTreeState;` and `condition: string | ConditionTreeState`.
- Drop `whenRuntime`, the param utilities (`QueryParamValue`, `QueryParamInput`, `ParamString`, `appendParamsRuntime`, `buildParamString`, `BuildArray`) — those now live in `params.ts`.
- Keep `createConditionTree` exactly.

The resulting file (condensed to the kept parts):

```ts
// src/builder/condition-tree.ts

export type ConditionTreePart = string | ConditionTreeState;

export interface ConditionTreeState {
    readonly operator: "and" | "or";
    readonly parts: ReadonlyArray<{
        readonly id: string;
        readonly condition: string | ConditionTreeState;
    }>;
}

type UppercaseOperator<Op extends "and" | "or"> = Op extends "and" ? "AND" : "OR";

type AppendCondition<
    Current extends string,
    Part extends string,
    Op extends "and" | "or",
> = string extends Current | Part ? string
    : Current extends "()" ? `(${Part})`
    : Current extends `(${infer Body})`
        ? `(${Body} ${UppercaseOperator<Op>} ${Part})`
    : string;

export class ConditionTreeBuilder<
    Op extends "and" | "or" = "and" | "or",
    Expr extends string = string,
> {
    private readonly state: ConditionTreeState;

    private constructor(state: ConditionTreeState) {
        this.state = state;
    }

    static create<Op extends "and" | "or">(
        operator: Op,
    ): ConditionTreeBuilder<Op, "()"> {
        return new ConditionTreeBuilder<Op, "()">({ operator, parts: [] });
    }

    getState(): ConditionTreeState {
        return this.state;
    }

    add<Part extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        part: Part,
        id?: Id,
    ): ConditionTreeBuilder<
        Op,
        // An explicit `id` may target an existing part (runtime REPLACES it),
        // which AppendCondition cannot model — so widen the rendered literal to
        // `string`. The auto-id path (no id) is always a fresh append → precise.
        Id extends string
            ? string
            : AppendCondition<
                Expr,
                Part extends ConditionTreeBuilder<any, infer P extends string> ? P
                    : Part extends string ? Part
                    : string,
                Op
            >
    > {
        const partId = id ?? ConditionTreeBuilder.generateId();
        const condition: string | ConditionTreeState =
            part instanceof ConditionTreeBuilder ? part.getState() : (part as string);
        const existingIndex = this.state.parts.findIndex(p => p.id === partId);
        const nextParts = existingIndex === -1
            ? [...this.state.parts, { id: partId, condition }]
            : this.state.parts.map((p, idx) =>
                idx === existingIndex ? { id: partId, condition } : p);
        return new ConditionTreeBuilder({
            operator: this.state.operator,
            parts: nextParts,
        }) as any;
    }

    // remove() drops a part; the rendered literal can no longer be reconstructed
    // from `Expr` alone (the type doesn't track parts as a tuple), so widen to
    // `string`. A `string`-typed tree fragment is accepted-but-untyped by
    // ValidQueryBuilder's allow-unknown path (spec Open Questions) — no
    // rejection, only reduced BuilderSQL precision for that one query.
    remove(id: string): ConditionTreeBuilder<Op, string> {
        const nextParts = this.state.parts.filter(p => p.id !== id);
        if (nextParts.length === this.state.parts.length) {
            return this as ConditionTreeBuilder<Op, string>;
        }
        return new ConditionTreeBuilder({
            operator: this.state.operator,
            parts: nextParts,
        }) as ConditionTreeBuilder<Op, string>;
    }

    when<Next extends ConditionTreeBuilder<any, any>>(
        condition: boolean,
        ifTrue: (b: ConditionTreeBuilder<Op, Expr>) => Next,
        ifFalse?: (b: ConditionTreeBuilder<Op, Expr>) => Next,
    ): ConditionTreeBuilder<Op, Expr> | Next {
        if (condition) {
            return ifTrue(this);
        }
        return ifFalse ? ifFalse(this) : this;
    }

    toString(): Expr {
        if (this.state.parts.length === 0) {
            return "()" as Expr;
        }
        const op = this.state.operator.toUpperCase();
        const rendered = this.state.parts
            .map(part => ConditionTreeBuilder.renderPart(part.condition))
            .filter(s => s.length > 0)
            .join(` ${op} `);
        return `(${rendered})` as Expr;
    }

    private static renderPart(condition: string | ConditionTreeState): string {
        if (ConditionTreeBuilder.isConditionTreeState(condition)) {
            return new ConditionTreeBuilder(condition).toString();
        }
        return String(condition ?? "").trim();
    }

    private static isConditionTreeState(
        value: string | ConditionTreeState,
    ): value is ConditionTreeState {
        return (
            typeof value === "object"
            && value !== null
            && (value as any).operator !== undefined
            && Array.isArray((value as any).parts)
        );
    }

    private static generateId(): string {
        return `cond_${Math.random().toString(36).slice(2, 10)}`;
    }
}

export function createConditionTree<Op extends "and" | "or">(
    operator: Op,
): ConditionTreeBuilder<Op, "()"> {
    return ConditionTreeBuilder.create(operator);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/builder/condition-tree.test.ts` then `npx tsc --noEmit`
Expected: PASS; tsc exit 0.

- [x] **Step 5: Commit**

```bash
git add src/builder/condition-tree.ts tests/builder/condition-tree.test.ts
git commit -m "feat(builder): ConditionTreeBuilder + createConditionTree (ported)"
```

---

## Phase 2 — Type-level fragment tag & assembly

### Task 6: `sql-tag.ts` — lean fragment tag + `BuildSQL`

**Files:**
- Create: `src/builder/sql-tag.ts`
- Test: `tests/builder/types/sql-tag.test.ts`

The tag mirrors only the SQL side of the old `BuilderSqlTag`: ordered fragment lists per clause, with select fragments flagged conditional vs unconditional and keyed by id. `BuildSQL<Sql, Mode>` assembles to a literal string mirroring `assembleSelectSQL`'s ordering. No output-key resolver lives here.

- [x] **Step 1: Write the failing test**

```ts
// tests/builder/types/sql-tag.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type {
    BuildSQL,
    EmptySqlTag,
    WithSelect,
    WithFrom,
    WithWhere,
    WithJoin,
    WithoutSelect,
    SqlTag,
} from "../../../src/builder/sql-tag.js";

// from("users u").select("u.id", "s0").where("u.active = true", "w0")
type T1 = WithWhere<
    WithSelect<WithFrom<EmptySqlTag, "users u">, "u.id", "s0", false>,
    "u.active = true",
    "w0"
>;
type _Max1 = RequireTrue<
    AssertEqual<BuildSQL<T1, "max">, "SELECT u.id FROM users u WHERE u.active = true">
>;

// No select fragments → SELECT *
type T2 = WithFrom<EmptySqlTag, "users">;
type _Scope = RequireTrue<AssertEqual<BuildSQL<T2, "scope">, "SELECT * FROM users">>;
type _Max2 = RequireTrue<AssertEqual<BuildSQL<T2, "max">, "SELECT * FROM users">>;

// Conditional select excluded from "req"
type T3 = WithSelect<
    WithSelect<WithFrom<EmptySqlTag, "users u">, "u.id", "s0", false>,
    "u.name",
    "s1",
    true /* conditional */
>;
type _ReqOnlyUncond = RequireTrue<
    AssertEqual<BuildSQL<T3, "req">, "SELECT u.id FROM users u">
>;
type _MaxBoth = RequireTrue<
    AssertEqual<BuildSQL<T3, "max">, "SELECT u.id, u.name FROM users u">
>;

// removeSelect rewrites the tag
type T4 = WithoutSelect<T3, "s0">;
type _RemovedReqEmpty = RequireTrue<
    AssertEqual<BuildSQL<T4, "max">, "SELECT u.name FROM users u">
>;

// non-literal from text widens to string
type T5 = WithFrom<EmptySqlTag, string>;
type _Wide = RequireTrue<AssertEqual<BuildSQL<T5, "max">, string>>;
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — cannot find module `sql-tag.js`.

- [x] **Step 3: Write the implementation**

The tag is a flat record of ordered fragment tuples. `Append`/`Replace`/`Remove` keep id semantics matching runtime (replace-by-id-or-push; filter-by-id). `BuildSQL` joins fragments with type-level list helpers in `assembleSelectSQL` order. `LimitVal`/`OffsetVal` use `number | null` (null = absent); they participate only when known literal numbers.

```ts
// src/builder/sql-tag.ts

/** A non-select clause fragment (where/join/group/having/order/cte). */
export interface Frag {
    readonly id: string;
    readonly text: string;
}

/** A select fragment: raw rendered column-list text + conditional flag. */
export interface SelFrag {
    readonly id: string;
    readonly text: string; // e.g. "u.id, u.name" (cols already joined with ", ")
    readonly cond: boolean; // true = selectIf / applyIf-introduced
}

/** Lean type-level fragment tag: ordered fragment lists per clause. */
export interface SqlTag {
    readonly ctes: readonly Frag[];
    readonly selects: readonly SelFrag[];
    readonly from: string | null; // null = no FROM; `string` (non-literal) widens BuildSQL
    readonly joins: readonly Frag[];
    readonly wheres: readonly Frag[];
    readonly groupBys: readonly Frag[];
    readonly havings: readonly Frag[];
    readonly orderBys: readonly Frag[];
    readonly limit: number | null;
    readonly offset: number | null;
    readonly union: string | null;
}

/** Upper bound for "any builder" (replaces old AnyBuilderSqlTag/AnyBuilderStateTag). */
export type AnySqlTag = SqlTag;

export type EmptySqlTag = {
    readonly ctes: readonly [];
    readonly selects: readonly [];
    readonly from: null;
    readonly joins: readonly [];
    readonly wheres: readonly [];
    readonly groupBys: readonly [];
    readonly havings: readonly [];
    readonly orderBys: readonly [];
    readonly limit: null;
    readonly offset: null;
    readonly union: null;
};

// --- list mutation helpers (replace-by-id-or-push; matches runtime) ---

type HasId<List extends readonly { id: string }[], Id extends string> =
    List extends readonly [infer H extends { id: string }, ...infer R extends readonly { id: string }[]]
        ? H["id"] extends Id ? true : HasId<R, Id>
        : false;

type ReplaceById<
    List extends readonly { id: string }[],
    Id extends string,
    Item,
> = List extends readonly [infer H extends { id: string }, ...infer R extends readonly { id: string }[]]
    ? H["id"] extends Id
        ? readonly [Item, ...R]
        : readonly [H, ...ReplaceById<R, Id, Item>]
    : readonly [];

type UpsertById<
    List extends readonly { id: string }[],
    Id extends string,
    Item extends { id: string },
> = HasId<List, Id> extends true
    ? ReplaceById<List, Id, Item>
    : readonly [...List, Item];

type FilterOutId<
    List extends readonly { id: string }[],
    Id extends string,
> = List extends readonly [infer H extends { id: string }, ...infer R extends readonly { id: string }[]]
    ? H["id"] extends Id
        ? FilterOutId<R, Id>
        : readonly [H, ...FilterOutId<R, Id>]
    : readonly [];

// --- type-level auto-id (mirrors runtime `select_${count}`, `join_${count}`, …) ---
// The next fragment id is the current fragment count, exactly as the runtime
// derives `select_${Object.keys(selectSql).length}`. O(1) — `length` on a
// readonly tuple is the literal element count.
export type AutoId<Prefix extends string, List extends readonly unknown[]> =
    `${Prefix}_${List["length"] & number}`;

// An explicit caller id wins; `undefined` → the clause's auto id.
export type ResolveId<
    Provided extends string | undefined,
    Prefix extends string,
    List extends readonly unknown[],
> = Provided extends string ? Provided : AutoId<Prefix, List>;

// --- per-clause `With*` helpers used by select.ts ---

export type WithSelect<
    Sql extends SqlTag,
    Text extends string,
    Id extends string,
    Cond extends boolean,
> = Omit<Sql, "selects"> & {
    readonly selects: UpsertById<Sql["selects"], Id, { id: Id; text: Text; cond: Cond }>;
};

export type WithoutSelect<Sql extends SqlTag, Id extends string> =
    Omit<Sql, "selects"> & { readonly selects: FilterOutId<Sql["selects"], Id> };

export type WithFrom<Sql extends SqlTag, Text extends string> =
    Omit<Sql, "from"> & { readonly from: Text };

export type WithJoin<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "joins"> & {
        readonly joins: UpsertById<Sql["joins"], Id, { id: Id; text: Text }>;
    };

export type WithoutJoin<Sql extends SqlTag, Id extends string> =
    Omit<Sql, "joins"> & { readonly joins: FilterOutId<Sql["joins"], Id> };

export type WithWhere<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "wheres"> & {
        readonly wheres: UpsertById<Sql["wheres"], Id, { id: Id; text: Text }>;
    };

export type WithGroupBy<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "groupBys"> & {
        readonly groupBys: UpsertById<Sql["groupBys"], Id, { id: Id; text: Text }>;
    };

export type WithHaving<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "havings"> & {
        readonly havings: UpsertById<Sql["havings"], Id, { id: Id; text: Text }>;
    };

export type WithOrderBy<Sql extends SqlTag, Text extends string, Id extends string> =
    Omit<Sql, "orderBys"> & {
        readonly orderBys: UpsertById<Sql["orderBys"], Id, { id: Id; text: Text }>;
    };

export type WithLimit<Sql extends SqlTag, L extends number> =
    Omit<Sql, "limit"> & { readonly limit: L };

export type WithOffset<Sql extends SqlTag, O extends number> =
    Omit<Sql, "offset"> & { readonly offset: O };

// --- BuildSQL: assemble a literal mirroring assembleSelectSQL's ordering ---

export type BuildMode = "max" | "req" | "scope";

// Join a list of fragment texts with a separator (drops empties).
type JoinTexts<
    List extends readonly { text: string }[],
    Sep extends string,
    Acc extends string = "",
> = List extends readonly [infer H extends { text: string }, ...infer R extends readonly { text: string }[]]
    ? JoinTexts<R, Sep, Acc extends "" ? H["text"] : `${Acc}${Sep}${H["text"]}`>
    : Acc;

// Select fragments for a given mode: "req" keeps only cond=false.
type SelectsForMode<List extends readonly SelFrag[], Mode extends BuildMode> =
    Mode extends "req"
        ? FilterUncond<List>
        : List;

type FilterUncond<List extends readonly SelFrag[]> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? H["cond"] extends false
            ? readonly [H, ...FilterUncond<R>]
            : FilterUncond<R>
        : readonly [];

// SELECT clause text for a mode.
type SelectClause<Sql extends SqlTag, Mode extends BuildMode> =
    Mode extends "scope"
        ? "SELECT *"
        : SelectsForMode<Sql["selects"], Mode> extends infer Sel extends readonly SelFrag[]
            ? Sel extends readonly []
                ? "SELECT *"
                : `SELECT ${JoinTexts<Sel, ", ">}`
            : "SELECT *";

// Optional prefixed clause: "" when the list is empty.
type Clause<Kw extends string, List extends readonly { text: string }[], Sep extends string> =
    List extends readonly [] ? "" : ` ${Kw} ${JoinTexts<List, Sep>}`;

type FromClause<From extends string | null> =
    From extends null ? "" : ` FROM ${From & string}`;

type JoinClause<List extends readonly Frag[]> =
    List extends readonly [] ? "" : ` ${JoinTexts<List, " ">}`;

type WithClause<List extends readonly Frag[]> =
    List extends readonly [] ? "" : `WITH ${JoinTexts<List, ", ">} `;

type LimitClause<L extends number | null> =
    L extends number ? ` LIMIT ${L}` : "";

type OffsetClause<O extends number | null> =
    O extends number ? ` OFFSET ${O}` : "";

type UnionClause<U extends string | null> =
    U extends null ? "" : ` ${U & string}`;

/**
 * Assemble the tag into a literal SQL string. Widens to `string` if any
 * participating fragment text is non-literal (e.g. from(dynamic)).
 */
export type BuildSQL<Sql extends SqlTag, Mode extends BuildMode> =
    `${WithClause<Sql["ctes"]>}${SelectClause<Sql, Mode>}${FromClause<Sql["from"]>}${JoinClause<Sql["joins"]>}${Clause<"WHERE", Sql["wheres"], " AND ">}${Clause<"GROUP BY", Sql["groupBys"], ", ">}${Clause<"HAVING", Sql["havings"], " AND ">}${Clause<"ORDER BY", Sql["orderBys"], ", ">}${LimitClause<Sql["limit"]>}${OffsetClause<Sql["offset"]>}${UnionClause<Sql["union"]>}`;
```

> **Note on order-independence (spec "The rule is order-independent"):** because `req` mode filters the *final* select list by the `cond` flag rather than replaying call order, an unconditional `select("i.id")` keeps `id` in `ReqSQL` regardless of where a conditional `selectIf("i.*")` sits. No extra work needed — the filter is positional-agnostic.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0 (all `RequireTrue` assertions resolve to `true`).

> If `tsc` reports excessive-depth (TS2589) on long fragment lists, that is expected at extreme sizes — Task 13's benchmark covers it. For the test fixtures above (≤3 fragments per clause) it must pass cleanly.

- [x] **Step 5: Commit**

```bash
git add src/builder/sql-tag.ts tests/builder/types/sql-tag.test.ts
git commit -m "feat(builder): lean type-level Sql tag + BuildSQL assembler"
```

---

### Task 7: `return-type.ts` — `BuilderSQL`, `BuilderReturnType`, `BuilderResultBrand`

**Files:**
- Create: `src/builder/return-type.ts`
- Test: `tests/builder/types/return-type.test.ts`

Implements the spec's required/optional partition. `BuilderReturnType` takes the builder type `B` (a `SelectQueryBuilder<Schema, Sql>`); it reads `Schema` and `Sql` off `B`. Because `SelectQueryBuilder` is defined in Task 8, this task defines the partition over **raw `Schema` + `Sql`** via a helper `BuilderReturnTypeFor<Schema, Sql>` that Task 8 wires `B` into. The test here calls the helper directly with a hand-built tag.

- [x] **Step 1: Write the failing test**

```ts
// tests/builder/types/return-type.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { GetReturnType } from "../../../src/index.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";
import type {
    BuilderReturnTypeFor,
    BuilderSQLFor,
} from "../../../src/builder/return-type.js";
import type {
    EmptySqlTag,
    WithSelect,
    WithFrom,
} from "../../../src/builder/sql-tag.js";

// from("users").select("id", "s0") [unconditional]
type Tag1 = WithSelect<WithFrom<EmptySqlTag, "users">, "id", "s0", false>;
type _Sql1 = RequireTrue<
    AssertEqual<BuilderSQLFor<Tag1>, "SELECT id FROM users">
>;
// all-required ⇒ equals GetReturnType over MaxSQL
type _Row1 = RequireTrue<
    AssertEqual<
        BuilderReturnTypeFor<TestSchema, Tag1>,
        GetReturnType<"SELECT id FROM users", TestSchema>
    >
>;

// from("users").select("id","s0").selectIf(cond,"name","s1")
type Tag2 = WithSelect<
    WithSelect<WithFrom<EmptySqlTag, "users">, "id", "s0", false>,
    "name",
    "s1",
    true
>;
// id required, name optional
type _Row2Id = RequireTrue<
    AssertEqual<BuilderReturnTypeFor<TestSchema, Tag2>["id"], number>
>;
type _Row2Name = RequireTrue<
    AssertEqual<BuilderReturnTypeFor<TestSchema, Tag2>["name"], string | undefined>
>;
type _Row2NameOptional = RequireTrue<
    AssertEqual<"name" extends keyof Required<BuilderReturnTypeFor<TestSchema, Tag2>> ? true : false, true>
>;
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — cannot find `return-type.js`.

- [x] **Step 3: Write the implementation**

```ts
// src/builder/return-type.ts
import type { DatabaseSchema } from "../schema.js";
import type { GetReturnType } from "../index.js";
import type { BuildSQL, SqlTag, SelFrag } from "./sql-tag.js";

/** Type-level canonical SQL: the maximal query (all select fragments present). */
export type BuilderSQLFor<Sql extends SqlTag> = BuildSQL<Sql, "max">;

/** True iff some select fragment is unconditional. */
type HasUncond<List extends readonly SelFrag[]> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? H["cond"] extends false ? true : HasUncond<R>
        : false;

// Merge a "required" row and a "max" row into the partition:
//   keys in ReqRow are required; keys only in Row are optional.
type Partition<Row, ReqRow> =
    & { [K in keyof Row as K extends keyof ReqRow ? K : never]: Row[K] }
    & { [K in keyof Row as K extends keyof ReqRow ? never : K]?: Row[K] };

/**
 * Required/optional partition over GetReturnType of MaxSQL / ReqSQL / ScopeSQL.
 * - hasUncond: Row = GetReturnType<MaxSQL>; ReqRow = GetReturnType<ReqSQL>;
 *   partition keys: required iff in ReqRow.
 * - else (no unconditional select → all-false runtime path is SELECT *):
 *   Partial<GetReturnType<MaxSQL> & GetReturnType<ScopeSQL>>.
 */
export type BuilderReturnTypeFor<Schema extends DatabaseSchema, Sql extends SqlTag> =
    HasUncond<Sql["selects"]> extends true
        ? GetReturnType<BuildSQL<Sql, "max">, Schema> extends infer Row
            ? GetReturnType<BuildSQL<Sql, "req">, Schema> extends infer ReqRow
                ? Partition<Row, ReqRow>
                : Row
            : {}
        : Partial<
            & GetReturnType<BuildSQL<Sql, "max">, Schema>
            & GetReturnType<BuildSQL<Sql, "scope">, Schema>
        >;

/** Brand carried by toBrandedString(); not used at runtime. */
export interface BuilderResultBrand<Schema extends DatabaseSchema, Sql extends SqlTag> {
    readonly __schema?: Schema;
    readonly __sql?: Sql;
}
```

> The `B`-keyed public aliases (`BuilderSQL<B>`, `BuilderReturnType<B>`) are added in Task 8 once `SelectQueryBuilder` exists, as thin wrappers extracting `Schema`/`Sql` from `B`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [x] **Step 5: Commit**

```bash
git add src/builder/return-type.ts tests/builder/types/return-type.test.ts
git commit -m "feat(builder): BuilderReturnType partition over MaxSQL/ReqSQL/ScopeSQL"
```

---

## Phase 3 — The builder

### Task 8: `select.ts` — `SelectQueryBuilder` interface + `createSelectQuery` + impl

**Files:**
- Create: `src/builder/select.ts`
- Modify: `src/builder/return-type.ts` (add `B`-keyed aliases)
- Test: `tests/builder/select-runtime.test.ts` (runtime), `tests/builder/types/select-types.test.ts` (types)

The interface declares two generics `<Schema, Sql>`. Each method's return type threads the appropriate `With*` tag mutation. `select`/`selectIf` differ only by the `Cond` flag passed to `WithSelect`. `where`/`group`/`having`/`order`/`join`/`limit`/`offset` and their `*If` variants mutate the tag identically (condition erased) and never flag selects. `apply`/`applyIf` capture the transform's output tag `Sql2` as an inferred type param; `applyIf` re-flags every *newly introduced* select as conditional.

The runtime impl is ported from OLD `src/select/builder.ts` with these changes:
1. Generics become `<Schema, Sql>` (drop `State`).
2. `from(builder)` **throws** when the inner builder carries params (spec Runtime behavior).
3. State field names are the `*Sql` runtime fields only (no old type-level fields).
4. `getParams()` uses `collectParamValues` from `params.ts`.

- [x] **Step 1: Write the failing runtime test**

```ts
// tests/builder/select-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../src/builder/select.js";
import type { EcommerceSchema } from "../fixtures/ecommerce-schema.js";

describe("createSelectQuery runtime", () => {
    it("assembles a basic query and is immutable per method", () => {
        const b0 = createSelectQuery<EcommerceSchema>().from("Network_Order o");
        const b1 = b0.select("o.id");
        expect(b0.toString()).toBe("SELECT * FROM Network_Order o");
        expect(b1.toString()).toBe("SELECT o.id FROM Network_Order o");
    });

    it("honors *If conditions at runtime", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id")
            .selectIf(false, "o.status")
            .whereIf(true, "o.id = :id");
        expect(b.toString()).toBe("SELECT o.id FROM Network_Order o WHERE o.id = $1");
    });

    it("expands named params and orders getParams()", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = :id AND o.networkId = :nid")
            .withParams({ id: "x", nid: "y" });
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.id = $1 AND o.networkId = $2",
        );
        expect([...b.getParams()]).toEqual(["x", "y"]);
    });

    it("removeSelect drops the fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id", "sid")
            .select("o.status", "sstatus")
            .removeSelect("sid");
        expect(b.toString()).toBe("SELECT o.status FROM Network_Order o");
    });

    it("embeds a param-free subquery via from(builder)", () => {
        const inner = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .select("id");
        const outer = createSelectQuery<EcommerceSchema>().from(inner);
        expect(outer.toString()).toBe("SELECT * FROM (SELECT id FROM Network_Order)");
    });

    it("throws when from(builder) carries params", () => {
        const inner = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .where("id = :id")
            .withParams({ id: 1 });
        expect(() => createSelectQuery<EcommerceSchema>().from(inner)).toThrow(
            /parameterized subquery/i,
        );
    });

    it("toBrandedString returns the same SQL as toString", () => {
        const b = createSelectQuery<EcommerceSchema>().from("Network_Order").select("id");
        expect(b.toBrandedString()).toBe(b.toString());
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/builder/select-runtime.test.ts`
Expected: FAIL — cannot resolve `select.js`.

- [x] **Step 3: Write the implementation**

Define the interface and impl. The interface (type-level surface):

```ts
// src/builder/select.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleSelectSQL } from "./assemble.js";
import { collectParamValues, type QueryParamInput, type QueryParamValue } from "./params.js";
import { EMPTY_RUNTIME_STATE, type RuntimeSelectState } from "./state.js";
import { ConditionTreeBuilder } from "./condition-tree.js";
import type {
    AnySqlTag,
    EmptySqlTag,
    ResolveId,
    SelFrag,
    SqlTag,
    WithFrom,
    WithGroupBy,
    WithHaving,
    WithJoin,
    WithLimit,
    WithOffset,
    WithOrderBy,
    WithSelect,
    WithWhere,
    WithoutJoin,
    WithoutSelect,
} from "./sql-tag.js";
import type { BuilderResultBrand } from "./return-type.js";

// Text a condition contributes to the tag: a tree's Expr literal, or the string.
type CondText<C> = C extends ConditionTreeBuilder<any, infer E extends string> ? E
    : C extends string ? C
    : string;

// Render a columns argument (string | readonly string[]) to its joined text.
type ColsText<Cols> = Cols extends readonly string[] ? JoinArr<Cols>
    : Cols extends string ? Cols
    : string;
type JoinArr<A extends readonly string[], Acc extends string = ""> =
    A extends readonly [infer H extends string, ...infer R extends readonly string[]]
        ? JoinArr<R, Acc extends "" ? H : `${Acc}, ${H}`>
        : Acc;

// Re-flag every select fragment the applyIf transform INTRODUCED as conditional.
// "Introduced" = a brand-new id OR an existing id whose fragment the transform
// overwrote (different text/flag). Only fragments byte-identical to the input
// tag's same-id fragment are left untouched (they keep their flag). This is what
// makes the F-G2 edge correct: a conditional producer overwriting an
// unconditional slot carries the conditional flag (spec "Fragment-id reuse").
type FlagNewConditional<Before extends SqlTag, After extends SqlTag> =
    Omit<After, "selects"> & {
        readonly selects: ReflagSelects<Before["selects"], After["selects"]>;
    };
type ReflagSelects<
    Before extends readonly SelFrag[],
    After extends readonly SelFrag[],
> = {
    [I in keyof After]: After[I] extends SelFrag
        ? FindFragById<Before, After[I]["id"]> extends infer B
            ? [B] extends [never]
                ? MarkCond<After[I]>                  // brand-new id → conditional
                : FragEqual<B, After[I]> extends true
                    ? After[I]                        // untouched → keep its flag
                    : MarkCond<After[I]>              // overwritten by transform → conditional
            : MarkCond<After[I]>
        : After[I];
};
type FindFragById<List extends readonly SelFrag[], Id extends string> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? H["id"] extends Id ? H : FindFragById<R, Id>
        : never;
type FragEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type MarkCond<F extends SelFrag> = { id: F["id"]; text: F["text"]; cond: true };

export interface SelectQueryBuilder<Schema extends DatabaseSchema, Sql extends SqlTag> {
    select<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithSelect<Sql, ColsText<Cols>, ResolveId<Id, "select", Sql["selects"]>, false>>;

    selectIf<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithSelect<Sql, ColsText<Cols>, ResolveId<Id, "select", Sql["selects"]>, true>>;

    from<Src extends string | SelectQueryBuilder<Schema, any>>(
        source: Src,
    ): SelectQueryBuilder<Schema, WithFrom<Sql, Src extends string ? Src : string>>;

    where<Cond extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        condition: Cond,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithWhere<Sql, CondText<Cond>, ResolveId<Id, "where", Sql["wheres"]>>>;

    whereIf<Cond extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        condition: boolean,
        clause: Cond,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithWhere<Sql, CondText<Cond>, ResolveId<Id, "where", Sql["wheres"]>>>;

    join<J extends string, Id extends string | undefined = undefined>(
        joinSql: J,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithJoin<Sql, J, ResolveId<Id, "join", Sql["joins"]>>>;

    joinIf<J extends string, Id extends string | undefined = undefined>(
        condition: boolean,
        joinSql: J,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithJoin<Sql, J, ResolveId<Id, "join", Sql["joins"]>>>;

    groupBy<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithGroupBy<Sql, ColsText<Cols>, ResolveId<Id, "group", Sql["groupBys"]>>>;

    groupByIf<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithGroupBy<Sql, ColsText<Cols>, ResolveId<Id, "group", Sql["groupBys"]>>>;

    having<Cond extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        condition: Cond,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithHaving<Sql, CondText<Cond>, ResolveId<Id, "having", Sql["havings"]>>>;

    havingIf<Cond extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        condition: boolean,
        clause: Cond,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithHaving<Sql, CondText<Cond>, ResolveId<Id, "having", Sql["havings"]>>>;

    orderBy<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithOrderBy<Sql, ColsText<Cols>, ResolveId<Id, "order", Sql["orderBys"]>>>;

    orderByIf<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithOrderBy<Sql, ColsText<Cols>, ResolveId<Id, "order", Sql["orderBys"]>>>;

    limit<const L extends number>(limit: L): SelectQueryBuilder<Schema, WithLimit<Sql, L>>;
    limitIf<const L extends number>(condition: boolean, limit: L): SelectQueryBuilder<Schema, WithLimit<Sql, L>>;
    offset<const O extends number>(offset: O): SelectQueryBuilder<Schema, WithOffset<Sql, O>>;
    offsetIf<const O extends number>(condition: boolean, offset: O): SelectQueryBuilder<Schema, WithOffset<Sql, O>>;

    removeSelect<Id extends string>(id: Id): SelectQueryBuilder<Schema, WithoutSelect<Sql, Id>>;
    removeJoin<Id extends string>(id: Id): SelectQueryBuilder<Schema, WithoutJoin<Sql, Id>>;

    withParams<P extends Record<string, QueryParamInput>>(
        params: P,
    ): SelectQueryBuilder<Schema, Sql>;

    apply<Sql2 extends SqlTag>(
        fn: (b: SelectQueryBuilder<Schema, Sql>) => SelectQueryBuilder<Schema, Sql2>,
    ): SelectQueryBuilder<Schema, Sql2>;

    applyIf<Sql2 extends SqlTag>(
        condition: boolean,
        fn: (b: SelectQueryBuilder<Schema, Sql>) => SelectQueryBuilder<Schema, Sql2>,
    ): SelectQueryBuilder<Schema, FlagNewConditional<Sql, Sql2>>;

    getParams(): ReadonlyArray<QueryParamValue>;
    toString(): string;
    toBrandedString(): string & { __type: BuilderResultBrand<Schema, Sql> };
}

// (No `DefaultId`: idless calls resolve a type-level auto id via `ResolveId`
//  in each method's return type — see below.)
```

> **Auto-id (executor guidance):** when no `id` is passed, `Id` infers `undefined` and the return type computes the clause's next id via `ResolveId<Id, Prefix, List>` = ``${Prefix}_${List["length"]}`` — `select_0`, `select_1`, `join_0`, `where_0`, … This mirrors the runtime auto-id (`select_${Object.keys(selectSql).length}`) **exactly**, so type and runtime ids stay in lockstep, including after a `removeSelect` shrinks the count (a later idless `select` then reuses the freed index — same collision/overwrite at both levels). This makes idless chains (the dominant real-world form — see Task 15's reporting chains, which use many idless `.select(...)` calls) type correctly. Explicit ids remain available and are needed only to *target* a specific slot for `removeSelect`/overwrite control (spec "use distinct ids …"). The earlier `DefaultId = string` approach was wrong: with a non-literal `string` id, `HasId<List, string>` is true for any non-empty list, so a second idless `select` would *replace the head fragment* — collapsing the row type. `ResolveId` fixes that.

Now the impl class (ported from OLD `builder.ts`, generics collapsed to `<Schema, Sql>`, all `as unknown as SelectQueryBuilder<Schema, any>`):

```ts
class SelectQueryBuilderImpl<Schema extends DatabaseSchema, Sql extends SqlTag> {
    readonly _state: RuntimeSelectState;

    constructor(state?: RuntimeSelectState) {
        this._state = state ?? EMPTY_RUNTIME_STATE;
    }

    private clone(patch: Partial<RuntimeSelectState>): RuntimeSelectState {
        return { ...this._state, ...patch };
    }

    private next(state: RuntimeSelectState): any {
        return new SelectQueryBuilderImpl<Schema, any>(state);
    }

    select(columns: string | readonly string[], id?: string): any {
        const rawCols = Array.isArray(columns) ? [...columns] : [columns as string];
        const cols = rawCols.length > 0 ? [...rawCols] : [];
        const key = id ?? `select_${Object.keys(this._state.selectSql).length}`;
        return this.next(this.clone({
            selectSql: { ...this._state.selectSql, [key]: cols },
        }));
    }

    selectIf(condition: boolean, columns: string | readonly string[], id?: string): any {
        return condition ? this.select(columns, id) : this.next(this._state);
    }

    from(source: string | { toString(): string; getParams(): ReadonlyArray<QueryParamValue> }): any {
        let fromSql: string;
        if (typeof source === "string") {
            fromSql = source;
        }
        else {
            if (source.getParams().length > 0) {
                throw new Error(
                    "from() does not support a parameterized subquery builder: the inner " +
                    "builder carries params that cannot be merged into the outer query. " +
                    "Inline the subquery as a string or remove its params.",
                );
            }
            fromSql = `(${source.toString()})`;
        }
        return this.next(this.clone({ fromSql }));
    }

    where(condition: string | ConditionTreeBuilder<any, any>, id?: string): any {
        const key = id ?? `where_${Object.keys(this._state.whereSql).length}`;
        const sql = typeof condition === "string" ? condition : condition.toString();
        return this.next(this.clone({ whereSql: { ...this._state.whereSql, [key]: sql } }));
    }

    whereIf(condition: boolean, clause: string | ConditionTreeBuilder<any, any>, id?: string): any {
        return condition ? this.where(clause, id) : this.next(this._state);
    }

    join(joinSql: string, id?: string): any {
        const key = id ?? `join_${this._state.joins.length}`;
        const existing = this._state.joins.find(j => j.id === key);
        const filtered = this._state.joins.filter(j => j.id !== key);
        const nextJoins = [...filtered, existing ?? { id: key }];
        return this.next(this.clone({
            joinSql: { ...this._state.joinSql, [key]: joinSql },
            joins: nextJoins,
        }));
    }

    joinIf(condition: boolean, joinSql: string, id?: string): any {
        return condition ? this.join(joinSql, id) : this.next(this._state);
    }

    groupBy(columns: string | readonly string[], id?: string): any {
        const rawCols = Array.isArray(columns) ? [...columns] : [columns as string];
        const key = id ?? `group_${Object.keys(this._state.groupBySql).length}`;
        return this.next(this.clone({
            groupBySql: { ...this._state.groupBySql, [key]: rawCols.join(", ") },
        }));
    }

    groupByIf(condition: boolean, columns: string | readonly string[], id?: string): any {
        return condition ? this.groupBy(columns, id) : this.next(this._state);
    }

    having(condition: string | ConditionTreeBuilder<any, any>, id?: string): any {
        const key = id ?? `having_${Object.keys(this._state.havingSql).length}`;
        const sql = typeof condition === "string" ? condition : condition.toString();
        return this.next(this.clone({ havingSql: { ...this._state.havingSql, [key]: sql } }));
    }

    havingIf(condition: boolean, clause: string | ConditionTreeBuilder<any, any>, id?: string): any {
        return condition ? this.having(clause, id) : this.next(this._state);
    }

    orderBy(columns: string | readonly string[], id?: string): any {
        const rawCols = Array.isArray(columns) ? [...columns] : [columns as string];
        const key = id ?? `order_${Object.keys(this._state.orderBySql).length}`;
        return this.next(this.clone({
            orderBySql: { ...this._state.orderBySql, [key]: rawCols.join(", ") },
        }));
    }

    orderByIf(condition: boolean, columns: string | readonly string[], id?: string): any {
        return condition ? this.orderBy(columns, id) : this.next(this._state);
    }

    limit(limit: number): any {
        return this.next(this.clone({ limit }));
    }
    limitIf(condition: boolean, limit: number): any {
        return condition ? this.limit(limit) : this.next(this._state);
    }
    offset(offset: number): any {
        return this.next(this.clone({ offset }));
    }
    offsetIf(condition: boolean, offset: number): any {
        return condition ? this.offset(offset) : this.next(this._state);
    }

    removeSelect(id: string): any {
        const nextSelectSql = { ...this._state.selectSql };
        if (!(id in nextSelectSql)) {
            return this.next(this._state);
        }
        delete (nextSelectSql as any)[id];
        return this.next(this.clone({ selectSql: nextSelectSql }));
    }

    removeJoin(id: string): any {
        const nextJoinSql = { ...this._state.joinSql };
        const hadSql = id in nextJoinSql;
        delete (nextJoinSql as any)[id];
        const nextJoins = this._state.joins.filter(j => j.id !== id);
        if (!hadSql && nextJoins.length === this._state.joins.length) {
            return this.next(this._state);
        }
        return this.next(this.clone({ joinSql: nextJoinSql, joins: nextJoins }));
    }

    withParams(params: Record<string, QueryParamInput>): any {
        return this.next(this.clone({
            namedParams: { ...this._state.namedParams, ...params },
        }));
    }

    apply(fn: (b: any) => any): any {
        return fn(this);
    }

    applyIf(condition: boolean, fn: (b: any) => any): any {
        return condition ? fn(this) : this;
    }

    getParams(): ReadonlyArray<QueryParamValue> {
        const namedParams = this._state.namedParams;
        if (namedParams && Object.keys(namedParams).length > 0) {
            const sql = assembleSelectSQLPreSub(this._state);
            return collectParamValues(sql, namedParams);
        }
        return this._state.params;
    }

    toString(): string {
        return assembleSelectSQL(this._state);
    }

    toBrandedString(): any {
        return assembleSelectSQL(this._state);
    }
}

// Build the un-substituted fragment string for getParams ordering (matches OLD:
// getParams scans fragments joined by " " BEFORE $n substitution).
function assembleSelectSQLPreSub(state: RuntimeSelectState): string {
    return [
        ...Object.values(state.cteSql),
        ...Object.values(state.selectSql).flat(),
        state.fromSql ?? "",
        ...Object.values(state.joinSql),
        ...Object.values(state.whereSql),
        ...Object.values(state.groupBySql),
        ...Object.values(state.havingSql),
        ...Object.values(state.orderBySql),
        state.unionSql ?? "",
    ].join(" ");
}

export function createSelectQuery<Schema extends DatabaseSchema>(): SelectQueryBuilder<Schema, EmptySqlTag> {
    return new SelectQueryBuilderImpl<Schema, EmptySqlTag>(EMPTY_RUNTIME_STATE) as unknown as SelectQueryBuilder<Schema, EmptySqlTag>;
}
```

> **getParams ordering (important parity detail):** OLD `getParams()` scans the fragments joined by `" "` (NOT the assembled query), in the fixed clause order shown in `assembleSelectSQLPreSub`. This can differ from the assembled-query scan only when params repeat across clauses; the helper above replicates OLD exactly. The `assemble.ts` substitution (Task 4) and this scan share the same regex via `params.ts`, so $n numbering matches.

- [x] **Step 4: Add the `B`-keyed aliases to `return-type.ts`**

Append to `src/builder/return-type.ts`:

```ts
import type { SelectQueryBuilder } from "./select.js";

/** Extract the Sql tag from a builder type. */
type SqlOf<B> = B extends SelectQueryBuilder<any, infer Sql extends SqlTag> ? Sql : never;
type SchemaOf<B> = B extends SelectQueryBuilder<infer S extends DatabaseSchema, any> ? S : never;

export type BuilderSQL<B> = BuilderSQLFor<SqlOf<B>>;
export type BuilderReturnType<B> = BuilderReturnTypeFor<SchemaOf<B>, SqlOf<B>>;
```

- [x] **Step 5: Run the runtime test to verify it passes**

Run: `bun test tests/builder/select-runtime.test.ts`
Expected: PASS (all 7 cases, incl. the param-subquery throw).

- [x] **Step 6: Write a basic type-level test**

```ts
// tests/builder/types/select-types.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { GetReturnType } from "../../../src/index.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderSQL, BuilderReturnType } from "../../../src/builder/return-type.js";

const b = createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.id", "s0");
type B = typeof b;

type _Sql = RequireTrue<AssertEqual<BuilderSQL<B>, "SELECT o.id FROM Network_Order o">>;
type _Row = RequireTrue<
    AssertEqual<
        BuilderReturnType<B>,
        GetReturnType<"SELECT o.id FROM Network_Order o", EcommerceSchema>
    >
>;
```

- [x] **Step 7: Run tsc to verify the type test passes**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [x] **Step 8: Commit**

```bash
git add src/builder/select.ts src/builder/return-type.ts tests/builder/select-runtime.test.ts tests/builder/types/select-types.test.ts
git commit -m "feat(builder): SelectQueryBuilder interface, impl, createSelectQuery"
```

---

## Phase 4 — DB integration

### Task 9: `db.ts` — `createSelectFn`, `ValidQuery`, `ValidQueryBuilder`, `FragmentErrors`, result types

**Files:**
- Create: `src/builder/db.ts`
- Test: `tests/builder/types/db.test.ts`, `tests/builder/db-runtime.test.ts`

Ported from OLD `src/db.ts` with these changes (per spec):
1. **Remove** the untyped builder overload (and `UntypedSelectBuilder` import).
2. `ValidQuery<Q, Schema>` uses the core `ValidateSQL` (not OLD `ValidateSelectSQL`).
3. `ValidQueryBuilder<Schema, B>` = the spec's per-fragment + allow-unknown guard built on `FragmentErrors` + `ValidateSQL<BuilderSQL<B>, Schema>`.
4. `SelectResult`/`SelectResultArray` use core `GetReturnType`.

`FragmentErrors<B, Schema>` runs `Validate*Part` over **literal** fragments only (skips non-literal text → unknown). It reads the builder's `Sql` tag.

- [x] **Step 1: Write the failing type test**

```ts
// tests/builder/types/db.test.ts
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";
import { createSelectFn } from "../../../src/builder/db.js";
import { createSelectQuery } from "../../../src/builder/select.js";

const select = createSelectFn<EcommerceSchema>((sql, params) =>
    Promise.resolve([] as any[]),
);

// Valid string query compiles and infers rows.
async function ok() {
    const rows = await select("SELECT id FROM Network_Order", []);
    const _r: { id: string }[] = rows;
    return _r;
}

// Invalid literal column is rejected.
// @ts-expect-error - notacol is not a column of Network_Order
const _bad = select("SELECT notacol FROM Network_Order", []);

// Valid builder compiles.
async function okBuilder() {
    const b = createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.id", "s0");
    const rows = await select(b);
    const _r: { id: string }[] = rows;
    return _r;
}

// Builder with an invalid literal alias-qualified column in a fully-literal
// builder IS rejected (no dynamic fragment → full ValidateSQL applies).
// @ts-expect-error - o.notacol is invalid
const _badBuilder = select(
    createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.notacol", "s0"),
);
```

> `MergeOverrides` and the allow-unknown/mixed-fragment cases get dedicated tests in Task 12 (F3/F-C). This task pins the core happy + reject paths.

- [x] **Step 2: Run tsc to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — cannot find `db.js`; also the `@ts-expect-error` lines error as "unused" (they will become used once db exists).

- [x] **Step 3: Write the implementation**

```ts
// src/builder/db.ts
import type { DatabaseSchema } from "../schema.js";
import type { GetReturnType, ValidateSQL } from "../index.js";
import type {
    ValidateFromPart,
    ValidateJoinPart,
    ValidateSelectPart,
    ValidateWherePart,
    ValidateHavingPart,
    ValidateGroupByPart,
    ValidateOrderByPart,
} from "../index.js";
import type { SelectQueryBuilder } from "./select.js";
import type { BuilderReturnType, BuilderSQL } from "./return-type.js";
import type { Frag, SelFrag, SqlTag } from "./sql-tag.js";

type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** String-query validity (core). */
export type ValidQuery<Q extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Q, Schema> extends infer V
        ? V extends true ? Q : `[SQL Error] ${V & string}`
        : never;

// --- per-fragment validation over LITERAL fragments only ---
// A fragment whose text is non-literal `string` is skipped (→ never error).
type FragErr<Verdict> = Verdict extends true ? never
    : Verdict extends string ? Verdict
    : never;

type SelectErrors<List extends readonly SelFrag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateSelectPart<H["text"], S>>)
            | SelectErrors<R, S>
        : never;

type FromError<From extends string | null, S extends DatabaseSchema> =
    From extends null ? never
    : string extends (From & string) ? never
    : FragErr<ValidateFromPart<From & string, S>>;

type JoinErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateJoinPart<H["text"], S>>)
            | JoinErrors<R, S>
        : never;

type WhereErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateWherePart<H["text"], S>>)
            | WhereErrors<R, S>
        : never;

type GroupErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateGroupByPart<H["text"], S>>)
            | GroupErrors<R, S>
        : never;

type HavingErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateHavingPart<H["text"], S>>)
            | HavingErrors<R, S>
        : never;

type OrderErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateOrderByPart<H["text"], S>>)
            | OrderErrors<R, S>
        : never;

/** Per-fragment errors over the literal fragments of B's Sql tag. */
export type FragmentErrors<B, Schema extends DatabaseSchema> =
    B extends SelectQueryBuilder<Schema, infer Sql extends SqlTag>
        ? (
            | SelectErrors<Sql["selects"], Schema>
            | FromError<Sql["from"], Schema>
            | JoinErrors<Sql["joins"], Schema>
            | WhereErrors<Sql["wheres"], Schema>
            | GroupErrors<Sql["groupBys"], Schema>
            | HavingErrors<Sql["havings"], Schema>
            | OrderErrors<Sql["orderBys"], Schema>
        ) extends infer E
            ? [E] extends [never] ? [] : (E & string)[]
            : []
        : [];

/**
 * Builder validity: per-fragment literal errors first; else whole-query check
 * with allow-unknown when the assembled SQL is non-literal `string`.
 */
export type ValidQueryBuilder<Schema extends DatabaseSchema, B extends SelectQueryBuilder<Schema, any>> =
    FragmentErrors<B, Schema> extends []
        ? BuilderSQL<B> extends infer SQL extends string
            ? string extends SQL
                ? B // some fragment text non-literal → allow, untyped
                : ValidateSQL<SQL, Schema> extends true
                    ? B
                    : `[SQL Error] ${Extract<ValidateSQL<SQL, Schema>, string>}`
            : B
        : `[SQL Error] ${FragmentErrors<B, Schema>[number]}`;

export type SelectResult<SQL extends string, Schema extends DatabaseSchema> =
    Prettify<GetReturnType<SQL, Schema>>;
export type SelectResultArray<SQL extends string, Schema extends DatabaseSchema> =
    Prettify<GetReturnType<SQL, Schema>>[];

type InvalidOverrideKeys<Result, Overrides> = Exclude<keyof Overrides, keyof Result>;

export type MergeOverrides<Result, Overrides> = keyof Overrides extends never
    ? Result
    : InvalidOverrideKeys<Result, Overrides> extends never
        ? Prettify<Omit<Result, keyof Overrides> & Overrides>
        : {
            __error: true;
            message: `Override contains keys not in result type: ${InvalidOverrideKeys<Result, Overrides> & string}`;
        };

export type SelectBuilderResult<B extends SelectQueryBuilder<any, any>> =
    Prettify<BuilderReturnType<B>>;
export type SelectBuilderResultArray<B extends SelectQueryBuilder<any, any>> =
    SelectBuilderResult<B>[];

export type QueryHandler = (query: string, params?: unknown[]) => unknown;

export type IsValidSelect<SQL extends string, Schema extends DatabaseSchema> =
    ValidateSQL<SQL, Schema> extends true ? true : false;

export function createSelectFn<
    Schema extends DatabaseSchema,
    Overrides extends Record<string, unknown> = {},
>(handler: QueryHandler) {
    // String query overload
    function select<Q extends string>(
        query: ValidQuery<Q, Schema>,
        params?: unknown[],
    ): Promise<MergeOverrides<SelectResultArray<Q, Schema>[number], Overrides>[]>;

    // Typed builder overload
    function select<B extends SelectQueryBuilder<Schema, any>>(
        query: ValidQueryBuilder<Schema, B>,
        params?: unknown[],
    ): Promise<MergeOverrides<SelectBuilderResult<B>, Overrides>[]>;

    function select(
        query: ValidQuery<string, Schema> | SelectQueryBuilder<Schema, any>,
        params?: unknown[],
    ) {
        if (typeof query === "string") {
            return handler(query, params) as Promise<any>;
        }
        const sql = query.toString();
        const finalParams = params ?? [...query.getParams()];
        return handler(sql, finalParams) as Promise<any>;
    }

    return select;
}
```

> **Executor note:** the per-clause error collectors (`SelectErrors`, `JoinErrors`, `WhereErrors`, `GroupErrors`, `HavingErrors`, `OrderErrors`, `FromError`) each skip non-literal (`string extends Text`) fragments → `never`, so dynamic fragments never contribute an error. `FragmentErrors` collects the union and flattens it to a `string[]` (`[]` when empty).

- [x] **Step 4: Run tsc to verify the type test passes**

Run: `npx tsc --noEmit`
Expected: exit 0; the two `@ts-expect-error` lines are satisfied (the calls do error).

- [x] **Step 5: Write + run a runtime test for createSelectFn**

```ts
// tests/builder/db-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createSelectFn } from "../../src/builder/db.js";
import { createSelectQuery } from "../../src/builder/select.js";
import type { EcommerceSchema } from "../fixtures/ecommerce-schema.js";

describe("createSelectFn runtime", () => {
    it("passes string query + params straight to the handler", async () => {
        let seen: [string, unknown[] | undefined] | null = null;
        const select = createSelectFn<EcommerceSchema>((sql, params) => {
            seen = [sql, params];
            return Promise.resolve([]);
        });
        await select("SELECT id FROM Network_Order", [1]);
        expect(seen).toEqual(["SELECT id FROM Network_Order", [1]]);
    });

    it("assembles a builder and derives params when none passed", async () => {
        let seen: [string, unknown[] | undefined] | null = null;
        const select = createSelectFn<EcommerceSchema>((sql, params) => {
            seen = [sql, params];
            return Promise.resolve([]);
        });
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .where("id = :id")
            .withParams({ id: "abc" });
        // `b` is a valid literal builder → `select(b)` type-checks without a cast.
        await select(b);
        expect(seen![0]).toBe("SELECT * FROM Network_Order WHERE id = $1");
        expect(seen![1]).toEqual(["abc"]);
    });
});
```

Run: `bun test tests/builder/db-runtime.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/builder/db.ts tests/builder/types/db.test.ts tests/builder/db-runtime.test.ts
git commit -m "feat(builder): createSelectFn + ValidQueryBuilder/FragmentErrors guard"
```

---

## Phase 5 — Conditional SQL templates

### Task 10: `conditional-sql.ts` — template processing rewired onto the core

**Files:**
- Create: `src/builder/conditional-sql.ts`
- Test: `tests/builder/conditional-sql.test.ts`, `tests/builder/types/conditional-sql.test.ts`

Runtime functions (`processConditionalSQL`, `processParams`, `conditionalSQL`, `normalizeWhitespace`) port **verbatim** from OLD `src/conditional/runtime.ts`. The type-level `ProcessConditionalSQL`, `AllConditionsTrue/False`, `EvalCondition`, etc. port verbatim from OLD `src/conditional/types.ts`. The matcher (`ConditionalQueryResult`, `ValidateConditionalSQL`) is **rewired** from OLD `QueryResult`/`MatchError` onto the new core's `GetReturnType`/`ValidateSQL` (no `MatchError`). `createConditionalQuery`/`withConditions` port from OLD `src/conditional/index.ts`.

**Scalar-only parity (spec):** `processParams`/`conditionalSQL`/the `query` function accept `Record<string, QueryParamValue>` — NOT `QueryParamInput`. Do not widen to arrays here.

- [x] **Step 1: Write the failing runtime test**

```ts
// tests/builder/conditional-sql.test.ts
import { describe, it, expect } from "bun:test";
import {
    processConditionalSQL,
    processParams,
    conditionalSQL,
    normalizeWhitespace,
    createConditionalQuery,
} from "../../src/builder/conditional-sql.js";
import type { EcommerceSchema } from "../fixtures/ecommerce-schema.js";

describe("processConditionalSQL", () => {
    it("includes a block when the condition is truthy", () => {
        const out = processConditionalSQL(
            "SELECT id/*if:withName*/, name/*endif*/ FROM t",
            { withName: true },
        );
        expect(out).toBe("SELECT id, name FROM t");
    });
    it("excludes a block when falsy and supports negation + nesting", () => {
        const out = processConditionalSQL(
            "a/*if:x*/ X/*if:y*/ Y/*endif*//*endif*//*if:!z*/ NZ/*endif*/",
            { x: true, y: false, z: false },
        );
        expect(out).toBe("a X NZ");
    });
    it("resolves dotted condition paths", () => {
        const out = processConditionalSQL(
            "a/*if:user.isAdmin*/ ADMIN/*endif*/",
            { user: { isAdmin: true } },
        );
        expect(out).toBe("a ADMIN");
    });
});

describe("processParams", () => {
    it("maps :name to $n in order and returns values", () => {
        const out = processParams("a = :x AND b = :y AND c = :x", { x: 1, y: 2 });
        expect(out.sql).toBe("a = $1 AND b = $2 AND c = $1");
        expect(out.params).toEqual([1, 2]);
    });
});

describe("conditionalSQL + normalizeWhitespace", () => {
    it("composes blocks and params", () => {
        const out = conditionalSQL(
            "SELECT id /*if:e*/, email/*endif*/ FROM t WHERE id = :id",
            { e: true },
            { id: 5 },
        );
        expect(normalizeWhitespace(out.sql)).toBe("SELECT id, email FROM t WHERE id = $1");
        expect(out.params).toEqual([5]);
    });
});

describe("createConditionalQuery", () => {
    it("returns processed sql + params", () => {
        const query = createConditionalQuery<EcommerceSchema>();
        const { sql, params } = query(
            "SELECT id FROM Network_Order WHERE id = :id",
            {},
            { id: "z" },
        );
        expect(sql).toBe("SELECT id FROM Network_Order WHERE id = $1");
        expect(params).toEqual(["z"]);
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/builder/conditional-sql.test.ts`
Expected: FAIL — cannot resolve `conditional-sql.js`.

- [x] **Step 3: Write the implementation**

Port the runtime block from OLD `src/conditional/runtime.ts` lines 34–166 verbatim (`getNestedValue`, `processConditionalSQL`, `processParams`, `conditionalSQL`, `normalizeWhitespace`) — but replace the local `QueryParamValue` with an import from `./params.js`. Port the type-level block from OLD `src/conditional/types.ts` verbatim (`GetPath`, `IsTruthy`, `EvalCondition`, `Contains`, `HasIndeterminateCondition`, `ProcessInnermost`, `ProcessConditionalSQL`, `AllConditionsTrue`, `AllConditionsFalse`, `ConditionalColumn`, `ConditionalLeftJoinColumn`, `ExtractParamNames`, `ValidateParams`). Then add the rewired matcher + factory:

```ts
// ... after the ported runtime + types blocks ...
import type { DatabaseSchema } from "../schema.js";
import type { GetReturnType, ValidateSQL } from "../index.js";
import type { QueryParamValue } from "./params.js";

type Flatten<T> = { [K in keyof T]: T[K] } & {};

/**
 * Result type for a conditional SQL query, rewired onto the new core.
 *  1. all conditions TRUE  → full column set (GetReturnType<FullSQL>)
 *  2. all conditions FALSE → base column set (GetReturnType<BaseSQL>)
 *  3. columns in full but not base → `| undefined`
 */
export type ConditionalQueryResult<
    Template extends string,
    Conditions extends Record<string, unknown>,
    Schema extends DatabaseSchema,
> = ProcessConditionalSQL<Template, AllConditionsTrue<Conditions>> extends infer FullSQL extends string
    ? ProcessConditionalSQL<Template, AllConditionsFalse<Conditions>> extends infer BaseSQL extends string
        ? GetReturnType<FullSQL, Schema> extends infer Full
            ? GetReturnType<BaseSQL, Schema> extends infer Base
                ? MergeConditionalResults<Full, Base>
                : Full
            : {}
        : {}
    : {};

export type MergeConditionalResults<Full, Base> = Flatten<
    & { [K in keyof Full as K extends keyof Base ? K : never]: Full[K] }
    & { [K in keyof Full as K extends keyof Base ? never : K]: Full[K] | undefined }
>;

export type ProcessedSQL<
    Template extends string,
    Conditions extends Record<string, unknown>,
> = ProcessConditionalSQL<Template, Conditions>;

export type ValidateConditionalSQL<
    Template extends string,
    Conditions extends Record<string, unknown>,
    Schema extends DatabaseSchema,
> = ProcessConditionalSQL<Template, AllConditionsTrue<Conditions>> extends infer FullSQL extends string
    ? ValidateSQL<FullSQL, Schema>
    : false;

export interface TypedConditionalSQLOutput<Result> extends ConditionalSQLOutput {
    readonly __resultType?: Result;
}

export function createConditionalQuery<Schema extends DatabaseSchema>() {
    function query<
        Template extends string,
        Conditions extends Record<string, unknown>,
        Params extends Record<string, QueryParamValue> = {},
    >(
        template: Template,
        conditions: Conditions,
        params?: Params,
    ): TypedConditionalSQLOutput<ConditionalQueryResult<Template, Conditions, Schema>> {
        const result = conditionalSQL(template, conditions, params ?? {});
        return result as TypedConditionalSQLOutput<
            ConditionalQueryResult<Template, Conditions, Schema>
        >;
    }
    return query;
}

export function withConditions<StaticConditions extends Record<string, unknown>>(
    queryFn: ReturnType<typeof createConditionalQuery>,
) {
    return <Template extends string, Params extends Record<string, QueryParamValue> = {}>(
        template: Template,
        conditions: StaticConditions,
        params?: Params,
    ) => queryFn(template, conditions, params);
}
```

> `ConditionalSQLOutput`/`ConditionalSQLOptions` interfaces port verbatim from OLD runtime (they sit in the ported runtime block).

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/builder/conditional-sql.test.ts`
Expected: PASS.

- [x] **Step 5: Write the type-level scalar-only + inference test**

```ts
// tests/builder/types/conditional-sql.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import { createConditionalQuery } from "../../../src/builder/conditional-sql.js";
import type { ConditionalQueryResult } from "../../../src/builder/conditional-sql.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// Conditional column → optional.
type R = ConditionalQueryResult<
    "SELECT id, name /*if:withEmail*/, email/*endif*/ FROM users",
    { withEmail: boolean },
    TestSchema
>;
type _Id = RequireTrue<AssertEqual<R["id"], number>>;
type _Email = RequireTrue<AssertEqual<R["email"], string | undefined>>;

// Scalar-only parity: passing an array as a param value is a type error.
const query = createConditionalQuery<TestSchema>();
// @ts-expect-error - array param value is rejected (scalar-only, builder-only arrays)
query("SELECT id FROM users WHERE id = :ids", {}, { ids: [1, 2, 3] });
```

- [x] **Step 6: Run tsc to verify it passes**

Run: `npx tsc --noEmit`
Expected: exit 0 (incl. the `@ts-expect-error`).

- [x] **Step 7: Commit**

```bash
git add src/builder/conditional-sql.ts tests/builder/conditional-sql.test.ts tests/builder/types/conditional-sql.test.ts
git commit -m "feat(builder): conditional SQL templates rewired onto core"
```

---

## Phase 6 — Wiring & build

### Task 11: `index.ts` re-exports + wire into `src/index.ts` + build verification

**Files:**
- Create: `src/builder/index.ts`
- Modify: `src/index.ts`
- Test: `tests/builder/public-api.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/builder/public-api.test.ts
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createSelectFn,
    createConditionTree,
    createConditionalQuery,
    assembleSelectSQL,
    conditionalSQL,
    processConditionalSQL,
    processParams,
    normalizeWhitespace,
    withConditions,
} from "../../src/index.js";

describe("public builder API surface", () => {
    it("exposes all runtime entry points from the package root", () => {
        expect(typeof createSelectQuery).toBe("function");
        expect(typeof createSelectFn).toBe("function");
        expect(typeof createConditionTree).toBe("function");
        expect(typeof createConditionalQuery).toBe("function");
        expect(typeof assembleSelectSQL).toBe("function");
        expect(typeof conditionalSQL).toBe("function");
        expect(typeof processConditionalSQL).toBe("function");
        expect(typeof processParams).toBe("function");
        expect(typeof normalizeWhitespace).toBe("function");
        expect(typeof withConditions).toBe("function");
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/builder/public-api.test.ts`
Expected: FAIL — root `src/index.js` does not export these yet.

- [x] **Step 3: Write `src/builder/index.ts`**

```ts
// src/builder/index.ts

// Values
export { createSelectQuery, type SelectQueryBuilder } from "./select.js";
export { createSelectFn } from "./db.js";
export { createConditionTree, ConditionTreeBuilder } from "./condition-tree.js";
export {
    createConditionalQuery,
    withConditions,
    conditionalSQL,
    processConditionalSQL,
    processParams,
    normalizeWhitespace,
} from "./conditional-sql.js";
export { assembleSelectSQL } from "./assemble.js";

// Types — only those needed to use the runtime API (spec scope).
export type { QueryParamValue, QueryParamInput } from "./params.js";
export type { RuntimeSelectState } from "./state.js";
export type { AnySqlTag, SqlTag } from "./sql-tag.js";
export type {
    BuilderSQL,
    BuilderReturnType,
    BuilderResultBrand,
} from "./return-type.js";
export type {
    ValidQuery,
    ValidQueryBuilder,
    FragmentErrors,
    SelectResult,
    SelectResultArray,
    SelectBuilderResult,
    SelectBuilderResultArray,
    MergeOverrides,
    IsValidSelect,
    QueryHandler,
} from "./db.js";
export type {
    ConditionalQueryResult,
    ProcessedSQL,
    ValidateConditionalSQL,
    ConditionalSQLOutput,
    ConditionalSQLOptions,
    TypedConditionalSQLOutput,
} from "./conditional-sql.js";
```

- [x] **Step 4: Wire into `src/index.ts`**

Append at the end of `src/index.ts`:

```ts
// Runtime query builder (values + kept types).
export * from "./builder/index.js";
```

- [x] **Step 5: Run test + full type check**

Run: `bun test tests/builder/public-api.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exit 0.

- [x] **Step 6: Verify the build emits JS + d.ts for the builder**

Run: `npm run build && ls dist/builder`
Expected: exit 0; `dist/builder/` contains `select.js`, `select.d.ts`, `db.js`, `index.js`, etc.

- [x] **Step 7: Commit**

```bash
git add src/builder/index.ts src/index.ts tests/builder/public-api.test.ts
git commit -m "feat(builder): re-export builder API from package root + verify build"
```

---

## Phase 7 — Conditional-typing & validation edge tests

These pin the spec's enumerated cases (F-A, F-G, F-G2, F-helper, F3, F-C, F4, F4b, F2, plus apply/applyIf and the differently-typed alias edge). Each is a small type-level (or runtime) test. Group them by file.

### Task 12: Conditional-typing partition edges (selectIf / apply / applyIf / removeSelect / id reuse / order-independence / default-`*`)

**Files:**
- Test: `tests/builder/types/conditional-typing.test.ts`

- [x] **Step 1: Write the test**

```ts
// tests/builder/types/conditional-typing.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { GetReturnType } from "../../../src/index.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderReturnType, BuilderSQL } from "../../../src/builder/return-type.js";

declare const dyn: boolean; // non-literal condition (proves no runtime branching)

// --- selectIf optionalizes; sibling select stays required ---
const b1 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "s_id")
    .selectIf(dyn, "name", "s_name");
type R1 = BuilderReturnType<typeof b1>;
type _R1_id = RequireTrue<AssertEqual<R1["id"], number>>;
type _R1_name = RequireTrue<AssertEqual<R1["name"], string | undefined>>;
type _R1_nameOpt = RequireTrue<
    AssertEqual<{} extends Pick<R1, "name"> ? true : false, true>
>;

// --- order-independence: selectIf("...") before select("id") → id still required ---
const b2 = createSelectQuery<TestSchema>()
    .from("users")
    .selectIf(dyn, "name", "s_name")
    .select("id", "s_id");
type R2 = BuilderReturnType<typeof b2>;
type _R2_id = RequireTrue<AssertEqual<R2["id"], number>>;
type _R2_name = RequireTrue<AssertEqual<R2["name"], string | undefined>>;

// --- partition equals the GetReturnType-derived split (uses core resolver) ---
type Max = BuilderSQL<typeof b1>; // "SELECT id, name FROM users"
type _Max = RequireTrue<AssertEqual<Max, "SELECT id, name FROM users">>;
type ReqRow = GetReturnType<"SELECT id FROM users", TestSchema>;
type MaxRow = GetReturnType<"SELECT id, name FROM users", TestSchema>;
type Expected1 =
    & { [K in keyof MaxRow as K extends keyof ReqRow ? K : never]: MaxRow[K] }
    & { [K in keyof MaxRow as K extends keyof ReqRow ? never : K]?: MaxRow[K] };
type _R1_eq = RequireTrue<AssertEqual<R1, Expected1>>;

// --- expression key stays required (F-B naming consistency) ---
const b3 = createSelectQuery<TestSchema>().from("users").select("count(*)", "s_c");
type R3 = BuilderReturnType<typeof b3>;
type _R3 = RequireTrue<
    AssertEqual<R3, GetReturnType<"SELECT count(*) FROM users", TestSchema>>
>;

// --- apply: a select inside is required; applyIf: a new column is optional ---
const b4 = createSelectQuery<TestSchema>()
    .from("users")
    .apply(b => b.select("id", "s_id"));
type R4 = BuilderReturnType<typeof b4>;
type _R4 = RequireTrue<AssertEqual<R4["id"], number>>;

const b5 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "s_id")
    .applyIf(dyn, b => b.select("name", "s_name"));
type R5 = BuilderReturnType<typeof b5>;
type _R5_id = RequireTrue<AssertEqual<R5["id"], number>>;        // guaranteed elsewhere
type _R5_name = RequireTrue<AssertEqual<R5["name"], string | undefined>>; // applyIf-introduced

// --- default-* fallback (F-A): no unconditional select → Partial(scope & cond key) ---
const b6 = createSelectQuery<TestSchema>().from("users").selectIf(dyn, "id", "s_id");
type R6 = BuilderReturnType<typeof b6>;
// every scope column present but optional:
type _R6_idOpt = RequireTrue<AssertEqual<R6["id"], number | undefined>>;
type _R6_nameOpt = RequireTrue<AssertEqual<R6["name"], string | undefined>>;

// --- removeSelect + conditional (F-G): after removal only conditional producer ---
const b7 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "s_id")
    .removeSelect("s_id")
    .selectIf(dyn, "id", "s_id2");
type R7 = BuilderReturnType<typeof b7>;
type _R7_idOpt = RequireTrue<AssertEqual<R7["id"], number | undefined>>;

// --- fragment-id reuse (F-G2): conditional overwrite of slot removes the
//     unconditional guarantee. After the overwrite, slot "x" holds the
//     conditional "name", so there is NO unconditional select left → the row
//     falls to Partial<MaxRow & ScopeRow> (the all-false runtime path is
//     SELECT *). Per spec, "id types optional" — it is still present (via the
//     SELECT * scope row) but no longer required, and "name" is optional.
const b8 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "x")
    .applyIf(dyn, b => b.select("name", "x")); // overwrites slot "x" conditionally
type R8 = BuilderReturnType<typeof b8>;
type _R8_idOptional = RequireTrue<AssertEqual<R8["id"], number | undefined>>;
type _R8_name = RequireTrue<AssertEqual<R8["name"], string | undefined>>;

// distinct ids keep the unconditional guarantee:
const b9 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "x")
    .applyIf(dyn, b => b.select("name", "y"));
type R9 = BuilderReturnType<typeof b9>;
type _R9_id = RequireTrue<AssertEqual<R9["id"], number>>;
type _R9_name = RequireTrue<AssertEqual<R9["name"], string | undefined>>;
```

> **Executor caution on F-G2 (`b8`):** the conditional producer overwrites slot `x`, so after `ReflagSelects` the only select is conditional → no unconditional select remains → the row falls to `Partial<MaxRow & ScopeRow>`. `id` stays *present but optional* (it's in the `SELECT *` scope row), and `name` is optional. This is the documented-precision edge: runtime-false would actually yield exactly `{id}`, but the type over-approximates to "all scope columns optional". The assertions `_R8_idOptional` / `_R8_name` pin it. Contrast `b9` (distinct ids): `id` stays **required** because the unconditional slot survives untouched (`FragEqual` keeps its `cond:false` flag). If `ReflagSelects` produces a different shape, fix the *type*, not the test, unless the deviation is itself spec-conformant (re-read spec "Fragment-id reuse").

- [x] **Step 2: Run tsc to verify**

Run: `npx tsc --noEmit`
Expected: exit 0. If any assertion fails, debug per `superpowers:systematic-debugging` against the spec's "Conditional typing" section before changing tests.

- [x] **Step 3: Commit**

```bash
git add tests/builder/types/conditional-typing.test.ts
git commit -m "test(builder): conditional-typing partition edge cases"
```

---

### Task 13: Validation edges (F3 allow-unknown, F-C mixed, F-helper generic, F4/F4b two SQL forms + param regex, F2 subquery)

**Files:**
- Test: `tests/builder/types/validation-edges.test.ts` (types), additions to `tests/builder/select-runtime.test.ts` already cover F2 runtime + F4 runtime; add F4 type assertions here.

- [x] **Step 1: Write the test**

```ts
// tests/builder/types/validation-edges.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import { createSelectFn } from "../../../src/builder/db.js";
import type { AnySqlTag } from "../../../src/builder/sql-tag.js";
import type { SelectQueryBuilder } from "../../../src/builder/select.js";
import type { BuilderSQL, BuilderReturnType } from "../../../src/builder/return-type.js";

const select = createSelectFn<EcommerceSchema>(() => Promise.resolve([]));

declare const dynStr: string; // non-literal fragment text

// --- F3: non-literal fragment text → accepted, untyped row ({}) ---
const fDyn = createSelectQuery<EcommerceSchema>().from(dynStr).select("o.id", "s0");
type RowDyn = BuilderReturnType<typeof fDyn>;
type _RowDynEmpty = RequireTrue<AssertEqual<RowDyn, {}>>;
// accepted (compiles) by createSelectFn — calling WITHOUT a cast IS the
// assertion. ValidQueryBuilder's allow-unknown path returns B, so this
// type-checks; if it ever stops compiling, the guard is broken. (A cast here
// would make the test pass even if the guard were wrong — so no cast.)
const _accepted = select(fDyn);

// genuinely invalid literal in a FULLY-literal builder IS rejected:
// @ts-expect-error - notacol is not a real column
const _rejected = select(
    createSelectQuery<EcommerceSchema>().from("Network_Order").select("notacol", "s0"),
);

// --- F-C: mixed builder (one dynamic fragment) ---
//   real-table-qualified invalid column IS still rejected:
// @ts-expect-error - Network_Order.notacol invalid (caught by Validate*Part)
const _mixedRejected = select(
    createSelectQuery<EcommerceSchema>()
        .from(dynStr)
        .select("Network_Order.notacol", "s0"),
);
//   alias-qualified invalid column COMPILES (per-fragment validation has no alias scope).
//   NOTE: alias-qualified/bare literals are unprotected in mixed builders by design.
//   No cast — the dynamic where() widens BuilderSQL → allow-unknown, and the
//   alias-qualified select is skipped by per-fragment validation, so this
//   type-checks. Compiling cleanly (no @ts-expect-error) IS the assertion.
const _mixedAccepted = select(
    createSelectQuery<EcommerceSchema>()
        .from("Network_Order o")
        .where(dynStr)
        .select("o.notacol", "s0"),
);
void _mixedAccepted;

// --- F-helper: generic helper preserves full row type ---
function setPeriod<S extends EcommerceSchema, Sql extends AnySqlTag>(
    b: SelectQueryBuilder<S, Sql>,
) {
    return b
        .whereIf(true, "o.orderDate >= :from", "p_from")
        .whereIf(true, "o.orderDate <= :to", "p_to");
}
const helped = setPeriod(
    createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.id", "s0"),
);
const unhelped = createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.id", "s0");
type _HelperRow = RequireTrue<
    AssertEqual<BuilderReturnType<typeof helped>, BuilderReturnType<typeof unhelped>>
>;

// --- F4: two SQL forms differ once params are used ---
const pq = createSelectQuery<EcommerceSchema>()
    .from("Network_Order")
    .where("id = :id")
    .withParams({ id: "x" });
// BuilderSQL keeps the raw :name form (withParams does not feed the tag):
type _BuilderSQLRaw = RequireTrue<
    AssertEqual<BuilderSQL<typeof pq>, "SELECT * FROM Network_Order WHERE id = :id">
>;
```

- [x] **Step 2: Add F4/F4b runtime assertions to `tests/builder/select-runtime.test.ts`**

Append a `describe` block:

```ts
describe("two SQL forms + param regex edges (F4/F4b)", () => {
    it("toString expands :name to $n while BuilderSQL keeps :name", () => {
        const pq = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .where("id = :id")
            .withParams({ id: "x" });
        expect(pq.toString()).toBe("SELECT * FROM Network_Order WHERE id = $1");
    });

    it("does not cross-clobber :te and :text", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .where("a = :te AND b = :text")
            .withParams({ te: 1, text: 2 });
        expect(q.toString()).toBe(
            "SELECT * FROM Network_Order WHERE a = $1 AND b = $2",
        );
        expect([...q.getParams()]).toEqual([1, 2]);
    });

    it("expands the ::cast second colon (intentional parity quirk)", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .select("id::text", "s0")
            .withParams({ text: 9 });
        expect(q.toString()).toBe("SELECT id:$1 FROM Network_Order");
    });
});
```

- [x] **Step 3: Run both test layers**

Run: `npx tsc --noEmit && bun test tests/builder/select-runtime.test.ts`
Expected: exit 0; PASS.

- [x] **Step 4: Commit**

```bash
git add tests/builder/types/validation-edges.test.ts tests/builder/select-runtime.test.ts
git commit -m "test(builder): validation + two-SQL-form + param-regex edges"
```

---

### Task 14: Instantiation-depth benchmark (Risk #2 acceptance) + full suite green

**Files:**
- Test: `tests/builder/types/long-chain.test.ts`

The spec's founding bet is "more performant" on long `setPeriod` + filter-applier compositions with conditional selects. This task is the acceptance benchmark: a representative long chain must type-check without TS2589.

- [x] **Step 1: Write the benchmark chain**

```ts
// tests/builder/types/long-chain.test.ts
import type { RequireTrue, AssertExtends } from "../../fixtures/helpers.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderReturnType } from "../../../src/builder/return-type.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";

declare const dyn: boolean;

// ~12 fluent calls incl. conditional selects, applies, params, ordering.
const big = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .join("JOIN User_ApprovedPayment p ON p.orderId = o.id", "j0")
    .select("o.id", "s_id")
    .select("o.networkId", "s_net")
    .selectIf(dyn, "o.status", "s_status")
    .apply(b => b.where("o.saleAmount > 0", "w_amt"))
    .applyIf(dyn, b => b.select("o.currency", "s_cur"))
    .whereIf(dyn, "o.orderDate >= :from", "w_from")
    .whereIf(dyn, "o.orderDate <= :to", "w_to")
    .groupBy("o.id", "g0")
    .orderBy("o.orderDate", "ord0")
    .limit(50)
    .withParams({ from: "a", to: "b" });

type R = BuilderReturnType<typeof big>;
// Required keys present; conditional keys optional. Spot-check a required one.
type _RHasId = RequireTrue<AssertExtends<R, { id: string }>>;
```

- [x] **Step 2: Run the full type suite + measure**

Run: `npx tsc --noEmit` (optionally `npx tsc --noEmit --extendedDiagnostics` to inspect instantiation count)
Expected: exit 0, **no TS2589**. If TS2589 appears, apply the spec's escalation path: keep the `Sql` tag flat, ensure `BuildSQL` is only invoked inside `BuilderSQL`/`BuilderReturnType` (never per method), and if still failing, reintroduce a *minimal* per-clause cache only for the offending clause (spec "Escalation path") — do NOT revert to a parallel `State` tree.

- [x] **Step 3: Run the entire test command**

Run: `npm test`
Expected: `tsc --noEmit` exit 0 AND all `bun test` suites pass.

- [x] **Step 4: Verify a clean build one more time**

Run: `npm run build`
Expected: exit 0; `dist/` populated.

- [x] **Step 5: Commit**

```bash
git add tests/builder/types/long-chain.test.ts
git commit -m "test(builder): long-chain instantiation-depth acceptance benchmark"
```

---

## Phase 8 — Real-world acceptance & `untypedSelect` elimination

This phase is the proof the rewrite achieves its goal. It ports actual production
query chains (verbatim from the monorepo sources listed at the top) into the test
suite and demonstrates the generic-helper case that forced the old library into
`untypedSelect`/`untypedSetPeriod` now stays **fully typed**.

> **Cross-repo rule:** do NOT add the monorepo as a dependency. Copy the query
> chains as literal source into the test files, and define a local fixture schema
> capturing only the tables they touch. The chains must be copied **byte-for-byte**
> (whitespace included) so the recorded SQL is the real production output.

### Task 15: Reporting fixture schema + real query chains as acceptance tests

**Files:**
- Create: `tests/fixtures/reporting-schema.ts`
- Create: `tests/builder/acceptance/reporting-invoices.test.ts`
- Create: `tests/builder/acceptance/reporting-payments-summary.test.ts`

- [ ] **Step 1: Create the fixture schema**

Minimal `ReportingSchema` capturing the two tables the chosen chains touch. Column types match the monorepo's `Revolut_PaymentDraft` / `Revolut_PaymentInvoice` shapes (sourced from `packages/common/src/db/main/tableTypes.ts`; field aliases resolved to primitives). Nullable columns use `| null`.

```ts
// tests/fixtures/reporting-schema.ts
export type ReportingSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            Revolut_PaymentDraft: {
                id: string;
                userId: string;
                amount: number;
                currency: string;
                status: string;
                createdAt: string;
                revolutDraftId: string | null;
                reference: string | null;
                transactionId: string | null;
                metadata: string | null;
                vat: number;
                teamId: string | null;
            };
            Revolut_PaymentInvoice: {
                id: string;
                paymentId: string;
                createdAt: string;
                status: string;
                amount: number;
                vat: number;
                userId: string;
                data: string | null;
                s3key: string | null;
                currency: string;
                teamId: string | null;
            };
        };
    };
};
```

- [ ] **Step 2: Write the invoices acceptance test (failing)**

Copy the chain from `team/invoices.ts:66-90` verbatim, substituting the local schema + a local `setPeriod`. (Task 16 provides the real ported `setPeriod`; until then, import it from Task 16's module — sequence Task 16 first if executing strictly, or stub the helper inline. The plan orders 15 before 16 for narrative; the executor may swap them.)

```ts
// tests/builder/acceptance/reporting-invoices.test.ts
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/index.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js"; // Task 16
import type { ReportingSchema } from "../../fixtures/reporting-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

const limit = 50;
const offset = 0;
const period = "month" as const;
const start = "2026-01-01";
const end = "2026-01-31";

// --- Copied verbatim from reporting-v2/src/controller/team/invoices.ts ---
const b = createSelectQuery<ReportingSchema>()
    .withParams({ teamId: "t1", start, end })
    .from(`"Revolut_PaymentInvoice" i`)
    .select([
        `i.id`,
        `i.amount`,
        `i.vat`,
        `i.currency`,
        `i."createdAt"`,
    ])
    .where(`i."status" = 'active'`)
    .where(`i."teamId" = :teamId`)
    .orderBy(`i."createdAt" desc`)
    .limit(limit)
    .offset(offset)
    .applyIf(!!period, (b) => setPeriod(b, period!, `i."createdAt"`, "YYYY-MM-DD"))
    .whereIf(!period && !!start, `i."createdAt" >= :start`)
    .whereIf(!period && !!end, `i."createdAt" <= :end`);
// -------------------------------------------------------------------------

describe("reporting team/invoices chain", () => {
    it("assembles to the recorded production SQL", () => {
        // RECORD-THEN-ASSERT: on first run, console.log the line below, paste
        // the output as `expected`, then keep it as a golden assertion.
        const expected =
            `SELECT i.id, i.amount, i.vat, i.currency, i."createdAt" ` +
            `FROM "Revolut_PaymentInvoice" i ` +
            `WHERE i."status" = 'active' AND i."teamId" = $1 ` +
            `AND i."createdAt" between '2026-01-01' and '2026-01-31' ` +
            `ORDER BY i."createdAt" desc LIMIT 50 OFFSET 0`;
        expect(normalizeWhitespace(b.toString())).toBe(normalizeWhitespace(expected));
    });

    it("orders params by first appearance", () => {
        expect([...b.getParams()]).toEqual(["t1"]); // start/end only used inside setPeriod's literal range here
    });
});

// Type-level: the inferred row carries the selected columns (the win — the old
// library degraded this to `any` once setPeriod was applied).
type Row = SelectBuilderResult<typeof b>;
type _Row = RequireTrue<
    AssertExtends<
        Row,
        { id: string; amount: number; vat: number; currency: string; createdAt: string }
    >
>;
```

> **Record-then-assert (important):** the `expected` SQL above is the plan author's best reconstruction. The executor MUST verify it by running `console.log(b.toString())` once and reconciling. If `setPeriod`'s `whereIf` placement differs (it appends WHERE fragments, which `assembleSelectSQL` emits after the SELECT/FROM but the chain calls `.orderBy`/`.limit` before `.applyIf`), the recorded order is what assembly produces — fix the `expected` literal, never the assembler, unless assembly diverges from OLD (compare against OLD `assemble-select-sql.ts`).

- [ ] **Step 3: Write the payments-summary acceptance test (failing)**

Copy the chain from `my/payments-summary.ts:68-128` verbatim (with a fixed `convertToCurrency = "EUR"`). Assert: (a) it compiles under `createSelectFn` (acceptance), (b) inferred row matches the declared `PaymentsSummary & { paymentIds }`, (c) recorded SQL via `normalizeWhitespace`.

```ts
// tests/builder/acceptance/reporting-payments-summary.test.ts
import { describe, it, expect } from "bun:test";
import { createSelectQuery, createSelectFn, normalizeWhitespace } from "../../../src/builder/index.js";
import type { ReportingSchema } from "../../fixtures/reporting-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

const convertToCurrency = "EUR";
const userId = "u1";
const startDate = "2026-01-01";
const endDate = "2026-01-31";

const q = createSelectQuery<ReportingSchema>()
    .withParams({ userId, start: startDate || "", end: endDate || "" })
    .from(`"Revolut_PaymentDraft" p`)
    .select(`array_agg(p."id")::text[] as "paymentIds"`)
    .select(`sum(convert_currency(p."amount"::numeric, p."currency", '${convertToCurrency}'::text, p."createdAt"::date))::float8 as "total"`)
    .select(`sum(convert_currency(p."amount"::numeric, p."currency", '${convertToCurrency}'::text, p."createdAt"::date))::float8 as "amount"`)
    .select(`sum(convert_currency(p."vat"::numeric, p."currency", '${convertToCurrency}'::text, p."createdAt"::date))::float8 as "vat"`)
    .selectIf(!!convertToCurrency, `'${convertToCurrency}'::text as "currency"`)
    .selectIf(!convertToCurrency, "p.currency")
    .whereIf(!!startDate && !!endDate, `p."createdAt" between :start and :end`)
    .whereIf(!!startDate && !endDate, `p."createdAt" >= :start`)
    .whereIf(!startDate && !!endDate, `p."createdAt" <= :end`)
    .where(`p."userId" = :userId`)
    .where(`p."status" = 'COMPLETED'`);

describe("reporting my/payments-summary chain", () => {
    it("is accepted by createSelectFn and assembles to recorded SQL", async () => {
        const select = createSelectFn<ReportingSchema>((sql) => {
            // RECORD-THEN-ASSERT: paste the normalized sql below on first run.
            expect(normalizeWhitespace(sql)).toContain(`FROM "Revolut_PaymentDraft" p`);
            return Promise.resolve([]);
        });
        // No cast: `select(q)` type-checking IS the acceptance assertion. If it
        // does NOT compile, that is a real ValidateSQL/core gap on one of the
        // expression selects (e.g. convert_currency / ::float8 / array_agg) —
        // record it as a core follow-up (per the expression-key note); do NOT
        // re-add a cast to force it green.
        await select(q);
        expect(q.getParams().length).toBeGreaterThan(0);
    });
});

// Type-level: paymentIds + numeric aggregates + currency present.
// `currency` comes from two mutually-exclusive selectIf calls → optional (documented:
// both producers conditional). total/amount/vat/paymentIds are unconditional → required.
type Row = SelectBuilderResult<typeof q>;
type _Required = RequireTrue<
    AssertExtends<Row, { paymentIds: string[]; total: number; amount: number; vat: number }>
>;
type _CurrencyOptional = RequireTrue<
    AssertExtends<{ currency?: string }, Pick<Row, "currency">>
>;
```

> **Expression-key note:** `array_agg(...)::text[] as "paymentIds"` must infer `paymentIds: string[]`, `...::float8 as "total"` must infer `total: number`. These depend on the core's `GetReturnType` cast/alias handling. If the core does not yet resolve `::text[]`→`string[]` or `::float8`→`number`, that is a **core** gap surfaced by this acceptance test — record it and either (a) loosen the assertion to `AssertExtends<Row, { paymentIds: unknown }>` with a TODO referencing the core gap, or (b) file it as a core follow-up. Do not weaken silently.

- [ ] **Step 4: Run and reconcile**

Run: `npx tsc --noEmit && bun test tests/builder/acceptance`
Expected: after record-then-assert reconciliation, exit 0 + PASS. The type assertions are the acceptance bar; SQL golden strings are secondary.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/reporting-schema.ts tests/builder/acceptance/
git commit -m "test(builder): real reporting-v2 query chains as acceptance fixtures"
```

---

### Task 16: Port `setPeriod` to the two-generic form — prove `untypedSetPeriod` is obsolete

**Files:**
- Create: `src/builder/testing/setPeriod.ts` (the migrated helper, kept in-repo as a reference impl + test dependency)
- Test: `tests/builder/types/generic-helper-acceptance.test.ts`

This is the headline acceptance: the monorepo's `setQueryBuilderPeriod.ts` needed BOTH a typed `setPeriod<Schema, State, Sql, Field>` AND an `untypedSetPeriod<Result>` fallback, because the old typed helper could not be applied to an arbitrarily-accumulated builder without collapsing its row type. Under the new single `Sql` tag, ONE helper with two generics (`<Schema, Sql extends AnySqlTag>`) works everywhere and preserves the row type — so `untypedSetPeriod` has no reason to exist.

- [ ] **Step 1: Write the migrated helper**

```ts
// src/builder/testing/setPeriod.ts
// Reference port of monorepo packages/common/src/lib/sql/setQueryBuilderPeriod.ts,
// migrated to the new two-generic builder. NOTE: drops the third `State` generic
// and the AnyBuilderStateTag/AnyBuilderSqlTag imports; uses the new AnySqlTag.
import type { DatabaseSchema } from "../../schema.js";
import type { SelectQueryBuilder } from "../select.js";
import type { AnySqlTag } from "../sql-tag.js";

// Minimal stand-in for the monorepo's getPeriodRange (range computed by caller in tests).
export function setPeriod<S extends DatabaseSchema, Sql extends AnySqlTag>(
    b: SelectQueryBuilder<S, Sql>,
    period: string,
    field: string,
    _format: string = "YYYY-MM-DD",
) {
    // In production, [start, end] = getPeriodRange(period, format). For the
    // reference port the range is encoded as literals to keep output stable.
    const start = "2026-01-01";
    const end = "2026-01-31";
    return b
        .whereIf(!!start && !!end, `${field} between '${start}' and '${end}'`)
        .whereIf(!!start && !end, `${field} >= '${start}'`)
        .whereIf(!start && !!end, `${field} <= '${end}'`);
}
```

> The whereIf fragments project no columns, so the returned builder's row type is the caller's unchanged. There is intentionally **no** `untypedSetPeriod` counterpart and **no** `as SelectQueryBuilder<any, any>` cast — that absence is the point.

- [ ] **Step 2: Write the acceptance test (failing)**

```ts
// tests/builder/types/generic-helper-acceptance.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderReturnType } from "../../../src/builder/return-type.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingSchema } from "../../fixtures/reporting-schema.js";

declare const period: boolean;

// Build a real, accumulated builder, then push it through the generic helper
// directly AND via applyIf — both must preserve the full row type.
const baseBuilder = createSelectQuery<ReportingSchema>()
    .from(`"Revolut_PaymentInvoice" i`)
    .select(`i.id`, "s_id")
    .select(`i.amount`, "s_amt")
    .where(`i."status" = 'active'`);

const viaDirect = setPeriod(baseBuilder, "month", `i."createdAt"`);
const viaApplyIf = baseBuilder.applyIf(period, (b) =>
    setPeriod(b, "month", `i."createdAt"`),
);

type RowBase = BuilderReturnType<typeof baseBuilder>;
type RowDirect = BuilderReturnType<typeof viaDirect>;
type RowApplyIf = BuilderReturnType<typeof viaApplyIf>;

// THE ACCEPTANCE: the helper does NOT collapse the row type to {} or any.
// (Old library: this required untypedSetPeriod because the typed path lost it.)
type _Direct = RequireTrue<AssertEqual<RowDirect, RowBase>>;
type _ApplyIf = RequireTrue<AssertEqual<RowApplyIf, RowBase>>;

// And the row is the real shape, not `any`/`{}`.
type _Shape = RequireTrue<AssertEqual<RowBase["id"], string>>;
type _Shape2 = RequireTrue<AssertEqual<RowBase["amount"], number>>;
```

- [ ] **Step 3: Run tsc to verify**

Run: `npx tsc --noEmit`
Expected: exit 0. `_Direct`/`_ApplyIf` resolving to `true` is the headline proof. If either collapses (row becomes `{}` or `any`), the `Sql`-tag threading through `whereIf`/`applyIf` is broken — debug against spec "Generic builder helpers" before touching tests.

- [ ] **Step 4: Commit**

```bash
git add src/builder/testing/setPeriod.ts tests/builder/types/generic-helper-acceptance.test.ts
git commit -m "test(builder): generic helper preserves row type — untypedSetPeriod obsolete"
```

---

## Self-Review (run before declaring complete)

Per `superpowers:verification-before-completion`, run `npm test` and `npm run build` and confirm exit 0 with output evidence before claiming done.

**Spec coverage check** (each spec item → task):
- Condition tree (`createConditionTree`, `.add/.remove/.when/.toString/.getState`) → Task 5
- SELECT builder full fluent + `*If` + `removeSelect/removeJoin` + `withParams` + `apply/applyIf` + `getParams/toString/toBrandedString` → Task 8
- `assembleSelectSQL` exported → Tasks 4, 11
- `createSelectFn` + string & builder overloads + `:name`→`$n` + `MergeOverrides` → Task 9
- Conditional SQL (`createConditionalQuery`, `conditionalSQL`, `processConditionalSQL`, `processParams`, `normalizeWhitespace`, `withConditions`) → Task 10
- Build tooling (`tsconfig.build.json`, scripts) → Task 1
- SQL-string reduction architecture (lean `Sql` tag, `BuildSQL`, `BuilderSQL`/`BuilderReturnType` partition) → Tasks 6, 7
- Conditional typing (selectIf/applyIf optionalize; required iff in ReqSQL; order-independence; default-`*`; removeSelect rewrite; id reuse; differently-typed alias) → Tasks 7, 12
- `ValidQueryBuilder` per-fragment + allow-unknown; `FragmentErrors`; documented mixed-builder weakness → Tasks 9, 13
- Two canonical SQL forms (`BuilderSQL` raw `:name` vs `toString` `$n`) → Tasks 8, 13
- Param regex edges (`:te`/`:text`, `::cast`) → Tasks 2, 13
- `from(parameterized-subquery)` throws; param-free embeds → Task 8
- Generic helpers (`setPeriod`, `AnySqlTag`) → Tasks 13, 16
- Module layout & re-exports; `src/index.ts` value exports → Task 11
- Risk #2 depth acceptance benchmark → Task 14
- Real production query chains as acceptance tests → Task 15
- **`untypedSelect`/`untypedSetPeriod` elimination** (the headline goal: generic helper preserves the row type through `applyIf`, no untyped fallback) → Task 16

**Breaking-change scope (spec Compatibility caveat):** the plan deliberately ships NO untyped builder, NO `SelectQueryBuilder` third generic (two generics `<Schema, Sql>`), NO `AnyBuilderSqlTag`/`AnyBuilderStateTag` (replaced by `AnySqlTag`), NO `QueryResult` re-export from the builder (core still exports its own `QueryResult`). These are accepted breaks, not omissions.

**Out-of-scope confirmation:** no `createUntypedQuery`/`UntypedSelectBuilder`, no `common/ast.ts`, no old `State`-tree machinery, no AST exports — none appear in any task. ✔
