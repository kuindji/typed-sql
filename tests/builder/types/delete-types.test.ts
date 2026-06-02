// tests/builder/types/delete-types.test.ts
import { createDeleteQuery } from "../../../src/builder/delete.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asProductId } from "../fixtures/write-schema.js";

createDeleteQuery<WriteSchema>()
    .from("products")
    .where("id in (:ids)")
    .withParams({ ids: [asProductId("p1"), asProductId("p2")] });   // Product_id[]

createDeleteQuery<WriteSchema>()
    .from("orders")
    .where("id = :id")
    .whereIf(true, "paid = :paid")          // conditional → paid optional
    .withParams({ id: "o1" as any });       // paid omitted → ok
