// tests/builder/acceptance/reporting-clicks.test.ts
// Translated from reporting-v2/src/lib/clicks.ts: fetchClicks + fetchClicksGroupped.
// The OLD untyped `new Select()` chain plus join* helpers (from clickSelect.ts)
// become this repo's typed createSelectQuery, with the join* helper SQL INLINED
// (each helper's join() emits `left join "Table" "alias" on <on>`, deduped by
// alias). Positional addValue() params become :name placeholders.
import { describe, it, expect } from "bun:test";
import { createSelectQuery, normalizeWhitespace } from "../../../src/builder/index.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

// retailerIdExpression from clickSelect.ts:11-48 (collapsed; the shared coalesce).
const retailerIdExpression = `coalesce(
    link."retailer",
    product."retailer",
    "linkProduct"."retailer",
    case
        when "linkProductReference"."productId" is not null
            then array_to_string((regexp_split_to_array("linkProductReference"."productId", '-'))[1:array_length(regexp_split_to_array("linkProductReference"."productId", '-'), 1) - 1], '-')
        when "lookProductCatalogueReference"."productId" is not null
            then array_to_string((regexp_split_to_array("lookProductCatalogueReference"."productId", '-'))[1:array_length(regexp_split_to_array("lookProductCatalogueReference"."productId", '-'), 1) - 1], '-')
        when "linkProductCatalogueReference"."productId" is not null
            then array_to_string((regexp_split_to_array("linkProductCatalogueReference"."productId", '-'))[1:array_length(regexp_split_to_array("linkProductCatalogueReference"."productId", '-'), 1) - 1], '-')
        else null
    end
)`;

// ===========================================================================
// fetchClicks (clicks.ts:76-182)
// ===========================================================================
// Typed via a widening helper so TS keeps the `number | false` union (a
// literal `const` would narrow to the value and make `!== false` a no-op error).
const widenLimit = (n: number | false): number | false => n;
const limit = widenLimit(1000);
const offset = 0;

const clicks = createSelectQuery<ReportingV2Schema>()
    .from(`"LogProductClick" lpc`)
    // join* helpers, inlined in dedup order (clicks.ts:81-94):
    .join(`left join "User" "pse" on pse."id" = lpc."shopperId"`)
    .join(`left join "User" "customer" on customer."id" = lpc."userId"`)
    .join(`left join "Product" "product" on "product"."id" = "lpc"."productId"`)
    .join(`left join "Look" "look" on "look"."id" = "product"."lookId"`)
    .join(`left join "Moodboard" "moodboard" on "moodboard"."id" = "lpc"."moodboardId"`)
    .join(`left join "Link" "link" on link."id" = lpc."linkId"`)
    .join(`left join "Product" "linkProduct" on "linkProduct"."id" = "link"."lookProductId"`)
    .join(`left join "Look" "linkLook" on "linkLook"."id" = "linkProduct"."lookId"`)
    .join(`left join "Moodboard" "linkMoodboard" on "linkMoodboard"."id" = "link"."moodboardId"`)
    .join(`left join "Catalogue_ProductReference" "linkProductReference" on "linkProductReference"."id" = "linkProduct"."productReferenceId"`)
    .join(`left join "Catalogue_ProductReference" "linkProductCatalogueReference" on "linkProductCatalogueReference"."id" = "linkProduct"."productReferenceId"`)
    .join(`left join "Catalogue_ProductReference" "lookProductCatalogueReference" on "lookProductCatalogueReference"."id" = "product"."productReferenceId"`)
    .join(`left join "User" "lookPse" on "lookPse"."id" = "look"."friId"`)
    .join(`left join "User" "moodboardPse" on "moodboardPse"."id" = "moodboard"."friId"`)
    .join(`left join "User" "linkLookPse" on "linkLookPse"."id" = "linkLook"."friId"`)
    .join(`left join "User" "linkMoodboardPse" on "linkMoodboardPse"."id" = "linkMoodboard"."friId"`)
    .orderBy(`lpc."createdAt" desc`)
    // applyClickFilters({}) with no filters set -> no extra clauses
    .applyIf(limit !== false, (b) => b.limit(limit === false ? 0 : limit).offset(offset))
    .select([
        `lpc.id`,
        `lpc.sid`,
        `lpc."createdAt"`,
        `lpc."shopperId"`,
        `lpc."userId" as "customerId"`,
        `lpc."usedUrl"`,
        `lpc."userAgent"`,
        `lpc."userCountry"`,
        `lpc."targetDomain"`,
        `(case when lpc."moodboardId" is not null then 'moodboard' when lpc."productId" is not null then 'styling' when lpc."linkId" is not null then 'link' when lpc."catalogueProductId" is not null then 'catalogue' else null end) as "sourceType"`,
        `lpc."linkId"`,
        `coalesce(lpc."productId", link."lookProductId" ) as "lookProductId"`,
        `coalesce(product."lookId", "linkProduct"."lookId") as "lookId"`,
        `coalesce(lpc."moodboardId", "link"."moodboardId") as "moodboardId"`,
        `coalesce("linkProductReference"."productId", "lookProductCatalogueReference"."productId", "linkProductCatalogueReference"."productId", lpc."catalogueProductId", "link"."catalogueProductId") as "catalogueProductId"`,
        `${retailerIdExpression} as "retailerId"`,
        `pse."givenName" as "pseGivenName"`,
        `pse."familyName" as "pseFamilyName"`,
        `pse."email" as "pseEmail"`,
        `customer."givenName" as "customerGivenName"`,
        `customer."familyName" as "customerFamilyName"`,
        `customer."email" as "customerEmail"`,
        `coalesce("moodboard"."name","linkMoodboard"."name") as "moodboardName"`,
        `link."hash" as "linkHash"`,
    ])
    .where(`lpc."isBot" = false`);

describe("reporting clicks / fetchClicks", () => {
    it("assembles a large multi-join clicks query (string-stable)", () => {
        expect(typeof clicks.toString()).toBe("string");
        expect(clicks.toString()).toContain(`FROM "LogProductClick" lpc`);
        expect(clicks.toString()).toContain(`WHERE lpc."isBot" = false`);
        expect(clicks.toString()).toContain(`LIMIT 1000 OFFSET 0`);
    });
    it("has no params (filters empty)", () => {
        expect([...clicks.getParams()]).toEqual([]);
    });
});

// Type-level: the selected aliased columns appear with the right primitives.
type ClicksRow = SelectBuilderResult<typeof clicks>;
type _ClicksRow = RequireTrue<
    AssertExtends<
        ClicksRow,
        {
            id: string;
            sid: string | null;
            createdAt: string;
            shopperId: string | null;
            customerId: string | null;
            usedUrl: string | null;
            userCountry: string | null;
            targetDomain: string | null;
            linkId: string | null;
            pseGivenName: string | null;
            pseEmail: string | null;
            linkHash: string | null;
        }
    >
>;

// ===========================================================================
// fetchClicksGroupped (clicks.ts:199-251), groupBy = "pseId"
// ===========================================================================
const groupBy = "pseId" as const;
const groupByField = `lpc."shopperId"`; // groupByFields["pseId"]

const grouped = createSelectQuery<ReportingV2Schema>()
    .from(`"LogProductClick" lpc`)
    // applyClickFilters({}) -> nothing
    .select([`count(*) as "clickCount"`])
    // groupBy === "pseId" -> joinPse(inner) + array_agg label
    .join(`join "User" "pse" on pse."id" = lpc."shopperId"`)
    .select([`(array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel"`])
    // groupBy present -> select group expr + group by; not a dateGroup so no order
    .select(`${groupByField} as "group"`)
    .groupBy(groupByField)
    .applyIf(limit !== false, (b) => b.limit(limit === false ? 0 : limit).offset(offset));

describe("reporting clicks / fetchClicksGroupped (pseId)", () => {
    it("assembles count + array_agg grouped query", () => {
        const expected =
            `SELECT count(*) as "clickCount", ` +
            `(array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel", ` +
            `lpc."shopperId" as "group" ` +
            `FROM "LogProductClick" lpc ` +
            `join "User" "pse" on pse."id" = lpc."shopperId" ` +
            `GROUP BY lpc."shopperId" ` +
            `LIMIT 1000 OFFSET 0`;
        expect(normalizeWhitespace(grouped.toString())).toBe(normalizeWhitespace(expected));
    });
});

// Type-level: count(*) -> number; group -> shopperId (string|null); groupLabel array_agg loose.
type GroupedRow = SelectBuilderResult<typeof grouped>;
type _GroupedRow = RequireTrue<
    AssertExtends<GroupedRow, { clickCount: number; group: string | null }>
>;
