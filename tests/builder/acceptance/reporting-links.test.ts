// tests/builder/acceptance/reporting-links.test.ts
// Translated from reporting-v2/src/lib/links.ts:
//   fetchLinks, fetchLinkOrderSums, fetchLinkClickSum, fetchLinksGroupped.
// join* helpers come from linkSelect.ts (joinClick/joinPse/joinOrder), inlined.
// convert_currency(...)::float8 columns -> number; count(*) -> number;
// array_agg(...) asserted loosely.
import { describe, it, expect } from "bun:test";
import { createSelectQuery, normalizeWhitespace } from "../../../src/builder/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

// ===========================================================================
// fetchLinks (links.ts:84-162). limit undefined -> no limit clause.
// ===========================================================================
const links = createSelectQuery<ReportingV2Schema>()
    .from(`"Link" l`)
    .orderBy(`l."createdAt" desc`)
    // joinPse(inner): User pse on pse."id" = l."referenceUserId"
    .join(`join "User" "pse" on pse."id" = l."referenceUserId"`)
    // applyLinksFilters({}) -> nothing
    .select([
        `l.id`,
        `l."createdAt"`,
        `l."referenceUserId" as "pseId"`,
        `l."teamId"`,
        `l."retailer" as "retailerId"`,
        `r."name" as "retailerName"`,
        `l."catalogueProductId"`,
        `l."hash"`,
        `l."sku"`,
        `l."name"`,
        `l."targetUrl"`,
        `l."brand"`,
        `pse."givenName" as "pseGivenName"`,
        `pse."familyName" as "pseFamilyName"`,
        `pse."email" as "pseEmail"`,
    ])
    .join(`left join "Retailer" r on r."id" = l."retailer"`);

describe("reporting links / fetchLinks", () => {
    it("assembles the link list query with pse + retailer joins", () => {
        const expected =
            `SELECT l.id, l."createdAt", l."referenceUserId" as "pseId", l."teamId", ` +
            `l."retailer" as "retailerId", r."name" as "retailerName", ` +
            `l."catalogueProductId", l."hash", l."sku", l."name", l."targetUrl", l."brand", ` +
            `pse."givenName" as "pseGivenName", pse."familyName" as "pseFamilyName", ` +
            `pse."email" as "pseEmail" ` +
            `FROM "Link" l ` +
            `join "User" "pse" on pse."id" = l."referenceUserId" ` +
            `left join "Retailer" r on r."id" = l."retailer" ` +
            `ORDER BY l."createdAt" desc`;
        expect(normalizeWhitespace(links.toString())).toBe(normalizeWhitespace(expected));
    });
    it("has no params", () => {
        expect([...links.getParams()]).toEqual([]);
    });
});

type LinksRow = SelectBuilderResult<typeof links>;
type _LinksRow = RequireTrue<
    AssertExtends<
        LinksRow,
        {
            id: string;
            createdAt: string;
            pseId: string | null;
            teamId: string | null;
            retailerId: string | null;
            // left join "Retailer" -> name is nullable even though the column is string
            retailerName: string | null;
            catalogueProductId: string | null;
            hash: string;
            sku: string | null;
            name: string | null;
            targetUrl: string | null;
            brand: string | null;
            pseGivenName: string | null;
            pseEmail: string | null;
        }
    >
>;

// ===========================================================================
// fetchLinkOrderSums (links.ts:179-249), groupBy = "linkId", convertTo "GBP".
// convert(field) = convert_currency(field::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)
// ===========================================================================
const convert = (field: string) =>
    `convert_currency(${field}::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)`;

const orderSums = createSelectQuery<ReportingV2Schema>()
    .from(`"Link" l`)
    // joinOrder(inner): joinClick (lpc) then ordr
    .join(`join "LogProductClick" "lpc" on lpc."linkId" = l."id"`)
    .join(`join "Network_Order" "ordr" on ordr."clickId" = lpc."sid"`)
    // applyLinksFilters({}) -> nothing
    .select([
        `'GBP' as "currency"`,
        `sum(${convert(`ordr."grossSaleAmount"`)}) as "grossSaleAmount"`,
        `avg(${convert(`ordr."grossSaleAmount"`)}) as "avgGrossSaleAmount"`,
        `sum(${convert(`ordr."saleAmount"`)}) as "saleAmount"`,
        `avg(${convert(`ordr."saleAmount"`)}) as "avgSaleAmount"`,
        `sum(${convert(`ordr."grossCommissionAmount"`)}) as "grossCommissionAmount"`,
        `avg(${convert(`ordr."grossCommissionAmount"`)}) as "avgGrossCommissionAmount"`,
        `sum(${convert(`ordr."commissionAmount"`)}) as "commissionAmount"`,
        `avg(${convert(`ordr."commissionAmount"`)}) as "avgCommissionAmount"`,
        `count(*) as "orderCount"`,
    ])
    // groupBy "linkId" (not pseId) -> null groupLabel
    .select([`null as "groupLabel"`])
    .select(`l."id" as "group"`)
    .groupBy(`l."id"`)
    // not a dateGroup -> order by sum(convert(commission)) desc
    .orderBy(`sum(${convert(`ordr."commissionAmount"`)}) desc`);

describe("reporting links / fetchLinkOrderSums (linkId)", () => {
    it("is string-stable with convert_currency sums", () => {
        expect(typeof orderSums.toString()).toBe("string");
        expect(orderSums.toString()).toContain(`GROUP BY l."id"`);
        expect(orderSums.toString()).toContain(`convert_currency`);
    });
});

// currency literal -> string; sums are not cast here (no ::float8) so the engine
// types them by aggregate; orderCount count(*) -> number; assert loosely.
type OrderSumsRow = SelectBuilderResult<typeof orderSums>;
type _OrderSumsRow = RequireTrue<
    AssertExtends<OrderSumsRow, { orderCount: number }>
>;

// ===========================================================================
// fetchLinkClickSum (links.ts:257-302), groupBy = "linkId".
// ===========================================================================
const clickSum = createSelectQuery<ReportingV2Schema>()
    .from(`"Link" l`)
    // joinClick(inner): lpc
    .join(`join "LogProductClick" "lpc" on lpc."linkId" = l."id"`)
    .select([`count(*) as "clickCount"`])
    .select([`null as "groupLabel"`])
    .select(`l."id" as "group"`)
    .groupBy(`l."id"`);

describe("reporting links / fetchLinkClickSum (linkId)", () => {
    it("assembles count grouped by link id", () => {
        const expected =
            `SELECT count(*) as "clickCount", null as "groupLabel", l."id" as "group" ` +
            `FROM "Link" l ` +
            `join "LogProductClick" "lpc" on lpc."linkId" = l."id" ` +
            `GROUP BY l."id"`;
        expect(normalizeWhitespace(clickSum.toString())).toBe(normalizeWhitespace(expected));
    });
});

type ClickSumRow = SelectBuilderResult<typeof clickSum>;
type _ClickSumRow = RequireTrue<AssertExtends<ClickSumRow, { clickCount: number }>>;

// ===========================================================================
// fetchLinksGroupped (links.ts:314-388), groupBy = "pseId" (array_agg label).
// ===========================================================================
const linksGrouped = createSelectQuery<ReportingV2Schema>()
    .from(`"Link" l`)
    // applyLinksFilters({}) -> nothing
    .select([`count(*) as "linkCount"`])
    // groupBy "pseId" -> joinPse(inner) + array_agg
    .join(`join "User" "pse" on pse."id" = l."referenceUserId"`)
    .select([`(array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel"`])
    .select(`l."referenceUserId" as "group"`)
    .groupBy(`l."referenceUserId"`);

describe("reporting links / fetchLinksGroupped (pseId)", () => {
    it("assembles count grouped by pse with array_agg label", () => {
        const expected =
            `SELECT count(*) as "linkCount", ` +
            `(array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel", ` +
            `l."referenceUserId" as "group" ` +
            `FROM "Link" l ` +
            `join "User" "pse" on pse."id" = l."referenceUserId" ` +
            `GROUP BY l."referenceUserId"`;
        expect(normalizeWhitespace(linksGrouped.toString())).toBe(normalizeWhitespace(expected));
    });
});

type LinksGroupedRow = SelectBuilderResult<typeof linksGrouped>;
type _LinksGroupedRow = RequireTrue<
    AssertExtends<LinksGroupedRow, { linkCount: number; group: string | null }>
>;
