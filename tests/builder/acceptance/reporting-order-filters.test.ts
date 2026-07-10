// tests/builder/acceptance/reporting-order-filters.test.ts
// Translated from reporting-v2/src/lib/orderSelect.ts: applyOrderFilters — the
// multiple `new ConditionTree("or")` branches + setPeriod + joinClick. The old
// `new ConditionTree("or"); or.add(a); or.add(b); select.where(or)` becomes
// `.where(createConditionTree("or").add(a).add(b))`. Positional addValue()
// params become :name placeholders.
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createConditionTree,
} from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

// Representative filters that fire the conditional branches.
const includeArchived = false;
const period = "month" as const;
// query matches the uuid regex -> clickId/id OR branch added too:
const query = "11111111-2222-3333-4444-555555555555";
const psePaymentStatus = ["paid", null] as (string | null)[]; // null present -> "is null" OR
const affiliatePaymentStatus = "pending"; // scalar -> affiliate OR manualAffiliate
const pseId = "u1"; // scalar -> joinClick + click."shopperId" = :pseId

// --- applyOrderFilters(orderSelect.ts:196-849), the OR/period/join branches ---
const q = createSelectQuery<ReportingV2Schema>()
    .withParams({
        queryClick: query,
        queryId: query,
        queryNetwork: query,
        queryOrder: query,
        psePaid: "paid",
        affPending: "pending",
        manAffPending: "pending",
        pseId,
    })
    .from(`"Network_Order" ordr`)
    .select([`ordr.id`, `ordr."orderId"`, `ordr."networkId"`])
    // includeArchived === false
    .whereIf(includeArchived === false, `ordr."archived" = false`)
    // period -> setPeriod(ordr."orderDate")
    .applyIf(!!period, (b) => setPeriod(b, period!, `ordr."orderDate"`, "YYYY-MM-DD"))
    // query (uuid match) -> ConditionTree("or")
    .where(
        createConditionTree("or")
            .add(`ordr."clickId" = :queryClick`)
            .add(`ordr."id" = :queryId`)
            .add(`ordr."networkId" = :queryNetwork`)
            .add(`ordr."orderId" = :queryOrder`),
        "query",
    )
    // psePaymentStatus array containing null -> "is null" OR "in (...)"
    .where(
        createConditionTree("or")
            .add(`ordr."psePaymentStatus" is null`)
            .add(`ordr."psePaymentStatus" in (:psePaid)`),
    )
    // affiliatePaymentStatus scalar -> affiliate OR manualAffiliate
    .where(
        createConditionTree("or")
            .add(`ordr."affiliatePaymentStatus" = :affPending`)
            .add(`ordr."manualAffiliatePaymentStatus" = :manAffPending`),
    )
    // pseId scalar -> joinClick(inner) + where
    .join(`join "LogProductClick" "click" on click."sid" = ordr."clickId"`)
    .where(`click."shopperId" = :pseId`);
// ---------------------------------------------------------------------------

describe("reporting orderSelect / applyOrderFilters", () => {
    it("assembles archived + period + OR groups + click join", () => {
        const expected =
            `SELECT ordr.id, ordr."orderId", ordr."networkId" ` +
            `FROM "Network_Order" ordr ` +
            `join "LogProductClick" "click" on click."sid" = ordr."clickId" ` +
            `WHERE ordr."archived" = false ` +
            `AND ordr."orderDate" between '2026-01-01' and '2026-01-31' ` +
            `AND (ordr."clickId" = $1 OR ordr."id" = $2 OR ordr."networkId" = $3 OR ordr."orderId" = $4) ` +
            `AND (ordr."psePaymentStatus" is null OR ordr."psePaymentStatus" in ($5)) ` +
            `AND (ordr."affiliatePaymentStatus" = $6 OR ordr."manualAffiliatePaymentStatus" = $7) ` +
            `AND click."shopperId" = $8`;
        expect(normalizeWhitespace(q.toString())).toBe(normalizeWhitespace(expected));
    });

    it("orders params by first appearance", () => {
        expect([...q.getParams()]).toEqual([
            query, // queryClick
            query, // queryId
            query, // queryNetwork
            query, // queryOrder
            "paid", // psePaid
            "pending", // affPending
            "pending", // manAffPending
            "u1", // pseId
        ]);
    });
});

type Row = SelectBuilderResult<typeof q>;
type _Row = RequireTrue<
    AssertExtends<Row, { id: string; orderId: string; networkId: string }>
>;
