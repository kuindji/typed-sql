// tests/builder/types/insert-types.test.ts
import { createInsertQuery } from "../../../src/builder/insert.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asUserId, asOrderId } from "../fixtures/write-schema.js";

// unconditional uid required (exact brand), conditional note optional
createInsertQuery<WriteSchema>()
    .into("orders")
    .value("userId", ":uid")
    .valueIf(true, "note", ":note")
    .withParams({ uid: asUserId("u1") });               // note omitted → ok (optional)

createInsertQuery<WriteSchema>()
    .into("orders")
    .value("userId", ":uid")
    // @ts-expect-error plain string is not assignable to User_id
    .withParams({ uid: "u1" });

// INSERT...SELECT chain: `.columns<C>()`/`.fromSelect<Q>()` capture into the tag and
// `WriteParamsFor` resolves the `:oid` from the SELECT body as a required param.
createInsertQuery<WriteSchema>()
    .into("orders")
    .columns(`"id", "amount"`)
    .fromSelect(`select i."id", i."amount" from staging i where i."orderId" = :oid`)
    .onConflict("do nothing")
    .withParams({ oid: asOrderId("o1") });

createInsertQuery<WriteSchema>()
    .into("orders")
    .columns(`"id", "amount"`)
    .fromSelect(`select i."id", i."amount" from staging i where i."orderId" = :oid`)
    .onConflict("do nothing")
    // @ts-expect-error oid is a required param of the SELECT body
    .withParams({});
