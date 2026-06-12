// tests/builder/types/createsql.test.ts
import { createSql } from "../../../src/builder/sql.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asOrderId, asUserId } from "../fixtures/write-schema.js";

const sql = createSql<WriteSchema>();

// exact brand required
sql("delete from orders where id = :id").withParams({ id: asOrderId("o1") });
// @ts-expect-error plain string is not Order_id
sql("delete from orders where id = :id").withParams({ id: "o1" });

// multi-row INSERT params are typed per tuple
sql("insert into orders (userId, amount) values (:a, 1), (:b, 2)")
    .withParams({ a: asUserId("u1"), b: asUserId("u2") });
sql("insert into orders (userId, amount) values (:a, 1), (:b, 2)")
    // @ts-expect-error plain string is not User_id (param in the SECOND tuple)
    .withParams({ a: asUserId("u1"), b: "u2" });
