# Multi-row VALUES Inserts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type multi-row `INSERT … VALUES (…), (…)` params per tuple in the raw typed path, and add a `.rows(array)` bulk API to the insert builder.

**Architecture:** Raw path: replace the `__error` arm in `InsertParams` with a quote/dollar-quote/paren-aware tuple collector (`CollectTuples`) that feeds each tuple body through the existing `ZipInsert`, intersecting results; tuple cap 12 / 400 steps per tuple, overrun degrades to the loose `DriverParamValue` sweep (never an error). Builder: `.rows()` stores row objects in runtime state, emits deterministic synthetic named params (`:__tsqlrow_<r>_<c>`) so the existing scanner provides `$N` numbering and param ordering for free; precise typing resolves the `.into()` table to its schema row type and enforces key-subset + homogeneous key sets.

**Spec:** `docs/superpowers/specs/2026-06-12-multi-row-values-design.md`

**One deviation from the spec (simpler, equivalent):** the spec said `InsertTag` gains a `rows` member and `BuildInsertSQL` renders a rows form. Not needed: `.rows()` leaves the tag unchanged; with `values: []` the existing `BuildInsertValuesSQL` already renders `insert into <t> () values ()…`, which extracts `{}` for the values and still types `onConflict`/`returning` correctly. Also, `.rows()` validates eagerly (fail-fast at call time) — a superset of the spec's assemble-time throws; assemble re-validates via the same helper.

**Tech Stack:** TypeScript type-level programming (template-literal types, chunked walkers), Bun test runner, `npm run typecheck` (tsc, 8 GB heap), `npm run perf` budget gate.

**Repo rules that bind every task:**
- Never run `tsc` on a standalone probe file — always the project-wide `npm run typecheck`.
- Per-char type walks must be step-capped well under 1000 and degrade leniently (widen, never error) on overrun.
- Lenient-parsing contract: never reject valid SQL; precision may degrade, validation may not tighten.

---

### Task 1: Raw path — per-tuple param typing in `ExtractParams`

**Files:**
- Modify: `src/builder/extract-params.ts` (the `IsMultiRowInsert` / `InsertParams` block, lines ~64–108)
- Test: `tests/builder/types/extract-params.test.ts` (MR pins, lines ~110–142)
- Test: `tests/builder/types/createsql.test.ts` (lines 13–15)

- [ ] **Step 1: Flip and extend the type pins (failing first)**

In `tests/builder/types/extract-params.test.ts`, replace the `MR1` and `MR4` blocks (keep `MR2`, `MR3`, `MR5`, `MR6`, `MR7` exactly as they are) and append the new pins:

```ts
// multi-row INSERT → params typed per tuple (each tuple zipped against the column list)
type MR1 = ExtractParams<
    "insert into orders (userId, amount) values (:a, 1), (:b, 2)", WriteSchema>;
type _MR1 = RequireTrue<AssertEqual<MR1, { a: User_id; b: User_id }>>;
```

```ts
// Multi-line `),\n(` (newline collapses to a space) is multi-row, typed per tuple
type MR4 = ExtractParams<
    "insert into orders (userId, amount)\nvalues (:a, 1),\n(:b, 2)", WriteSchema>;
type _MR4 = RequireTrue<AssertEqual<MR4, { a: User_id; b: User_id }>>;
```

Append after `_MR7`:

```ts
// every position of every tuple gets its column's type
type MR8 = ExtractParams<
    "insert into orders (userId, amount) values (:u1, :a1), (:u2, :a2)", WriteSchema>;
type _MR8 = RequireTrue<AssertEqual<MR8, { u1: User_id; a1: number; u2: User_id; a2: number }>>;

// trailing ON CONFLICT / WHERE params keep their precise types alongside the tuples
type MR9 = ExtractParams<
    "insert into orders (id, amount) values (:i1, 1), (:i2, 2) on conflict (id) do update set amount = :amt where orders.id = :oid",
    WriteSchema>;
type _MR9 = RequireTrue<AssertEqual<MR9, { i1: Order_id; i2: Order_id; amt: number; oid: Order_id }>>;

// tuple cap (12): tuples beyond it degrade to loose DriverParamValue (never an error)
type MR10 = ExtractParams<
    "insert into orders (userId, amount) values (:p1,1),(:p2,1),(:p3,1),(:p4,1),(:p5,1),(:p6,1),(:p7,1),(:p8,1),(:p9,1),(:p10,1),(:p11,1),(:p12,1),(:p13,1)",
    WriteSchema>;
type _MR10 = RequireTrue<AssertEqual<MR10, {
    p1: User_id; p2: User_id; p3: User_id; p4: User_id; p5: User_id; p6: User_id;
    p7: User_id; p8: User_id; p9: User_id; p10: User_id; p11: User_id; p12: User_id;
    p13: unknown;
}>>;

// no-space `values(` form is detected and typed per tuple too
type MR11 = ExtractParams<
    "insert into orders (userId, amount) values(:a, 1), (:b, 2)", WriteSchema>;
type _MR11 = RequireTrue<AssertEqual<MR11, { a: User_id; b: User_id }>>;

// a string literal inside a tuple of a MULTI-row insert does not break tuple boundaries
type MR12 = ExtractParams<
    "insert into orders (userId, note) values (:a, 'x'), (:b, 'y')", WriteSchema>;
type _MR12 = RequireTrue<AssertEqual<MR12, { a: User_id; b: User_id }>>;
```

In `tests/builder/types/createsql.test.ts`, change the import line to also bring `asUserId`:

```ts
import { asOrderId, asUserId } from "../fixtures/write-schema.js";
```

and replace lines 13–15 with:

```ts
// multi-row INSERT params are typed per tuple
sql("insert into orders (userId, amount) values (:a, 1), (:b, 2)")
    .withParams({ a: asUserId("u1"), b: asUserId("u2") });
// @ts-expect-error plain string is not User_id (param in the SECOND tuple)
sql("insert into orders (userId, amount) values (:a, 1), (:b, 2)")
    .withParams({ a: asUserId("u1"), b: "u2" });
```

- [ ] **Step 2: Run typecheck to verify the new pins fail**

Run: `npm run typecheck 2>&1 | grep -E "extract-params|createsql" | head -20`
Expected: TS2344 errors on `_MR1`, `_MR4`, `_MR8`–`_MR12` (ExtractParams currently returns the `__error` object), and an unused-`@ts-expect-error` error in `createsql.test.ts` for the now-valid first call. The rest of the project must show no NEW errors.

- [ ] **Step 3: Implement the tuple collector and rewire `InsertParams`**

In `src/builder/extract-params.ts`, replace the whole block from the `// ---- multi-row VALUES detection (spec §3) ----` comment through the existing `InsertParams` definition (keep `HasTopLevelTupleSep` and `AfterTupleIsComma` — they remain the cheap detector) with:

```ts
// ---- multi-row VALUES detection (spec §3) ----
// Post-VALUES text, handling both ` values (` and the no-space ` values(` form
// (the latter re-prepends the consumed "(" so the collector sees the tuple open).
type AfterValues<N extends string> =
    N extends `${string} values ${infer A}` ? A
    : N extends `${string} values(${infer A}` ? `(${A}`
    : never;

type IsMultiRowInsert<N extends string> =
    AfterValues<N> extends infer A extends string ? HasTopLevelTupleSep<A> : false;
```

(`HasTopLevelTupleSep` / `AfterTupleIsComma` stay byte-for-byte as they are today.)

Then, directly below `AfterTupleIsComma`, add the collector and the multi-row params type:

```ts
// ---- multi-row VALUES per-tuple param typing ----
type TupleScan = { tuples: readonly string[]; rest: string };

// Collect each top-level `(...)` tuple body from the post-VALUES text. Mirrors
// HasTopLevelTupleSep's quote/dollar-quote/paren arms, but ACCUMULATES the
// current tuple's text (Cur) and the finished bodies (Ts). At depth 0 between
// tuples, chars are skipped; a closed tuple followed by anything but a comma
// ends the list cleanly (trailing ON CONFLICT / RETURNING — their params are
// typed by the conflict/WHERE extractors, so `rest` stays "" and is NOT
// loose-swept). On step-cap or tuple-cap overrun the unconsumed text comes
// back in `rest` for a loose sweep — lenient-overrun contract, never an error.
// Steps reset per tuple via AfterTuple (bounded worker, fresh counter), so the
// budget is 400 steps per tuple × max 12 tuples.
type CollectTuples<
    S extends string, Depth extends any[] = [], Cur extends string = "",
    Ts extends readonly string[] = [], Steps extends any[] = [],
> = Steps["length"] extends 400 ? { tuples: Ts; rest: S }
    : Ts["length"] extends 12 ? { tuples: Ts; rest: S }
    // single-quoted literal: `''` escape first, then a whole literal (verbatim into Cur)
    : S extends `''${infer R}` ? CollectTuples<R, Depth, `${Cur}''`, Ts, [any, ...Steps]>
    : S extends `'${infer Q}'${infer R}` ? CollectTuples<R, Depth, `${Cur}'${Q}'`, Ts, [any, ...Steps]>
    // dollar-quoted string: `$tag$ … $tag$`; unterminated → stop, rest loose
    : S extends `$${infer Tag}$${infer Rest2}`
        ? Rest2 extends `${infer Body}$${Tag}$${infer After}`
            ? CollectTuples<After, Depth, `${Cur}$${Tag}$${Body}$${Tag}$`, Ts, [any, ...Steps]>
            : { tuples: Ts; rest: S }
    : S extends `(${infer R}`
        ? Depth extends [] ? CollectTuples<R, [any], "", Ts, [any, ...Steps]>
        : CollectTuples<R, [any, ...Depth], `${Cur}(`, Ts, [any, ...Steps]>
    : S extends `)${infer R}`
        ? Depth extends [any] ? AfterTuple<R, [...Ts, Cur]>
        : Depth extends [any, ...infer D extends any[]]
            ? CollectTuples<R, D, `${Cur})`, Ts, [any, ...Steps]>
            : { tuples: Ts; rest: "" }              // stray ")" at depth 0 — stop clean
    : S extends `${infer C}${infer R}`
        ? Depth extends [] ? CollectTuples<R, [], "", Ts, [any, ...Steps]>   // between tuples: skip
        : CollectTuples<R, Depth, `${Cur}${C}`, Ts, [any, ...Steps]>
    : { tuples: Ts; rest: "" };

// After a closed tuple: a comma (after optional whitespace) starts the next
// tuple — with a FRESH step counter; anything else ends the list cleanly.
type AfterTuple<S extends string, Ts extends readonly string[]> =
    S extends `${" " | "\t" | "\n"}${infer R}` ? AfterTuple<R, Ts>
    : S extends `,${infer R}` ? CollectTuples<R, [], "", Ts>
    : { tuples: Ts; rest: "" };

// Intersect ZipInsert over every collected tuple — each tuple's i-th value
// binds to the i-th column, exactly like the single-row path.
type ZipAllTuples<
    Ts extends readonly string[], Cols extends readonly string[],
    Table extends string, S extends DatabaseSchema, Acc = {},
> = Ts extends readonly [infer H extends string, ...infer R extends readonly string[]]
    ? ZipAllTuples<R, Cols, Table, S, Acc & ZipInsert<Cols, SplitCommaSimple<H>, Table, S>>
    : Acc;

type MultiRowValuesParams<N extends string, Table extends string, S extends DatabaseSchema> =
    AfterValues<N> extends infer A extends string
        ? CollectTuples<A> extends infer R extends TupleScan
            ? ZipAllTuples<R["tuples"], ExtractInsertColumns<N>, Table, S>
                & (R["rest"] extends "" ? {} : LooseParamsSkipLit<R["rest"]>)
            : {}
        : {};

type InsertParams<N extends string, S extends DatabaseSchema> =
    InsertTargetTable<N, S> extends infer Table extends string
        ? (IsMultiRowInsert<N> extends true
            ? MultiRowValuesParams<N, Table, S>
            : ZipInsert<ExtractInsertColumns<N>, ExtractInsertValues<N>, Table, S>)
            & SetParams<SplitTopLevel<ConflictSetBlock<N>>, Table, S>
            & WhereParamsFor<N, Table, S>
        : {};
```

This **deletes** the `{ __error: true; message: "[SQL Error] multi-row VALUES not supported …" }` type — it has no other references in `src/` (verified; the `__error` in `db.ts` is the unrelated `MergeOverrides`).

- [ ] **Step 4: Run typecheck twice and the runtime suite**

Run: `npm run typecheck` (twice — boolean results must be deterministic)
Expected: exit 0 both times, no errors anywhere.
Run: `bun test`
Expected: all pass (442+/0 — no runtime change in this task, but the suite guards against accidental import breakage).

- [ ] **Step 5: Commit**

```bash
git add src/builder/extract-params.ts tests/builder/types/extract-params.test.ts tests/builder/types/createsql.test.ts
git commit -m "feat(types): multi-row VALUES params typed per tuple (drop the __error rejection)"
```

---

### Task 2: Builder runtime — `.rows(array)`

**Files:**
- Modify: `src/builder/write-state.ts` (RuntimeInsertState)
- Modify: `src/builder/write-assemble.ts` (new helper + assembleInsertSQL branch)
- Modify: `src/builder/insert.ts` (interface method + impl)
- Test: `tests/builder/insert-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

Append to `tests/builder/insert-runtime.test.ts` (the file already imports `createInsertQuery`, `WriteSchema`, `asUserId`, `asOrderId`):

```ts
describe("createInsertQuery .rows()", () => {
    it("expands rows to sequential placeholders", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .rows([
                { userId: asUserId("u1"), amount: 100 },
                { userId: asUserId("u2"), amount: 250 },
            ])
            .returning("id")
            .withParams({});   // getParams lives on BoundWrite, not the unbound builder
        expect(q.toString()).toBe(
            "insert into orders (userId, amount) values ($1, $2), ($3, $4) returning id");
        expect([...q.getParams()]).toEqual(["u1", 100, "u2", 250]);
    });

    it("keeps a single row working", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .rows([{ userId: asUserId("u1"), amount: 5 }])
            .withParams({});
        expect(q.toString()).toBe("insert into orders (userId, amount) values ($1, $2)");
        expect([...q.getParams()]).toEqual(["u1", 5]);
    });

    it("orders onConflict params after the row values", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .rows([
                { id: asOrderId("o1"), amount: 1 },
                { id: asOrderId("o2"), amount: 2 },
            ])
            .onConflict("(id) do update set amount = :amt")
            .withParams({ amt: 9 });
        expect(q.toString()).toBe(
            "insert into orders (id, amount) values ($1, $2), ($3, $4) on conflict (id) do update set amount = $5");
        expect([...q.getParams()]).toEqual(["o1", 1, "o2", 2, 9]);
    });

    it("passes array/JSON column values through as single params", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("products")
            .rows([{ name: "p", tags: ["a", "b"], meta: { sku: "s" } }])
            .withParams({});
        expect(q.toString()).toBe(
            "insert into products (name, tags, meta) values ($1, $2, $3)");
        expect([...q.getParams()]).toEqual(["p", ["a", "b"], { sku: "s" }]);
    });

    it("throws on an empty rows array", () => {
        expect(() => createInsertQuery<WriteSchema>().into("orders").rows([]))
            .toThrow("at least one row");
    });

    it("throws when a later row misses a column of the first row", () => {
        expect(() => createInsertQuery<WriteSchema>().into("orders").rows([
            { userId: asUserId("u1"), amount: 1 },
            { userId: asUserId("u2") },
        ] as any)).toThrow('missing column "amount"');
    });

    it("throws when a later row has a column the first row lacks", () => {
        expect(() => createInsertQuery<WriteSchema>().into("orders").rows([
            { userId: asUserId("u1") },
            { userId: asUserId("u2"), amount: 2 },
        ] as any)).toThrow("not present in the first row");
    });

    it("throws when combined with .value()", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("userId", ":uid")
            .rows([{ amount: 1 }])
            .withParams({ uid: asUserId("u1") });
        expect(() => q.toString()).toThrow("cannot be combined");
    });
});
```

(The two hetero-key arrays carry `as any` because Task 3's homogeneity guard will reject them at compile time — they exist to pin the runtime throw.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/builder/insert-runtime.test.ts`
Expected: FAIL — `.rows is not a function`.

- [ ] **Step 3: Implement runtime support**

`src/builder/write-state.ts` — add to `RuntimeInsertState` (after `fromSelect`):

```ts
    // Multi-row VALUES form: row objects whose keys (taken from the FIRST row,
    // insertion order) become the column list. When set, `values`/`fromSelect`
    // must be empty (assembleInsertSQL throws otherwise).
    readonly rows?: ReadonlyArray<Record<string, DriverParamValue>>;
```

`src/builder/write-assemble.ts` — import `DriverParamValue`:

```ts
import type { DriverParamValue } from "./scanner.js";
```

add the exported helper (above `assembleInsertSQL`):

```ts
// Shared by InsertImpl.rows() (eager validation + synthetic params) and
// assembleInsertSQL (SQL text). Synthetic names are deterministic
// (`__tsqlrow_<row>_<col>`), so both call sites agree without shared state.
export function buildRowsClause(
    rows: ReadonlyArray<Record<string, DriverParamValue>>,
): { colsText: string; valuesText: string; params: Record<string, DriverParamValue> } {
    if (rows.length === 0) {
        throw new Error("INSERT .rows() requires at least one row");
    }
    const cols = Object.keys(rows[0]);
    if (cols.length === 0) {
        throw new Error("INSERT .rows() rows must have at least one column");
    }
    const params: Record<string, DriverParamValue> = {};
    const tuples = rows.map((row, r) => {
        for (const k of Object.keys(row)) {
            if (!cols.includes(k)) {
                throw new Error(
                    `INSERT .rows() row ${r} has column "${k}" not present in the first row`);
            }
        }
        const cells = cols.map((col, c) => {
            if (!(col in row)) {
                throw new Error(`INSERT .rows() row ${r} is missing column "${col}"`);
            }
            const name = `__tsqlrow_${r}_${c}`;
            params[name] = row[col];
            return `:${name}`;
        });
        return `(${cells.join(", ")})`;
    });
    return { colsText: cols.join(", "), valuesText: tuples.join(", "), params };
}
```

and add the rows branch at the TOP of `assembleInsertSQL` (before the `fromSelect` branch):

```ts
    if (s.rows) {
        if (s.values.length > 0 || s.fromSelect) {
            throw new Error(
                "INSERT .rows() cannot be combined with .value()/.valueIf() or .fromSelect()");
        }
        const { colsText, valuesText } = buildRowsClause(s.rows);
        let sql = `insert into ${s.table} (${colsText}) values ${valuesText}`;
        if (s.conflict) sql += ` on conflict ${s.conflict}`;
        if (s.returning) sql += ` returning ${s.returning}`;
        return sql;
    }
```

`src/builder/insert.ts` — import the helper:

```ts
import { assembleInsertSQL, buildRowsClause } from "./write-assemble.js";
```

add to the `InsertQueryBuilder` interface (after `valueIf`; this is the loose Task-2 signature, tightened in Task 3):

```ts
    rows(rows: ReadonlyArray<Record<string, DriverParamValue>>): InsertQueryBuilder<S, T>;
```

add to `InsertImpl` (after `valueIf`):

```ts
    rows(rows: ReadonlyArray<Record<string, DriverParamValue>>): any {
        // Validates eagerly (fail fast) and stores the synthetic per-cell params;
        // assembleInsertSQL re-derives the same names from state.rows.
        const { params } = buildRowsClause(rows);
        return this.next({
            ...this.st, rows,
            namedParams: { ...this.st.namedParams, ...params },
        });
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/builder/insert-runtime.test.ts`
Expected: PASS, including all pre-existing tests in the file.

- [ ] **Step 5: Full runtime suite + typecheck**

Run: `bun test` — expected: all pass.
Run: `npm run typecheck` — expected: exit 0 (the loose signature compiles; tests that need `getParams` bind first via `withParams({})` — the unbound builder interface only exposes `toString`).

- [ ] **Step 6: Commit**

```bash
git add src/builder/write-state.ts src/builder/write-assemble.ts src/builder/insert.ts tests/builder/insert-runtime.test.ts
git commit -m "feat(builder): .rows() multi-row INSERT (runtime expansion via synthetic scanner params)"
```

---

### Task 3: Builder — precise schema typing for `.rows()`

**Files:**
- Modify: `src/builder/insert.ts` (replace the loose `rows` signature; add helper types)
- Test: `tests/builder/insert-runtime.test.ts` (compile-time pins)

- [ ] **Step 1: Write the failing compile-time pins**

Append to `tests/builder/insert-runtime.test.ts` (top level, outside `describe`; the arrow is never invoked, so nothing executes under bun — same pattern as `@ts-expect-error` pins elsewhere):

```ts
// ---- compile-time pins for .rows() (never executed) ----
const _rowsTypePins = () => {
    const b = createInsertQuery<WriteSchema>().into("orders");
    // ok: subset of columns, branded values, nullable column accepts null
    b.rows([{ userId: asUserId("u1"), note: null }]);
    // @ts-expect-error plain string is not User_id
    b.rows([{ userId: "plain", amount: 1 }]);
    // @ts-expect-error unknown column key
    b.rows([{ bogus: 1 }]);
    // @ts-expect-error heterogeneous rows — second row misses `amount`
    b.rows([{ userId: asUserId("u1"), amount: 1 }, { userId: asUserId("u2") }]);
};
void _rowsTypePins;
```

- [ ] **Step 2: Run typecheck to verify the pins fail**

Run: `npm run typecheck 2>&1 | grep "insert-runtime" | head`
Expected: unused-`@ts-expect-error` (TS2578) on the three expect-error lines — the loose `Record<string, DriverParamValue>` signature accepts everything.

- [ ] **Step 3: Tighten the signature**

In `src/builder/insert.ts`, add imports:

```ts
import type { RowTypeForTable } from "../schema.js";
import type { TableKeyFromToken } from "../tables.js";
```

add the helper types (above the `InsertQueryBuilder` interface):

```ts
// Resolved schema row for the `.into()` token ("orders" or "schema.orders",
// case-insensitive via TableKeyFromToken). `never` when unresolvable.
type TableRowFor<Tbl extends string, S extends DatabaseSchema> =
    RowTypeForTable<TableKeyFromToken<Tbl, S> & string, S>;

// Input row for `.rows()`: any subset of the target table's columns with their
// exact (branded) types — keys are emitted verbatim into SQL, so they must
// match the schema's exact casing. Unresolvable table → loose record (lenient).
type RowsInputFor<Tbl extends string, S extends DatabaseSchema> =
    [TableRowFor<Tbl, S>] extends [never] ? Record<string, DriverParamValue>
    : Partial<TableRowFor<Tbl, S>>;

type AllowedRowKeys<Tbl extends string, S extends DatabaseSchema> =
    [TableRowFor<Tbl, S>] extends [never] ? string : keyof TableRowFor<Tbl, S>;

// Two checks the Partial constraint alone cannot make:
// 1. unknown keys — a constraint check is structural, so an excess property in
//    an inferred Row slips through `Row extends Partial<...>`;
// 2. homogeneity — heterogeneous array literals infer Row as a UNION. Same-key
//    rows whose VALUE types differ (note: "x" vs note: null) ALSO infer a
//    union, so compare KEY SETS, not union arms: keyof over a union is the
//    intersection of keys, AllRowKeys the union — equal iff every row has the
//    same columns.
type AllRowKeys<R> = R extends any ? keyof R : never;
type RowsGuard<Row, Allowed> =
    [Exclude<AllRowKeys<Row>, Allowed>] extends [never]
        ? [AllRowKeys<Row>] extends [keyof Row]
            ? unknown
            : readonly ["Error: all rows must share the same column set"][]
        : readonly ["Error: unknown column in .rows()"][];
```

replace the interface's loose `rows` line with:

```ts
    rows<Row extends RowsInputFor<T["table"], S>>(
        rows: readonly Row[] & RowsGuard<Row, AllowedRowKeys<T["table"], S>>,
    ): InsertQueryBuilder<S, T>;
```

(`InsertImpl.rows` keeps its runtime `ReadonlyArray<Record<string, DriverParamValue>>` parameter — the class is bridged through `as unknown as InsertQueryBuilder` already.)

- [ ] **Step 4: Run typecheck twice + full suite**

Run: `npm run typecheck` (twice)
Expected: exit 0 both times — pins satisfied (no TS2578), all pre-existing `.rows()` runtime tests still compile (the `as any` heterogeneous arrays now NEED that cast; the rest must compile cleanly — if `{ name: "p", tags: [...], meta: {...} }` on `products` fails, the bug is in `TableRowFor` resolution, not the test).
Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/builder/insert.ts tests/builder/insert-runtime.test.ts
git commit -m "feat(builder): schema-precise typing for .rows() (branded values, exact keys, homogeneous rows)"
```

---

### Task 4: Docs, perf gate, final verification

**Files:**
- Modify: `README.md` (write-builders example + Behavior notes)
- Modify: `CONTRIBUTING.md` (design contract + gotcha row)
- Possibly modify: `scripts/perf-baseline.json` (only on a justified breach)

- [ ] **Step 1: README**

In the write-builders example block, replace the line:

```
// Multi-row VALUES is rejected in the typed path — use the untyped driver call.
```

with:

```ts
// Multi-row inserts: pass row objects; placeholders and the column list are
// generated from the first row's keys (all rows must share the same keys).
const bulk = createInsertQuery<Schema>()
  .into("orders")
  .rows([
    { userId: u1, amount: 100 },
    { userId: u2, amount: 250 },
  ])
  .returning("id");
bulk.toString(); // insert into orders (userId, amount) values ($1, $2), ($3, $4) returning id
```

In "Behavior notes", add one bullet:

```
- **Multi-row `VALUES` params are typed per tuple.** In raw SQL,
  `insert into t (a, b) values (:a1, :b1), (:a2, :b2)` binds every `:param` to
  its column's type, tuple by tuple. Very long tuple lists degrade: beyond 12
  tuples (or an unparseable tail) the remaining params are accepted untyped
  rather than rejected.
```

- [ ] **Step 2: CONTRIBUTING**

Under "Shallow & lenient parsing", add a bullet:

```
- Multi-row `VALUES` param typing (`CollectTuples` in
  `src/builder/extract-params.ts`) zips each tuple against the column list,
  capped at 12 tuples × 400 walk-steps per tuple. On overrun the remaining
  text falls back to the loose `DriverParamValue` sweep — widening, never an
  error. Don't raise the caps (TS2589); don't make overrun reject.
```

In the reviewer-gotchas table, add a row:

```
| A `:param` in the 13th+ `VALUES` tuple types `unknown` instead of the column type | **Intended.** Tuple-cap degrade — loose, never rejected. |
```

- [ ] **Step 3: Perf gate**

Run: `npm run perf`
Expected: PASS (the additions are small). If it breaches: compare the counter deltas — growth must be attributable to the new tests/feature types (a few new pins + a 400-step walker that only runs on multi-row inserts). If and only if that holds, re-record:

```bash
npm run perf -- --update
git add scripts/perf-baseline.json
```

If the breach is large (>3–4% on Instantiations from this change alone), STOP and investigate `CollectTuples` instantiation counts instead of updating the baseline.

- [ ] **Step 4: Full final gate**

Run: `npm run typecheck` (twice — deterministic), `bun test`, `npm run perf`
Expected: 0 errors × 2, all runtime tests pass, perf within budget.

- [ ] **Step 5: Commit**

```bash
git add README.md CONTRIBUTING.md
git commit -m "docs: multi-row VALUES — per-tuple raw typing + builder .rows()"
```

(Include `scripts/perf-baseline.json` in this commit if Step 3 re-recorded it.)
