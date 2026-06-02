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
