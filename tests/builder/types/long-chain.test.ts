// tests/builder/types/long-chain.test.ts
import type { RequireTrue, AssertExtends } from "../../fixtures/helpers.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderReturnType } from "../../../src/builder/return-type.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";

const dyn: boolean = false;

// ~12 fluent calls incl. conditional selects, applies, params, ordering.
const big = createSelectQuery<EcommerceSchema>()
    .from("Network_Order o")
    .join("JOIN User_ApprovedPayment p ON p.orderId = o.id", "j0")
    .select("o.id", "s_id")
    .select("o.networkId", "s_net")
    .selectIf(dyn, "o.status", "s_status")
    .apply(b => b.where("o.saleAmount > 0", "w_amt"))
    .applyIf(dyn, b => b.select("o.currency", "s_cur"))
    .whereIf(dyn, "o.orderDate >= :from", "w_from")
    .whereIf(dyn, "o.orderDate <= :to", "w_to")
    .groupBy("o.id", "g0")
    .orderBy("o.orderDate", "ord0")
    .limit(50)
    .withParams({ from: "a", to: "b" });

type R = BuilderReturnType<typeof big>;
// Required keys present; conditional keys optional. Spot-check a required one.
type _RHasId = RequireTrue<AssertExtends<R, { id: string }>>;
