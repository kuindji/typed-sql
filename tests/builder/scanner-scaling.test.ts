// tests/builder/scanner-scaling.test.ts
//
// Guards against the O(P^2) regression in bound-query building, where P is the
// number of DISTINCT placeholder names in ONE statement (NOT the query length,
// and NOT the number of values — a single `in (:ids)` bound to a 16k-element
// array is one name and stays fast).
//
// The original bug used a plain array as a set in two independent places
// (`order.includes()` in scanner.ts `uniqueNames`, `used.includes()` in
// params.ts `usedParamNames`) and rebuilt the whole SQL string once per
// occurrence in `expandScanned`. A 4201-row `.rows()` insert (16,804 distinct
// synthetic names) cost ~880ms of pure CPU per toString() before a DB
// connection was ever opened — enough to blow a 60s Lambda timeout at low vCPU.
//
// Timing tests are noisy, so these assert a SCALING RATIO with a wide margin
// rather than an absolute wall-clock budget: over an 8x increase in distinct
// names, linear work costs ~8x and quadratic work costs ~64x. The threshold sits
// between at 24x, so ordinary machine noise cannot trip it but a reintroduced
// quadratic cannot hide.
import { describe, it, expect } from "bun:test";
import { createInsertQuery } from "../../src/builder/insert.js";
import { createSelectQuery } from "../../src/builder/select.js";
import { expandScanned, collectScanned } from "../../src/builder/scanner.js";
import { expandNamedParams, collectParamValues } from "../../src/builder/params.js";

/**
 * Best-of-3 elapsed ms — the minimum is the least noisy estimator here. One
 * untimed warm-up first: the SMALL input is always measured before the LARGE
 * one, so an unwarmed JIT would inflate the small baseline and bias the ratio
 * DOWN, which is the direction that hides a regression.
 */
function bestOf3(fn: () => unknown): number {
    fn();
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
        const t = performance.now();
        fn();
        const dt = performance.now() - t;
        if (dt < best) best = dt;
    }
    return best;
}

const SMALL = 1000;
const LARGE = 8000; // 8x SMALL: linear ⇒ ~8x time, quadratic ⇒ ~64x
const MAX_RATIO = 24;

/**
 * `n` distinct scalar placeholders in one WHERE clause. `supplyEvery` controls
 * how many of them are actually bound — `1` binds all, `3` binds every third and
 * leaves the rest as literal `:name`, exercising the SKIP path in the rewrite
 * loops (which is a separate branch from the replaced path and could regress on
 * its own).
 */
function manyNames(
    n: number,
    supplyEvery = 1,
): { sql: string; params: Record<string, number> } {
    const params: Record<string, number> = {};
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
        // Share a long prefix, as the synthetic `__tsqlrow_` names do: it defeats
        // early exit in a string compare, which is what made the array scan so
        // expensive in production.
        if (i % supplyEvery === 0) params[`__tsqlrow_0_${i}`] = i;
        parts.push(`c${i} = :__tsqlrow_0_${i}`);
    }
    return { sql: `select id from t where ${parts.join(" or ")}`, params };
}

function rows(n: number): Record<string, unknown>[] {
    return Array.from({ length: n }, (_, i) => ({
        registrar: `r${i}`,
        domain: `d${i}.example`,
        status: i % 3,
        seen: null,
    }));
}

/** Ratio of the LARGE-input cost to the SMALL-input cost. */
function scalingRatio(run: (n: number) => () => unknown): number {
    const small = bestOf3(run(SMALL));
    const large = bestOf3(run(LARGE));
    // Floor the denominator: a sub-0.05ms baseline would make the ratio noise.
    return large / Math.max(small, 0.05);
}

describe("bound-query building scales linearly in distinct placeholder count", () => {
    it("expandScanned (scanner) stays near-linear", () => {
        const ratio = scalingRatio(n => {
            const { sql, params } = manyNames(n);
            return () => expandScanned(sql, params);
        });
        expect(ratio).toBeLessThan(MAX_RATIO);
    });

    it("collectScanned (scanner) stays near-linear", () => {
        const ratio = scalingRatio(n => {
            const { sql, params } = manyNames(n);
            return () => collectScanned(sql, params);
        });
        expect(ratio).toBeLessThan(MAX_RATIO);
    });

    it("stays near-linear when only SOME placeholders are supplied", () => {
        // The skip branch (`continue` without advancing `last`) is separate code
        // from the replace branch; a regression could land in either one.
        const scannerRatio = scalingRatio(n => {
            const { sql, params } = manyNames(n, 3);
            return () => expandScanned(sql, params);
        });
        expect(scannerRatio).toBeLessThan(MAX_RATIO);

        const paramsRatio = scalingRatio(n => {
            const { sql, params } = manyNames(n, 3);
            return () => expandNamedParams(sql, params);
        });
        expect(paramsRatio).toBeLessThan(MAX_RATIO);
    });

    it("expandNamedParams (select/conditional path) stays near-linear", () => {
        const ratio = scalingRatio(n => {
            const { sql, params } = manyNames(n);
            return () => expandNamedParams(sql, params);
        });
        expect(ratio).toBeLessThan(MAX_RATIO);
    });

    it("collectParamValues (select/conditional path) stays near-linear", () => {
        const ratio = scalingRatio(n => {
            const { sql, params } = manyNames(n);
            return () => collectParamValues(sql, params);
        });
        expect(ratio).toBeLessThan(MAX_RATIO);
    });

    it("createInsertQuery().rows() toString()/getParams() stay near-linear", () => {
        // 4 columns per row, so LARGE/4 rows keeps the distinct-name counts at the
        // SMALL/LARGE ratio used everywhere else.
        const build = (n: number) =>
            createInsertQuery<TestSchema>()
                .into("registry_import")
                .rows(rows(n / 4) as never)
                .returning("id")
                .withParams({});

        const sqlRatio = scalingRatio(n => {
            const q = build(n);
            return () => q.toString();
        });
        expect(sqlRatio).toBeLessThan(MAX_RATIO);

        const paramsRatio = scalingRatio(n => {
            const q = build(n);
            return () => [...q.getParams()];
        });
        expect(paramsRatio).toBeLessThan(MAX_RATIO);
    });

    it("createSelectQuery() toString()/getParams() stay near-linear", () => {
        const build = (n: number) => {
            const { sql, params } = manyNames(n);
            const where = sql.slice(sql.indexOf("where ") + 6);
            return createSelectQuery<TestSchema>()
                .from("registry_import")
                .select("id")
                .where(where as never)
                .withParams(params as never);
        };

        const sqlRatio = scalingRatio(n => {
            const q = build(n);
            return () => q.toString();
        });
        expect(sqlRatio).toBeLessThan(MAX_RATIO);

        const paramsRatio = scalingRatio(n => {
            const q = build(n);
            return () => [...q.getParams()];
        });
        expect(paramsRatio).toBeLessThan(MAX_RATIO);
    });
});

describe("many distinct placeholders stay CORRECT, not just fast", () => {
    it("numbers 2000 distinct names $1..$2000 in appearance order", () => {
        const { sql, params } = manyNames(2000);
        const out = expandScanned(sql, params);
        const slots = out.match(/\$\d+/g) ?? [];
        expect(slots.length).toBe(2000);
        expect(slots[0]).toBe("$1");
        expect(slots[1999]).toBe("$2000");
        expect(out).not.toContain(":__tsqlrow_");
        expect(collectScanned(sql, params)).toEqual(
            Array.from({ length: 2000 }, (_, i) => i),
        );
        // The select/conditional path must agree slot-for-slot.
        expect(expandNamedParams(sql, params)).toBe(out);
        expect(collectParamValues(sql, params)).toEqual(
            Array.from({ length: 2000 }, (_, i) => i),
        );
    });

    it("a 600-row .rows() insert emits every cell in row-major order", () => {
        const data = rows(600);
        const q = createInsertQuery<TestSchema>()
            .into("registry_import")
            .rows(data as never)
            .withParams({});
        const sql = q.toString();
        const values = [...q.getParams()];
        expect(values.length).toBe(600 * 4);
        expect(values[0]).toBe("r0");
        expect(values[4]).toBe("r1");
        expect(values[2399]).toBe(null);
        expect(sql.endsWith("($2397, $2398, $2399, $2400)")).toBe(true);
        expect(sql).not.toContain(":__tsqlrow_");
    });

    it("stays fast when ONE name binds a huge array (not a distinct-name case)", () => {
        const ids = Array.from({ length: 16000 }, (_, i) => i);
        const ms = bestOf3(() => expandScanned("select id from t where id in (:ids)", { ids }));
        // One distinct name: this was never quadratic and must not become so.
        expect(ms).toBeLessThan(500);
        // Flattening must stay correct at scale. NOTE: the STACK-OVERFLOW guard
        // for this path lives in scripts/dist-smoke.mjs — the old
        // `result.push(...arr)` spread only overflows on V8/Node, never on
        // JavaScriptCore/Bun, so this runner cannot detect that regression.
        const values = collectScanned("select id from t where id in (:ids)", { ids });
        expect(values.length).toBe(16000);
        expect(values[15999]).toBe(15999);
    });
});

type TestSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            registry_import: {
                id: number;
                registrar: string;
                domain: string;
                status: number;
                seen: string | null;
            };
            t: { id: number };
        };
    };
};
