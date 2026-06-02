// tests/builder/types/createsql.test.ts
import { createSql } from "../../../src/builder/sql.js";
import type { WriteSchema } from "../fixtures/write-schema.js";
import { asOrderId } from "../fixtures/write-schema.js";

const sql = createSql<WriteSchema>();

// exact brand required
sql("delete from orders where id = :id").withParams({ id: asOrderId("o1") });
// @ts-expect-error plain string is not Order_id
sql("delete from orders where id = :id").withParams({ id: "o1" });

// multi-row INSERT cannot be parameterized (params type is an error object)
// @ts-expect-error multi-row VALUES rejected in typed path
sql("insert into orders (userId, amount) values (:a, 1), (:b, 2)").withParams({ a: "x", b: "y" });
