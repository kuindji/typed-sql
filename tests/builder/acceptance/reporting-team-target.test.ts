// tests/builder/acceptance/reporting-team-target.test.ts
// Real chain from reporting-v2/src/controller/team/target.ts (lines 83-124).
// Exercises: mutually-exclusive selectIf pairs, convert_currency(:name)::float8,
// bare column ::float8 cast, :name params inside function args, where x2.
import { describe, it, expect } from "bun:test";
import { createSelectQuery, createSelectFn, normalizeWhitespace } from "../../../src/builder/index.js";
import type { CommerceMainSchema } from "../../fixtures/commerce-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

const teamId = "t1";
const pseId = "p1";
const convertToCurrency = "EUR";

// --- Copied from reporting-v2/src/controller/team/target.ts:83-124 ---
const q = createSelectQuery<CommerceMainSchema>()
    .withParams({ teamId, pseId, convertToCurrency })
    .from(`"Team_Member_SalesTarget"`)
    .select(`"teamId"`)
    .select(`"pseId"`)
    .selectIf(!!convertToCurrency, `convert_currency("annualSalesTarget"::numeric, "currency", :convertToCurrency, current_date)::float8 as "annualSalesTarget"`)
    .selectIf(!!convertToCurrency, `convert_currency("monthlySalesTarget"::numeric, "currency", :convertToCurrency, current_date)::float8 as "monthlySalesTarget"`)
    .selectIf(!!convertToCurrency, `:convertToCurrency as "currency"`)
    .selectIf(!convertToCurrency, `"annualSalesTarget"::float8`)
    .selectIf(!convertToCurrency, `"monthlySalesTarget"::float8`)
    .selectIf(!convertToCurrency, `"currency"`)
    .select(`"updatedAt"`)
    .where(`"teamId" = :teamId`)
    .where(`"pseId" = :pseId`);
// ---------------------------------------------------------------------

describe("reporting team/target chain", () => {
    it("assembles convert_currency selects with shared :name params", () => {
        const expected =
            `SELECT "teamId", "pseId", ` +
            `convert_currency("annualSalesTarget"::numeric, "currency", $1, current_date)::float8 as "annualSalesTarget", ` +
            `convert_currency("monthlySalesTarget"::numeric, "currency", $1, current_date)::float8 as "monthlySalesTarget", ` +
            `$1 as "currency", "updatedAt" ` +
            `FROM "Team_Member_SalesTarget" ` +
            `WHERE "teamId" = $2 AND "pseId" = $3`;
        expect(normalizeWhitespace(q.toString())).toBe(normalizeWhitespace(expected));
    });

    it("orders params by first appearance (convertToCurrency, teamId, pseId)", () => {
        expect([...q.getParams()]).toEqual(["EUR", "t1", "p1"]);
    });

    it("is accepted by createSelectFn", async () => {
        const select = createSelectFn<CommerceMainSchema>(() => Promise.resolve([]));
        await select(q);
    });
});

// Type-level: required base columns; conditional convert_currency / currency
// selects are optional. ::float8 resolves to number (core fix).
type Row = SelectBuilderResult<typeof q>;
type _Required = RequireTrue<
    AssertExtends<Row, { teamId: string; pseId: string; updatedAt: string }>
>;
type _Annual = RequireTrue<AssertExtends<{ annualSalesTarget?: number }, Pick<Row, "annualSalesTarget">>>;
type _Monthly = RequireTrue<AssertExtends<{ monthlySalesTarget?: number }, Pick<Row, "monthlySalesTarget">>>;
type _Currency = RequireTrue<AssertExtends<{ currency?: string }, Pick<Row, "currency">>>;
