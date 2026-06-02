// tests/builder/types/extract-returning.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ExtractReturning } from "../../../src/builder/extract-params.js";
import type { WriteSchema, Order_id } from "../fixtures/write-schema.js";

type R1 = ExtractReturning<
    "insert into orders (userId, amount) values (:uid, :amt) returning id, currency", WriteSchema>;
type _R1 = RequireTrue<AssertEqual<R1, { id: Order_id; currency: string }>>;

type R2 = ExtractReturning<
    "update orders set amount = :amt where id = :oid returning id, amount", WriteSchema>;
type _R2 = RequireTrue<AssertEqual<R2, { id: Order_id; amount: number }>>;

// no RETURNING → {}
type R3 = ExtractReturning<"delete from orders where id = :id", WriteSchema>;
type _R3 = RequireTrue<AssertEqual<R3, {}>>;

// returning * → full row
type R4 = ExtractReturning<"delete from products where id = :id returning *", WriteSchema>;
type _R4 = RequireTrue<AssertEqual<R4["id"], import("../fixtures/write-schema.js").Product_id>>;

// aliased RETURNING column → aliased key (proves GetReturnType reuse, not a
// hand-rolled column map that would mis-key `id as orderId`). The reused
// GetReturnType folds the UNQUOTED alias to lowercase per Postgres semantics, so
// the key is `orderid`, not `orderId` — the value is still the branded Order_id.
type R5 = ExtractReturning<
    "update orders set amount = :amt where id = :oid returning id as orderId", WriteSchema>;
type _R5 = RequireTrue<AssertEqual<R5, { orderid: Order_id }>>;
