// tests/builder/acceptance/reporting-orders-wide-depth.test.ts
// Regression guard for wide-SELECT row inference. The FULL ~90-column projection
// of reporting-v2/src/lib/orders.ts::fetchOrders (cast-tailed conversions,
// arithmetic, multi-line CASE, and ~40 plain qualified refs across 10 joined
// relations) — the densest real-world SELECT this library serves.
//
// Two depth sinks scaled with column count and crossed TS's instantiation-depth-100
// guard (TS2589) on a projection this wide:
//   1. ColObjects' per-column left-fold (one frame per column) — now a homomorphic
//      mapped type, so columns resolve at constant depth.
//   2. PairMerge's `[Merge<A,B>, ...PairMerge<Rest>]` spread recursion (~N/2 deep
//      per round, with the lazy ColObjects map forced INSIDE it) — now tail-recursive.
// With both, this infers. If either regresses to a non-tail recursion, this file
// trips. The sibling reporting-orders.test.ts pins a narrower subset.
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

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
        `ordr."grossSaleAmount"::float8 as "grossSaleAmount"`,
        `${toGBP(`ordr."grossSaleAmount"`)}::float8 as "grossSaleAmountGBP"`,
        `ordr."saleAmount"::float8 as "saleAmount"`,
        `${toGBP(`ordr."saleAmount"`)}::float8 as "saleAmountGBP"`,
        `ordr."grossCommissionAmount"::float8 as "grossCommissionAmount"`,
        `${toGBP(`ordr."grossCommissionAmount"`)}::float8 as "grossCommissionAmountGBP"`,
        `(ordr."grossCommissionAmount" * ordr."pseCommissionRate")::float8 as "pseGrossCommissionAmount"`,
        `${toGBP(`ordr."grossCommissionAmount" * ordr."pseCommissionRate"`)}::float8 as "pseGrossCommissionAmountGBP"`,
        `ordr."commissionAmount"::float8 as "commissionAmount"`,
        `${toGBP(`ordr."commissionAmount"`)}::float8 as "commissionAmountGBP"`,
        `(ordr."commissionAmount" * ordr."pseCommissionRate")::float8 as "pseCommissionAmount"`,
        `${toGBP(`ordr."commissionAmount" * ordr."pseCommissionRate"`)}::float8 as "pseCommissionAmountGBP"`,
        `ordr."pseBalance"::float8 as "pseBalance"`,
        `${toGBP(`ordr."pseBalance"`)}::float8 as "pseBalanceGBP"`,
        `(ordr."pseBalance" * (${vatRateCase(GB_VAT, `0`)}))::float8 as "pseBalanceVatAmount"`,
        `(${toGBP(`ordr."pseBalance"`)} * (${vatRateCase(GB_VAT, `0`)}))::float8 as "pseBalanceVatAmountGBP"`,
        `(ordr."commissionAmount" * ordr."pseCommissionRate" * (${vatRateCase(GB_VAT, `0`)}))::float8 as "pseVatAmount"`,
        `(${toGBP(`ordr."commissionAmount"`)} * ordr."pseCommissionRate" * (${vatRateCase(GB_VAT, `0`)}))::float8 as "pseVatAmountGBP"`,
        `(ordr."commissionAmount" * ordr."pseCommissionRate" * (${vatRateCase(`${GB_VAT} + 1`, `1`)}))::float8 as "pseTotalAmount"`,
        `(${toGBP(`ordr."commissionAmount"`)} * ordr."pseCommissionRate" * (${vatRateCase(`${GB_VAT} + 1`, `1`)}))::float8 as "pseTotalAmountGBP"`,
        `(ordr."pseBalance" * (${vatRateCase(`${GB_VAT} + 1`, `1`)}))::float8 as "pseBalanceWithVat"`,
        `(${toGBP(`ordr."pseBalance"`)} * (${vatRateCase(`${GB_VAT} + 1`, `1`)}))::float8 as "pseBalanceWithVatGBP"`,
        `ordr."currency"`,
        `null as "convertedFromCurrency"`,
        `ordr."status" as "affiliateStatus"`,
        `ordr."autoApprovedAt"`,
        `ordr."manualStatus"`,
        `ordr."internalStatus"`,
        `ordr."psePaymentStatus"`,
        `ordr."manualPsePaymentStatus"`,
        `ordr."networkId"`,
        `ordr."advertiser"`,
        `ordr."pseCommissionRate"`,
        `ordr."pseCommissionRateClick"`,
        `ordr."retailerCommissionRate"`,
        `ordr."retailerCommissionRateClick"`,
        `ordr."notes"`,
        `ordr."affiliatePaymentStatus"`,
        `ordr."manualAffiliatePaymentStatus"`,
        `ordr."affiliatePaymentDate"`,
        `ordr."affiliateRefundStatus"`,
        `ordr."manualAffiliateRefundStatus"`,
        `ordr."details"`,
        `ordr."manualPseBalance"::float8 as "manualPseBalance"`,
        `${toGBP(`ordr."manualPseBalance"`)}::float8 as "manualPseBalanceGBP"`,
        `ordr."realPseBalance"::float8 as "realPseBalance"`,
        `${toGBP(`ordr."realPseBalance"`)}::float8 as "realPseBalanceGBP"`,
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
        `ordr."excluded"`,
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
        `"teamPaymentSettings"."vatEnabled" as "teamVatEnabled"`,
        `"teamPaymentSettings"."vatCountry" as "teamVatCountry"`,
        `"link"."hash" as "linkHash"`,
        `"link"."brand" as "linkBrand"`,
        `"link"."name" as "linkName"`,
        `"link"."retailer" as "linkRetailer"`,
        `(case when ordr."commissionAmount" > 0 and ordr."saleAmount" > 0 then ordr."commissionAmount" / ordr."saleAmount" else null end) as "retailerCommissionRateEffective"`,
        `(case when ordr."retailerCommissionRateClick" is not null and ordr."retailerCommissionRateClick" > 0 and ordr."pseCommissionRateClick" is not null and ordr."pseCommissionRateClick" > 0 then ordr."retailerCommissionRateClick" * ordr."pseCommissionRateClick" else null end) as "pseDisplayedCommissionRate"`,
        `(case when ordr."commissionAmount" > 0 then ordr."commissionAmount" - coalesce(ordr."commissionAmount" * ordr."pseCommissionRate", 0) else 0 end)::float8 as "revenueAmount"`,
        `${toGBP(`(case when ordr."commissionAmount" > 0 then ordr."commissionAmount" - coalesce(ordr."commissionAmount" * ordr."pseCommissionRate", 0) else 0 end)`)}::float8 as "revenueAmountGBP"`,
    ])
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

describe("reporting orders / wide projection depth", () => {
    it("is string-stable across the full ~90-column projection", () => {
        expect(typeof orders.toString()).toBe("string");
        expect(orders.toString()).toContain(`FROM "Network_Order" ordr`);
        expect(orders.toString()).toContain(`convert_currency`);
    });
});

// Type-level: the wide projection INFERS (constant-depth column mapping) rather
// than collapsing to {} or tripping TS2589.
type OrdersRow = SelectBuilderResult<typeof orders>;
type _OrdersRow = RequireTrue<
    AssertExtends<
        OrdersRow,
        {
            id: string;
            grossSaleAmount: number;
            pseGrossCommissionAmount: number;
            pseCommissionAmount: number;
            pseVatAmount: number;
            pseTotalAmount: number;
            pseBalanceWithVat: number;
            currency: string;
            affiliateStatus: string | null;
            networkId: string;
            archived: boolean;
            manualPseBalance: number | null;
            customerId: string | null;
            linkHash: string | null;
            pseEmail: string | null;
            retailerCommissionRateEffective: number | null;
            pseDisplayedCommissionRate: number | null;
            revenueAmount: number;
            revenueAmountGBP: number;
        }
    >
>;
