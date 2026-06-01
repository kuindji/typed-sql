// tests/builder/acceptance/reporting-team-stats.test.ts
// Real chain from reporting-v2/src/controller/team/stats.ts (lines 27-35).
// Exercises: JOIN, count(*)::int aggregate, :name params, whereIf.
import { describe, it, expect } from "bun:test";
import { createSelectQuery, createSelectFn, normalizeWhitespace } from "../../../src/builder/index.js";
import type { TheFloorrMainSchema } from "../../fixtures/thefloorr-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

const teamId = "t1";
const pseId = "p1";

// --- Copied from reporting-v2/src/controller/team/stats.ts:27-35 ---
const q = createSelectQuery<TheFloorrMainSchema>()
    .withParams({ teamId, pseId: pseId || "" })
    .from(`"Link" l`)
    .join(`join "Team_Member" tm on tm."userId" = l."referenceUserId"`)
    .where(`tm."teamId" = :teamId`)
    .whereIf(!!pseId, `l."referenceUserId" = :pseId`)
    .select(`count(*)::int as "cnt"`);
// -------------------------------------------------------------------

describe("reporting team/stats chain", () => {
    it("assembles a JOIN + count aggregate query", () => {
        const expected =
            `SELECT count(*)::int as "cnt" FROM "Link" l ` +
            `join "Team_Member" tm on tm."userId" = l."referenceUserId" ` +
            `WHERE tm."teamId" = $1 AND l."referenceUserId" = $2`;
        expect(normalizeWhitespace(q.toString())).toBe(normalizeWhitespace(expected));
    });

    it("orders params by first appearance", () => {
        expect([...q.getParams()]).toEqual(["t1", "p1"]);
    });

    it("is accepted by createSelectFn", async () => {
        const select = createSelectFn<TheFloorrMainSchema>(() => Promise.resolve([]));
        await select(q);
    });
});

// Type-level: count(*)::int → number.
type Row = SelectBuilderResult<typeof q>;
type _Cnt = RequireTrue<AssertEqual<Row, { cnt: number }>>;
