// tests/builder/acceptance/reporting-link-filters.test.ts
// Translated from reporting-v2/src/lib/linkSelect.ts (applyLinksFilters, incl.
// the ConditionTree("or") text-search branch) and clickSelect.ts
// (applyClickFilters). The old `new ConditionTree("or")` becomes
// createConditionTree("or"); positional addValue() params become :name.
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createConditionTree,
    normalizeWhitespace,
} from "../../../src/builder/index.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

// ===========================================================================
// applyLinksFilters (linkSelect.ts:47-129) — query OR-branch + pseId scalar.
// ===========================================================================
const linkPeriod = "month" as const;
const linkPseId = "u1";
const linkQuery = "shoes";

const linkFilters = createSelectQuery<ReportingV2Schema>()
    .withParams({
        pseId: linkPseId,
        qCat: linkQuery,
        qHash: linkQuery,
        qSku: linkQuery,
        qName: `%${linkQuery}%`,
        qUrl: `%${linkQuery}%`,
        qBrand: `%${linkQuery}%`,
        qSid: linkQuery,
    })
    .from(`"Link" l`)
    .select([`l.id`, `l."hash"`, `l."name"`])
    // period -> setPeriod(l."createdAt")
    .applyIf(!!linkPeriod, (b) => setPeriod(b, linkPeriod!, `l."createdAt"`, "YYYY-MM-DD"))
    // pseId scalar
    .whereIf(!!linkPseId, `l."referenceUserId" = :pseId`)
    // query -> joinClick(left) + ConditionTree("or") over text columns + lpc.sid
    .join(`left join "LogProductClick" "lpc" on lpc."linkId" = l."id"`)
    .where(
        createConditionTree("or")
            .add(`l."catalogueProductId" = :qCat`)
            .add(`l."hash" = :qHash`)
            .add(`l."sku" = :qSku`)
            .add(`l."name" ilike :qName`)
            .add(`l."targetUrl" ilike :qUrl`)
            .add(`l."brand" ilike :qBrand`)
            .add(`lpc."sid" = :qSid`),
        "query",
    );

describe("reporting linkSelect / applyLinksFilters", () => {
    it("assembles period + pseId + click-join + OR text search", () => {
        const expected =
            `SELECT l.id, l."hash", l."name" ` +
            `FROM "Link" l ` +
            `left join "LogProductClick" "lpc" on lpc."linkId" = l."id" ` +
            `WHERE l."createdAt" between '2026-01-01' and '2026-01-31' ` +
            `AND l."referenceUserId" = $1 ` +
            `AND (l."catalogueProductId" = $2 OR l."hash" = $3 OR l."sku" = $4 ` +
            `OR l."name" ilike $5 OR l."targetUrl" ilike $6 OR l."brand" ilike $7 ` +
            `OR lpc."sid" = $8)`;
        expect(normalizeWhitespace(linkFilters.toString())).toBe(
            normalizeWhitespace(expected),
        );
    });

    it("orders params by first appearance", () => {
        expect([...linkFilters.getParams()]).toEqual([
            "u1",
            "shoes",
            "shoes",
            "shoes",
            "%shoes%",
            "%shoes%",
            "%shoes%",
            "shoes",
        ]);
    });
});

type LinkFiltersRow = SelectBuilderResult<typeof linkFilters>;
type _LinkFiltersRow = RequireTrue<
    AssertExtends<LinkFiltersRow, { id: string; hash: string; name: string | null }>
>;

// ===========================================================================
// applyClickFilters (clickSelect.ts:270-331) — period + pseId scalar +
// targetDomainQuery ilike.
// ===========================================================================
// Widened via helper so `!== "allTime"` is a real comparison, not a narrowed no-op.
const widenPeriod = (p: "month" | "allTime"): "month" | "allTime" => p;
const clickPeriod = widenPeriod("month");
const clickPseId = "u1";
const targetDomainQuery = "example.com";

const clickFilters = createSelectQuery<ReportingV2Schema>()
    .withParams({
        pseId: clickPseId,
        domain: `%${targetDomainQuery}%`,
    })
    .from(`"LogProductClick" lpc`)
    .select([`lpc.id`, `lpc.sid`, `lpc."targetDomain"`])
    // period (not allTime) -> setPeriod(lpc."createdAt")
    .applyIf(!!clickPeriod && clickPeriod !== "allTime", (b) =>
        setPeriod(b, clickPeriod, `lpc."createdAt"`, "YYYY-MM-DD HH:mm:ss"))
    // pseId scalar
    .whereIf(!!clickPseId, `lpc."shopperId" = :pseId`)
    // targetDomainQuery ilike
    .whereIf(!!targetDomainQuery, `lpc."targetDomain" ilike :domain`);

describe("reporting clickSelect / applyClickFilters", () => {
    it("assembles period + pseId + targetDomain ilike", () => {
        const expected =
            `SELECT lpc.id, lpc.sid, lpc."targetDomain" ` +
            `FROM "LogProductClick" lpc ` +
            `WHERE lpc."createdAt" between '2026-01-01' and '2026-01-31' ` +
            `AND lpc."shopperId" = $1 ` +
            `AND lpc."targetDomain" ilike $2`;
        expect(normalizeWhitespace(clickFilters.toString())).toBe(
            normalizeWhitespace(expected),
        );
    });

    it("orders params by first appearance", () => {
        expect([...clickFilters.getParams()]).toEqual(["u1", "%example.com%"]);
    });
});

type ClickFiltersRow = SelectBuilderResult<typeof clickFilters>;
type _ClickFiltersRow = RequireTrue<
    AssertExtends<
        ClickFiltersRow,
        { id: string; sid: string | null; targetDomain: string | null }
    >
>;
