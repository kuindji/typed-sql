// Regression: a row-NEUTRAL clause built from non-literal `string` (a dynamic
// GROUP BY key, a runtime ORDER BY, an interpolated WHERE) must NOT widen the
// assembled row SQL to `string` and collapse the inferred row to `{}`. The row
// is a function of SELECT + FROM/JOIN only; `BuildRowSQL` drops/normalizes the
// row-neutral clauses so their (often dynamic) text is irrelevant to inference.
// See reporting-v2 fetchOrdersGroupped (a dense aggregate query whose GROUP BY
// key is chosen at runtime from a Record<…, string>).
import type { RequireTrue, AssertExtends } from "../../fixtures/helpers.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderReturnType } from "../../../src/builder/return-type.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";

// A runtime-chosen grouping key, typed `string` (mirrors `groupByFields[key]`
// over a `Record<Group, string>`): the value the bug hinges on.
const groupKey: string = "o.networkId";
const orderExpr: string = "o.orderDate desc";
const whereExpr: string = "o.saleAmount > 0";

// --- Minimal case: a single dynamic GROUP BY / ORDER BY / WHERE -------------
const grouped = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .select([
        `sum(o.saleAmount)::float8 as "saleAmount"`,
        `count(*)::float8 as "count"`,
        `(${groupKey})::text as "group"`,
    ])
    .where(whereExpr)
    .groupBy(groupKey)
    .orderBy(orderExpr);

type GroupedRow = BuilderReturnType<typeof grouped>;
// The row must carry the projected columns — NOT collapse to {}.
type _GroupedInfers = RequireTrue<
    AssertExtends<GroupedRow, { saleAmount: number; count: number }>
>;

// --- Deep chain + dynamic GROUP BY (the fetchOrdersGroupped shape) ----------
const dyn: boolean = false;
const deep = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .select([
        `sum(o.saleAmount)::float8 as "saleAmount"`,
        `sum(o.commissionAmount)::float8 as "commissionAmount"`,
        `count(*)::float8 as "count"`,
    ])
    .apply(b => b.join("left join User_ApprovedPayment p on p.orderId = o.id", "jp"))
    .applyIf(dyn, b => b.select(`(${groupKey})::text as "group"`, "group").groupBy(groupKey).orderBy(orderExpr))
    .applyIf(dyn, b => b.where(whereExpr, "w"))
    .applyIf(dyn, b => b.offsetIf(true, 0).limitIf(true, 50));

type DeepRow = BuilderReturnType<typeof deep>;
type _DeepInfers = RequireTrue<
    AssertExtends<DeepRow, { saleAmount: number; commissionAmount: number; count: number }>
>;
