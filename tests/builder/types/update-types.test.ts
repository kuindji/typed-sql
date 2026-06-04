// tests/builder/types/update-types.test.ts
import { createUpdateQuery } from "../../../src/builder/update.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asOrderId } from "../fixtures/write-schema.js";

createUpdateQuery<WriteSchema>()
    .table("orders")
    .set("amount = :amt")
    .setIf(true, "currency = :cur")          // conditional → cur optional
    .where("id = :oid")
    .withParams({ amt: 5, oid: asOrderId("o1") });  // cur omitted → ok

createUpdateQuery<WriteSchema>()
    .table("orders")
    .set("amount = :amt")
    .where("id = :oid")
    // @ts-expect-error number where Order_id expected
    .withParams({ amt: 5, oid: 1 });

// ---- WITH/CTE prefix: the CTE body's `:param` is threaded to typed params ----

// Positive: the CTE-body `:k`, plus SET `:amt` and WHERE `:oid`, all compile.
// `materialized = true` exercises the literal-`M` path (Fix 1).
createUpdateQuery<WriteSchema>()
    .with("_lock", "select pg_advisory_xact_lock(:k) as _", true)
    .table("orders")
    .set("amount = :amt")
    .where('"id" = :oid')
    .withParams({ k: 7, amt: 1, oid: asOrderId("o1") });

// Negative: omitting the CTE-body param `k` is a type error — proving `:k` is
// REQUIRED in the params object (i.e. extracted from the CTE body).
createUpdateQuery<WriteSchema>()
    .with("_lock", "select pg_advisory_xact_lock(:k) as _", true)
    .table("orders")
    .set("amount = :amt")
    .where('"id" = :oid')
    // @ts-expect-error CTE-body param `k` is required but omitted
    .withParams({ amt: 1, oid: asOrderId("o1") });
