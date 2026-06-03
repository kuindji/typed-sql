// tests/builder/types/scope-aware-validation.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import { createSelectFn } from "../../../src/builder/db.js";

const select = createSelectFn<EcommerceSchema>(() => Promise.resolve([]));

// Heavy, fully-literal builder query. Mirrors the projection/JOIN weight that
// blows the whole-query ValidateSQL pass.
const heavy = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .join("Network_Order_CJ_Item ci on ci.orderId = o.id", "j0")
    .join("Network_Payment_CJ pc on pc.id = o.id", "j1")
    .join("Network_Order_Snapshot os on os.orderId = o.orderId", "j2")
    .join("Network_Order_Partnerize_Item pi on pi.orderId = o.id", "j3")
    .join("Network_Order_Rakuten_Item ri on ri.orderId = o.id", "j4")
    .join("User_ApprovedPayment ap on ap.networkOrderId = o.id", "j5")
    .join("Revolut_PaymentDraft rd on rd.id = o.id", "j6")
    .join("Revolut_PaymentInvoice rin on rin.paymentId = o.id", "j7")
    .join("Network_Partnerize_Selfbill sb on sb.id = o.id", "j8")
    .join("Network_Payment_CJ_Order cjo on cjo.orderId = o.orderId", "j9")
    .join("LogProductClick lpc on lpc.id = o.clickId", "j10")
    .select("o.id", "s0")
    .select("coalesce(o.correctedSaleAmount, o.saleAmount) as saleAmount", "s1")
    .select("coalesce(o.correctedCommissionAmount, o.commissionAmount) as commissionAmount", "s2")
    .select("case when o.status = 'approved' then o.pseBalance else 0 end as pseBalance", "s3")
    .select("coalesce(o.correctedGrossSaleAmount, o.grossSaleAmount) as grossSaleAmount", "s4")
    .select("coalesce(o.correctedGrossCommissionAmount, o.grossCommissionAmount) as grossCommissionAmount", "s5")
    .select("(o.pseCommissionRate)::text as pseRate", "s6")
    .select("case when o.manualStatus is not null then o.manualStatus else o.internalStatus end as effectiveStatus", "s7")
    .select("coalesce(ci.itemCommission, 0) as itemCommission", "s8")
    .select("coalesce(ci.itemValue, 0) as itemValue", "s9")
    .select("case when o.psePaymentStatus = 'paid' then o.commissionAmount else 0 end as paidCommission", "s10")
    .select("coalesce(o.correctedGrossSaleAmount, o.grossSaleAmount, 0) as grossSaleAmount2", "s11")
    .select("case when o.affiliatePaymentStatus is not null then o.affiliatePaymentStatus else o.revolutPaymentStatus end as effectivePayStatus", "s12")
    .select("coalesce(pi.itemCommission, pi.commissionAmount, 0) as partnerizeCommission", "s13")
    .select("case when os.status = 'cancelled' then o.cancelledItemsCount else o.itemsCount end as effectiveItems", "s14")
    .select("(o.retailerCommissionRate)::text as retailerRate", "s15")
    .select("coalesce(ci.saleAmount, ci.grossSaleAmount, 0) as cjSale", "s16")
    .select("coalesce(ri.saleAmount, ri.grossSaleAmount, 0) as rakutenSale", "s17")
    .select("case when ap.paid then ap.amount else 0 end as approvedPaid", "s18")
    .select("coalesce(ap.amount, 0) as approvedAmount", "s19")
    .select("(rd.amount)::text as draftAmount", "s20")
    .select("case when rd.status = 'completed' then rd.amount else 0 end as completedDraft", "s21")
    .select("coalesce(pi.itemValue, pi.saleAmount, 0) as partnerizeValue", "s22")
    .select("case when o.manualPsePaymentStatus is not null then o.manualPsePaymentStatus else o.psePaymentStatus end as effectivePse", "s23")
    .select("coalesce(o.correctedSaleAmount, o.correctedGrossSaleAmount, o.saleAmount) as anySale", "s24")
    .select("case when o.revolutPaymentStatus = 'paid' then o.pseBalance else o.commissionAmount end as balanceOrCommission", "s25")
    .select("(o.pseCommissionRateClick)::text as clickRate", "s26")
    .select("coalesce(ri.commissionAmount, ri.grossCommissionAmount, 0) as rakutenCommission", "s27")
    .select("(rin.amount)::text as invoiceAmount", "s28")
    .select("case when rin.status = 'paid' then rin.amount else rin.vat end as invoiceNet", "s29")
    .select("coalesce(sb.netValue, sb.totalValue, 0) as selfbillNet", "s30")
    .select("case when sb.status = 'paid' then sb.totalValue else sb.netValue end as selfbillEffective", "s31")
    .select("case when cjo.manuallyAssigned then o.commissionAmount else o.grossCommissionAmount end as cjoCommission", "s32")
    .select("coalesce(lpc.userCountry, lpc.userAgent) as clickMeta", "s33")
    .select("case when lpc.isBot then o.saleAmount else o.grossSaleAmount end as botAdjustedSale", "s34")
    .select("coalesce(o.correctedCommissionAmount, o.correctedGrossCommissionAmount, o.commissionAmount) as anyCommission", "s35")
    .select("case when o.affiliateRefundStatus is not null then o.affiliateRefundStatus else o.manualAffiliateRefundStatus end as effectiveRefund", "s36")
    .select("(o.retailerCommissionRateClick)::text as retailerClickRate", "s37")
    .select("coalesce(ap.vat, rin.vat, 0) as anyVat", "s38")
    .select("case when rd.currency = 'GBP' then rd.amount else rd.vat end as draftNet", "s39")
    .where("o.advertiser = :adv", "w0")
    .where("o.orderDate >= :from", "w1")
    .groupBy("o.id", "g0")
    .groupBy("ci.id", "g1");

const _heavy = select(heavy);
void _heavy;

import type { ScopeTables, ScopeAliases } from "../../../src/builder/db.js";
import type { SqlOf } from "../../../src/builder/return-type.js";
import type { ResolveAlias } from "../../../src/columns.js";

const scoped = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .join("Network_Order_CJ_Item ci on ci.orderId = o.id", "j0")
    .select("o.id", "s0");
type ScopedSql = SqlOf<typeof scoped>;

// The scope map resolves the `o` alias to its table (NOT never).
type _AliasOResolves = RequireTrue<AssertEqual<
    [ResolveAlias<"o", ScopeAliases<ScopedSql, EcommerceSchema>>] extends [never] ? false : true,
    true
>>;
// The `ci` alias also resolves.
type _AliasCiResolves = RequireTrue<AssertEqual<
    [ResolveAlias<"ci", ScopeAliases<ScopedSql, EcommerceSchema>>] extends [never] ? false : true,
    true
>>;
// ScopeTables is non-never (some table key was collected).
type _TablesNonNever = RequireTrue<AssertEqual<
    [ScopeTables<ScopedSql, EcommerceSchema>] extends [never] ? false : true,
    true
>>;

import type { ValidateClausePartScoped } from "../../../src/partial.js";
import type { ScopeTables as ST, ScopeAliases as SA } from "../../../src/builder/db.js";

const wq = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .join("Network_Order_CJ_Item ci on ci.orderId = o.id", "j0")
    .select("o.id", "s0");
type WqSql = SqlOf<typeof wq>;

// A real alias-qualified column → valid (true).
type _WhereOk = RequireTrue<AssertEqual<
    ValidateClausePartScoped<"o.advertiser = :adv", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    true
>>;
// An alias-qualified TYPO → invalid (false). This is the class today's code misses.
type _WhereBad = RequireTrue<AssertEqual<
    ValidateClausePartScoped<"o.notacol = :adv", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    false
>>;
// An out-of-scope / unknown alias → skipped (lenient → true).
type _WhereSkip = RequireTrue<AssertEqual<
    ValidateClausePartScoped<"zz.whatever = :x", ST<WqSql, EcommerceSchema>, SA<WqSql, EcommerceSchema>, EcommerceSchema>,
    true
>>;
