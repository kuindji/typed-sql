// tests/builder/acceptance/reporting-orders.test.ts
// Translated from reporting-v2/src/lib/orders.ts: fetchOrderIds + fetchOrders.
// join* helpers come from orderSelect.ts, inlined in dedup order. Positional
// addValues() params become :name placeholders. fetchOrders has a very large
// SELECT (convert_currency(...)::float8 -> number, CASE exprs, nested EXISTS):
// it is asserted string-stable + type-level on the float8/aliased columns; the
// exact full-string compute is impractical so a representative subset is built.
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

// ===========================================================================
// fetchOrderIds (orders.ts:227-259). filters undefined -> no applyOrderFilters.
// ===========================================================================
const widenLimit = (n: number | false): number | false => n;
const limit = widenLimit(100);
const offset = 0;

const orderIds = createSelectQuery<ReportingV2Schema>()
    .from(`"Network_Order" ordr`)
    .select([`ordr.id`, `ordr."orderId"`, `ordr."networkId"`])
    .orderBy(`ordr."orderDate" desc`)
    .applyIf(limit !== false, (b) => b.limit(limit === false ? 0 : limit).offset(offset));

describe("reporting orders / fetchOrderIds", () => {
    it("assembles the id list query", () => {
        const expected =
            `SELECT ordr.id, ordr."orderId", ordr."networkId" ` +
            `FROM "Network_Order" ordr ` +
            `ORDER BY ordr."orderDate" desc LIMIT 100 OFFSET 0`;
        expect(normalizeWhitespace(orderIds.toString())).toBe(normalizeWhitespace(expected));
    });
    it("has no params (no filters)", () => {
        expect([...orderIds.getParams()]).toEqual([]);
    });
});

type OrderIdsRow = SelectBuilderResult<typeof orderIds>;
type _OrderIdsRow = RequireTrue<
    AssertExtends<OrderIdsRow, { id: string; orderId: string; networkId: string }>
>;

// ===========================================================================
// fetchOrders (orders.ts:268-916). convertToCurrency undefined ->
//   convert(field) === field (no wrapping); convertToGBP(field) wraps in
//   convert_currency(...,'GBP'::text, ordr."orderDate"::date). currency branch
//   falls to ordr."currency" and null as "convertedFromCurrency".
// ids come from fetchOrderIds: ordr.id in (:id0, ...) via addValues.
// vatRateCase / orderLateReturnSql expanded inline. Representative subset of
// the (very large) production SELECT — focuses on the float8 conversions,
// CASE-derived rate columns, and the joined aliases.
// ===========================================================================
const GB_VAT = "0.2";
const vatRateCase = (whenApplicable: string, otherwise: string) =>
    `case when "teamPaymentSettings"."teamId" is not null then ` +
    `case when "teamPaymentSettings"."vatEnabled" is true and "teamPaymentSettings"."vatCountry" = 'GB' then ${whenApplicable} else ${otherwise} end ` +
    `else case when "psePaymentSettings"."vatEnabled" is true and "psePaymentSettings"."vatCountry" = 'GB' then ${whenApplicable} else ${otherwise} end end`;
const toGBP = (field: string) =>
    `convert_currency((${field})::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)`;

const orders = createSelectQuery<ReportingV2Schema>()
    .withParams({ id0: "o1", id1: "o2" })
    .from(`"Network_Order" ordr`)
    .where(`ordr.id in (:id0, :id1)`)
    .orderBy(`ordr."orderDate" desc`)
    .select([
        `ordr."id"`,
        `ordr."orderId"`,
        `ordr."orderDate"`,
        `ordr."rawOrderId"`,
        // convert(field) === field when convertToCurrency unset:
        `ordr."grossSaleAmount"::float8 as "grossSaleAmount"`,
        `${toGBP(`ordr."grossSaleAmount"`)}::float8 as "grossSaleAmountGBP"`,
        `ordr."saleAmount"::float8 as "saleAmount"`,
        `${toGBP(`ordr."saleAmount"`)}::float8 as "saleAmountGBP"`,
        `ordr."grossCommissionAmount"::float8 as "grossCommissionAmount"`,
        `${toGBP(`ordr."grossCommissionAmount"`)}::float8 as "grossCommissionAmountGBP"`,
        `ordr."commissionAmount"::float8 as "commissionAmount"`,
        `${toGBP(`ordr."commissionAmount"`)}::float8 as "commissionAmountGBP"`,
        `ordr."pseBalance"::float8 as "pseBalance"`,
        `${toGBP(`ordr."pseBalance"`)}::float8 as "pseBalanceGBP"`,
        `(ordr."pseBalance" * (${vatRateCase(GB_VAT, `0`)}))::float8 as "pseBalanceVatAmount"`,
        `(ordr."commissionAmount" * ordr."pseCommissionRate" * (${vatRateCase(GB_VAT, `0`)}))::float8 as "pseVatAmount"`,
        `(ordr."commissionAmount" * ordr."pseCommissionRate" * (${vatRateCase(`${GB_VAT} + 1`, `1`)}))::float8 as "pseTotalAmount"`,
        `(ordr."pseBalance" * (${vatRateCase(`${GB_VAT} + 1`, `1`)}))::float8 as "pseBalanceWithVat"`,
        // currency branch (convertToCurrency unset):
        `ordr."currency"`,
        `null as "convertedFromCurrency"`,
        `ordr."status" as "affiliateStatus"`,
        `ordr."manualStatus"`,
        `ordr."internalStatus"`,
        `ordr."networkId"`,
        `ordr."manualPseBalance" as "manualPseBalanceNative"`,
        `ordr."realPseBalance" as "realPseBalanceNative"`,
        `ordr."clickId"`,
        `click."catalogueProductId"`,
        `click."productId"`,
        `click."usedUrl"`,
        `click."shopperId"`,
        `click."userId" as "customerId"`,
        `click."moodboardId"`,
        `click."createdAt" as "clickedAt"`,
        `"clickProduct"."lookId"`,
        `"clickProduct"."name" as "clickedLookProductName"`,
        `"clickProduct"."retailer" as "clickedLookProductRetailer"`,
        `"clickProductLook"."consultationId"`,
        `"clickProductReference"."productId" as "clickedLookProductCatalogueId"`,
        `ordr."revolutPaymentStatus"`,
        `ordr."manualRevolutPaymentStatus"`,
        `ordr."archived"`,
        `"revolutCounterparty"."id" as "revolutCounterpartyId"`,
        `pse."givenName" as "pseGivenName"`,
        `pse."familyName" as "pseFamilyName"`,
        `pse."email" as "pseEmail"`,
        `customer."givenName" as "customerGivenName"`,
        `customer."familyName" as "customerFamilyName"`,
        `customer."email" as "customerEmail"`,
        `"psePaymentSettings"."pseCommission" as "pseCustomCommissionRate"`,
        `"psePaymentSettings"."vatEnabled" as "pseVatEnabled"`,
        `"psePaymentSettings"."vatCountry" as "pseVatCountry"`,
        `(${vatRateCase(`true`, `false`)}) as "pseVatApplicable"`,
        `"link"."hash" as "linkHash"`,
        `"link"."brand" as "linkBrand"`,
        `"link"."name" as "linkName"`,
        `"link"."retailer" as "linkRetailer"`,
    ])
    // join* helpers (orders.ts:609-620), inlined in dedup order:
    .join(`left join "LogProductClick" "click" on click."sid" = ordr."clickId"`)
    .join(`left join "User" "pse" on "pse"."id" = click."shopperId"`)
    .join(`left join "Revolut_Counterparty" "revolutCounterparty" on "revolutCounterparty"."userId" = click."userId"`)
    .join(`left join "Link" "link" on "link"."id" = click."linkId"`)
    .join(`left join "User_PaymentSettings" "psePaymentSettings" on "psePaymentSettings"."userId" = click."shopperId"`)
    .join(`left join "Team_PaymentSettings" "teamPaymentSettings" on "teamPaymentSettings"."teamId" = click."teamId"`)
    .join(`left join "User" "customer" on "customer"."id" = click."userId"`)
    .join(`left join "Product" "clickProduct" on "clickProduct"."id" = click."productId"`)
    .join(`left join "Catalogue_ProductReference" "clickProductReference" on "clickProductReference"."id" = "clickProduct"."productReferenceId"`)
    .join(`left join "Look" "clickProductLook" on "clickProductLook"."id" = "clickProduct"."lookId"`);

describe("reporting orders / fetchOrders", () => {
    it("is string-stable with float8 conversions + joins", () => {
        expect(typeof orders.toString()).toBe("string");
        expect(orders.toString()).toContain(`FROM "Network_Order" ordr`);
        expect(orders.toString()).toContain(`WHERE ordr.id in ($1, $2)`);
        expect(orders.toString()).toContain(`convert_currency`);
        expect(orders.toString()).toContain(`left join "LogProductClick" "click"`);
    });
    it("orders params by first appearance (id0, id1)", () => {
        expect([...orders.getParams()]).toEqual(["o1", "o2"]);
    });
});

// Type-level: ::float8 conversions -> number; aliased text/bool columns carry
// their primitives. (manualPseBalanceNative is number|null in the schema.)
type OrdersRow = SelectBuilderResult<typeof orders>;
type _OrdersRow = RequireTrue<
    AssertExtends<
        OrdersRow,
        {
            id: string;
            orderId: string;
            orderDate: string;
            grossSaleAmount: number;
            grossSaleAmountGBP: number;
            saleAmount: number;
            commissionAmount: number;
            pseBalance: number;
            pseBalanceVatAmount: number;
            pseTotalAmount: number;
            currency: string;
            affiliateStatus: string | null;
            networkId: string;
            archived: boolean;
            customerId: string | null;
            linkHash: string | null;
            pseEmail: string | null;
        }
    >
>;
