// tests/builder/acceptance/reporting-pse-analytics.test.ts
// Real chain from reporting-v2/src/lib/pseAnalytics.ts (lines 14-41).
// Exercises: INNER + LEFT joins, `ua.*` star expansion through a 3-table join,
// LEFT-join column nullability, `like` predicates, whereIf x N.
import { describe, it, expect } from "bun:test";
import { createSelectQuery, createSelectFn } from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import type { CommerceMainSchema } from "../../fixtures/commerce-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

const adopted = "adopted";
const active = true;

// --- Copied from reporting-v2/src/lib/pseAnalytics.ts:14-41 ---
const q = createSelectQuery<CommerceMainSchema>()
    .from(`"User_Analytics" ua`)
    .join(`join "User" u on u.id = ua."userId"`)
    .join(`left join "PSEApplication" pa on pa."userId" = ua."userId"`)
    .select(`u.email`)
    .select(`u.phone`)
    .select(`u."givenName"`)
    .select(`u."familyName"`)
    .select(`u."createdAt"`)
    .select(`u."firstLoggedIn"`)
    .select(`u."lastLoggedIn"`)
    .select(`u."groups"`)
    .select(`pa.id as "pseApplicationId"`)
    .select(`ua.*`)
    .where(`(u."groups" like '%FRI%' or u."groups" like '%GPS%')`)
    .whereIf(adopted === "adopted", `ua."isPSEAdopted" = true`)
    .whereIf(active === true, `ua."isPSEActive" = true`);
// --------------------------------------------------------------

describe("reporting pseAnalytics chain", () => {
    it("assembles a multi-join query with star expansion", () => {
        const expected =
            `SELECT u.email, u.phone, u."givenName", u."familyName", u."createdAt", ` +
            `u."firstLoggedIn", u."lastLoggedIn", u."groups", pa.id as "pseApplicationId", ua.* ` +
            `FROM "User_Analytics" ua ` +
            `join "User" u on u.id = ua."userId" ` +
            `left join "PSEApplication" pa on pa."userId" = ua."userId" ` +
            `WHERE (u."groups" like '%FRI%' or u."groups" like '%GPS%') ` +
            `AND ua."isPSEAdopted" = true AND ua."isPSEActive" = true`;
        expect(normalizeWhitespace(q.toString())).toBe(normalizeWhitespace(expected));
    });

    it("has no params", () => {
        expect([...q.getParams()]).toEqual([]);
    });

    it("is accepted by createSelectFn", async () => {
        const select = createSelectFn<CommerceMainSchema>(() => Promise.resolve([]));
        await select(q);
    });
});

// Type-level: User columns + star-expanded User_Analytics columns resolve;
// pa.id from a LEFT join is nullable.
type Row = SelectBuilderResult<typeof q>;
type _Cols = RequireTrue<
    AssertExtends<
        Row,
        {
            email: string | null;
            givenName: string | null;
            pseApplicationId: string | null; // LEFT-join nullability
            userId: string; // from ua.*
            isPSEAdopted: boolean; // from ua.*
            isPSEActive: boolean; // from ua.*
        }
    >
>;
