// tests/builder/types/insert-types.test.ts
import { createInsertQuery } from "../../../src/builder/insert.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asUserId } from "../fixtures/write-schema.js";

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
