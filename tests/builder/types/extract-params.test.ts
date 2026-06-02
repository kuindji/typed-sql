// tests/builder/types/extract-params.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ExtractParams } from "../../../src/builder/extract-params.js";
import type {
    WriteSchema, User_id, Team_id, Order_id, Product_id,
} from "../fixtures/write-schema.js";
import { asUserId } from "../fixtures/write-schema.js";

// INSERT — positional column↔value pairing
type I1 = ExtractParams<
    "insert into orders (userId, amount, currency) values (:uid, :amt, :cur)", WriteSchema>;
type _I1 = RequireTrue<AssertEqual<I1, { uid: User_id; amt: number; cur: string }>>;

// branded FK + nullability
type I2 = ExtractParams<
    "insert into users (id, teamId, email) values (:id, :team, :email)", WriteSchema>;
type _I2 = RequireTrue<AssertEqual<I2, { id: User_id; team: Team_id | null; email: string }>>;

// non-:name fragments (literal/expr) contribute no param
type I3 = ExtractParams<
    "insert into orders (userId, amount, createdAt) values (:uid, 100, now())", WriteSchema>;
type _I3 = RequireTrue<AssertEqual<I3, { uid: User_id }>>;

// UPDATE set + where
type U1 = ExtractParams<
    "update orders set amount = :amt, currency = :cur where id = :oid", WriteSchema>;
type _U1 = RequireTrue<AssertEqual<U1, { amt: number; cur: string; oid: Order_id }>>;

// DELETE where incl. IN → array
type D2 = ExtractParams<"delete from products where id in (:ids)", WriteSchema>;
type _D2 = RequireTrue<AssertEqual<D2, { ids: Product_id[] }>>;

// ON CONFLICT DO UPDATE SET params resolve against target table
type C1 = ExtractParams<
    "insert into orders (id, amount) values (:id, :amt) on conflict (id) do update set amount = :amt2, currency = :cur",
    WriteSchema>;
type _C1 = RequireTrue<AssertEqual<C1, { id: Order_id; amt: number; amt2: number; cur: string }>>;

// excluded.col contributes no param; conflict WHERE param does
type C3 = ExtractParams<
    "insert into orders (id, amount) values (:id, :amt) on conflict (id) do update set amount = excluded.amount where amount > :floor",
    WriteSchema>;
type _C3 = RequireTrue<AssertEqual<C3, { id: Order_id; amt: number; floor: number }>>;

// array-VALUED column and JSON column flow through as the column type
type AR2 = ExtractParams<"update products set tags = :tags where id = :id", WriteSchema>;
type _AR2 = RequireTrue<AssertEqual<AR2, { tags: string[]; id: Product_id }>>;
type AR3 = ExtractParams<"update products set meta = :meta where id = :id", WriteSchema>;
type _AR3 = RequireTrue<AssertEqual<AR3, { meta: { sku: string }; id: Product_id }>>;

// Exact-brand enforcement at call sites
type InsP = ExtractParams<
    "insert into orders (userId, amount, currency) values (:uid, :amt, :cur)", WriteSchema>;
const _ok: InsP = { uid: asUserId("u1"), amt: 5, cur: "GBP" };
// @ts-expect-error plain string is not assignable to User_id (exact brand)
const _bad1: InsP = { uid: "u1", amt: 5, cur: "GBP" };
// @ts-expect-error number where string column expected
const _bad2: InsP = { uid: asUserId("u1"), amt: 5, cur: 123 };
void _ok; void _bad1; void _bad2;

import type { DriverParamValue } from "../../../src/builder/scanner.js";

// Reversed operand order → loose, present (not dropped)
type L1 = ExtractParams<"delete from orders where :p = amount", WriteSchema>;
type _L1 = RequireTrue<AssertEqual<L1, { p: DriverParamValue }>>;

// Placeholder inside a function → loose, present
type L2 = ExtractParams<"delete from orders where lower(currency) = :c", WriteSchema>;
type _L2 = RequireTrue<AssertEqual<L2, { c: DriverParamValue }>>;

// Placeholder in an arithmetic expression → loose; must NOT bind :n to amount
type L3 = ExtractParams<"delete from orders where amount + :n > 0", WriteSchema>;
type _L3 = RequireTrue<AssertEqual<L3, { n: DriverParamValue }>>;

// Sanity: the plain recognized shapes still bind precisely
type L4 = ExtractParams<"delete from orders where amount = :n", WriteSchema>;
type _L4 = RequireTrue<AssertEqual<L4, { n: number }>>;
type L5 = ExtractParams<"delete from orders where currency like :c", WriteSchema>;
type _L5 = RequireTrue<AssertEqual<L5, { c: string }>>;

type B1 = ExtractParams<"delete from orders where amount between :lo and :hi", WriteSchema>;
type _B1 = RequireTrue<AssertEqual<B1, { lo: number; hi: number }>>;

type B2 = ExtractParams<
    "delete from orders where amount between :lo and :hi and currency = :cur", WriteSchema>;
type _B2 = RequireTrue<AssertEqual<B2, { lo: number; hi: number; cur: string }>>;

type DN1 = ExtractParams<
    "update orders set paid = :paid where currency is distinct from :cur", WriteSchema>;
type _DN1 = RequireTrue<AssertEqual<DN1, { paid: boolean; cur: string }>>;

type DN2 = ExtractParams<
    "delete from orders where currency is not distinct from :cur", WriteSchema>;
type _DN2 = RequireTrue<AssertEqual<DN2, { cur: string }>>;
