// Feasibility spike probes — must compile under the project's STRICT tsconfig
// (run via `npx tsc --noEmit`, NOT a standalone `tsc probe.ts`).
// Throwaway — delete after the spike.

import type { Schema, User_id, Team_id, Order_id, Product_id } from "./schema.js";
import { asUserId } from "./schema.js";
import type { ExtractParams, ExtractReturning } from "./extract-params.js";

type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
        ? true : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------
type I1 = ExtractParams<
    "insert into orders (userId, amount, currency) values (:uid, :amt, :cur)",
    Schema
>;
type _I1 = Expect<Equal<I1, { uid: User_id; amt: number; cur: string }>>;

type I2 = ExtractParams<
    "insert into users (id, teamId, email) values (:id, :team, :email)",
    Schema
>;
type _I2 = Expect<Equal<I2, { id: User_id; team: Team_id | null; email: string }>>;

type I3 = ExtractParams<
    "insert into orders (userId, amount, createdAt) values (:uid, 100, now())",
    Schema
>;
type _I3 = Expect<Equal<I3, { uid: User_id }>>;

// ---------------------------------------------------------------------------
// UPDATE — set assignments + where
// ---------------------------------------------------------------------------
type U1 = ExtractParams<
    "update orders set amount = :amt, currency = :cur where id = :oid",
    Schema
>;
type _U1 = Expect<Equal<U1, { amt: number; cur: string; oid: Order_id }>>;

// branded FK in SET + branded id in WHERE
type U2 = ExtractParams<
    "update orders set userId = :uid, paid = :paid where userId = :owner",
    Schema
>;
type _U2 = Expect<Equal<U2, { uid: User_id; paid: boolean; owner: User_id }>>;

// ---------------------------------------------------------------------------
// DELETE — where, incl. IN (array)
// ---------------------------------------------------------------------------
type D1 = ExtractParams<
    "delete from orders where userId = :uid and amount > :min",
    Schema
>;
type _D1 = Expect<Equal<D1, { uid: User_id; min: number }>>;

type D2 = ExtractParams<
    "delete from products where id in (:ids)",
    Schema
>;
type _D2 = Expect<Equal<D2, { ids: Product_id[] }>>;

// ---------------------------------------------------------------------------
// SELECT — where params (single-table scope)
// ---------------------------------------------------------------------------
type S1 = ExtractParams<
    "select id, amount from orders where userId = :uid and currency = :cur",
    Schema
>;
type _S1 = Expect<Equal<S1, { uid: User_id; cur: string }>>;

// ---------------------------------------------------------------------------
// RETURNING — result row typing
// ---------------------------------------------------------------------------
type R1 = ExtractReturning<
    "insert into orders (userId, amount) values (:uid, :amt) returning id, currency",
    Schema
>;
type _R1 = Expect<Equal<R1, { id: Order_id; currency: string }>>;

type R2 = ExtractParams<
    "update orders set amount = :amt where id = :oid returning id, amount",
    Schema
>;
type _R2 = Expect<Equal<R2, { amt: number; oid: Order_id }>>;
type R2r = ExtractReturning<
    "update orders set amount = :amt where id = :oid returning id, amount",
    Schema
>;
type _R2r = Expect<Equal<R2r, { id: Order_id; amount: number }>>;

// ---------------------------------------------------------------------------
// Exact-brand enforcement at call sites
// ---------------------------------------------------------------------------
type InsParams = ExtractParams<
    "insert into orders (userId, amount, currency) values (:uid, :amt, :cur)",
    Schema
>;
const _ok1: InsParams = { uid: asUserId("u1"), amt: 5, cur: "GBP" };
// @ts-expect-error plain string is not assignable to User_id (exact brand).
const _bad1: InsParams = { uid: "u1", amt: 5, cur: "GBP" };
// @ts-expect-error number where string column expected.
const _bad2: InsParams = { uid: asUserId("u1"), amt: 5, cur: 123 };
void _ok1; void _bad1; void _bad2;

// ---------------------------------------------------------------------------
// DEPTH STRESS — many wide-table queries stacked in one module (simulating a
// real lambda file). If param inference is going to blow TS2589, it shows here.
// ---------------------------------------------------------------------------
type W1 = ExtractParams<"insert into users (id, teamId, email, name, phone, status, age, score, verified, createdAt) values (:id, :team, :email, :name, :phone, :status, :age, :score, :verified, :created)", Schema>;
type W2 = ExtractParams<"insert into orders (id, userId, productId, teamId, invoiceId, amount, currency, quantity, note, paid) values (:id, :uid, :pid, :team, :inv, :amt, :cur, :qty, :note, :paid)", Schema>;
type W3 = ExtractParams<"update users set email = :email, name = :name, phone = :phone, status = :status, age = :age, score = :score, verified = :verified where id = :id and teamId = :team", Schema>;
type W4 = ExtractParams<"update orders set amount = :amt, currency = :cur, quantity = :qty, note = :note, paid = :paid where userId = :uid and id = :oid", Schema>;
type W5 = ExtractParams<"select id, email, name, status from users where teamId = :team and status = :status and age > :minage and verified = :verified", Schema>;
type W6 = ExtractParams<"delete from orders where userId = :uid and currency = :cur and amount > :min and paid = :paid", Schema>;
type W7 = ExtractReturning<"insert into orders (userId, amount, currency, quantity, note, paid) values (:uid, :amt, :cur, :qty, :note, :paid) returning id, userId, amount, currency, createdAt", Schema>;
type _W1 = Expect<Equal<W1["team"], Team_id | null>>;
type _W2 = Expect<Equal<W2["uid"], User_id>>;
type _W3 = Expect<Equal<W3["team"], Team_id | null>>;
type _W4 = Expect<Equal<W4["oid"], Order_id>>;
type _W5 = Expect<Equal<W5["team"], Team_id | null>>;
type _W6 = Expect<Equal<W6["uid"], User_id>>;
type _W7 = Expect<Equal<W7["id"], Order_id>>;

export {};
