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

// INSERT value wrapped in an expression → loose
type E1 = ExtractParams<
    "insert into orders (userId, currency) values (:uid, coalesce(:cur, ''))", WriteSchema>;
type _E1 = RequireTrue<AssertEqual<E1, { uid: User_id; cur: DriverParamValue }>>;

// SET RHS expression → loose
type E2 = ExtractParams<"update orders set amount = amount + :n where id = :oid", WriteSchema>;
type _E2 = RequireTrue<AssertEqual<E2, { n: DriverParamValue; oid: Order_id }>>;

// two placeholders in one RHS → both loose
type E3 = ExtractParams<
    "update orders set note = concat(:a, :b) where id = :oid", WriteSchema>;
type _E3 = RequireTrue<AssertEqual<E3, { a: DriverParamValue; b: DriverParamValue; oid: Order_id }>>;

// multi-row INSERT → params typed per tuple (each tuple zipped against the column list)
type MR1 = ExtractParams<
    "insert into orders (userId, amount) values (:a, 1), (:b, 2)", WriteSchema>;
type _MR1 = RequireTrue<AssertEqual<MR1, { a: User_id; b: User_id }>>;

// `),(` inside a string literal is NOT multi-row
type MR2 = ExtractParams<
    "insert into orders (userId, note) values (:uid, '),(')", WriteSchema>;
type _MR2 = RequireTrue<AssertEqual<MR2, { uid: User_id }>>;

// `),(` inside a nested parenthesised expression within ONE tuple is NOT multi-row
type MR3 = ExtractParams<
    "insert into orders (userId, amount) values (:uid, (1 + (2)))", WriteSchema>;
type _MR3 = RequireTrue<AssertEqual<MR3, { uid: User_id }>>;

// Multi-line `),\n(` (newline collapses to a space) is multi-row, typed per tuple
type MR4 = ExtractParams<
    "insert into orders (userId, amount)\nvalues (:a, 1),\n(:b, 2)", WriteSchema>;
type _MR4 = RequireTrue<AssertEqual<MR4, { a: User_id; b: User_id }>>;

// `),(` inside a dollar-quoted string is NOT multi-row
type MR5 = ExtractParams<
    "insert into orders (userId, note) values (:uid, $$),($$)", WriteSchema>;
type _MR5 = RequireTrue<AssertEqual<MR5, { uid: User_id }>>;

// `),(` inside a comment is NOT multi-row (NormalizeQuery strips comments first;
// this pins that the detector never sees the comment)
type MR6 = ExtractParams<
    "insert into orders (userId, amount) values (:uid, 1) /* ),( */", WriteSchema>;
type _MR6 = RequireTrue<AssertEqual<MR6, { uid: User_id }>>;
type MR7 = ExtractParams<
    "insert into orders (userId, amount) values (:uid, 1) -- ),(", WriteSchema>;
type _MR7 = RequireTrue<AssertEqual<MR7, { uid: User_id }>>;

// every position of every tuple gets its column's type
type MR8 = ExtractParams<
    "insert into orders (userId, amount) values (:u1, :a1), (:u2, :a2)", WriteSchema>;
type _MR8 = RequireTrue<AssertEqual<MR8, { u1: User_id; a1: number; u2: User_id; a2: number }>>;

// trailing ON CONFLICT / WHERE params keep their precise types alongside the tuples
type MR9 = ExtractParams<
    "insert into orders (id, amount) values (:i1, 1), (:i2, 2) on conflict (id) do update set amount = :amt where orders.id = :oid",
    WriteSchema>;
type _MR9 = RequireTrue<AssertEqual<MR9, { i1: Order_id; i2: Order_id; amt: number; oid: Order_id }>>;

// tuple cap (12): tuples beyond it degrade to loose DriverParamValue (never an error)
type MR10 = ExtractParams<
    "insert into orders (userId, amount) values (:p1,1),(:p2,1),(:p3,1),(:p4,1),(:p5,1),(:p6,1),(:p7,1),(:p8,1),(:p9,1),(:p10,1),(:p11,1),(:p12,1),(:p13,1)",
    WriteSchema>;
type _MR10 = RequireTrue<AssertEqual<MR10, {
    p1: User_id; p2: User_id; p3: User_id; p4: User_id; p5: User_id; p6: User_id;
    p7: User_id; p8: User_id; p9: User_id; p10: User_id; p11: User_id; p12: User_id;
    p13: unknown;
}>>;

// no-space `values(` form is detected and typed per tuple too
type MR11 = ExtractParams<
    "insert into orders (userId, amount) values(:a, 1), (:b, 2)", WriteSchema>;
type _MR11 = RequireTrue<AssertEqual<MR11, { a: User_id; b: User_id }>>;

// a string literal inside a tuple of a MULTI-row insert does not break tuple boundaries
type MR12 = ExtractParams<
    "insert into orders (userId, note) values (:a, 'x'), (:b, 'y')", WriteSchema>;
type _MR12 = RequireTrue<AssertEqual<MR12, { a: User_id; b: User_id }>>;

// a dollar-quoted body containing parens inside one tuple of a MULTI-row insert
// exercises the collector's dollar-quote arm (not just the detector's)
type MR13 = ExtractParams<
    "insert into orders (userId, note) values (:a, $$),($$), (:b, 'y')", WriteSchema>;
type _MR13 = RequireTrue<AssertEqual<MR13, { a: User_id; b: User_id }>>;

// target alias qualifier resolves against target table
type Q1 = ExtractParams<"update orders o set amount = :amt where o.id = :oid", WriteSchema>;
type _Q1 = RequireTrue<AssertEqual<Q1, { amt: number; oid: Order_id }>>;

// foreign qualifier (FROM alias) → loose, not mis-bound
type Q2 = ExtractParams<
    "update orders o set amount = :amt from users u where u.id = :uid and o.id = :oid", WriteSchema>;
type _Q2 = RequireTrue<AssertEqual<Q2, { amt: number; uid: DriverParamValue; oid: Order_id }>>;

// Mixed-case `:Name` param keys must survive normalization. The normalizer fast-paths
// all-lowercase-param queries through the `Lowercase<S>` intrinsic, but a camelCase
// param (lowercase first char, uppercase later) MUST route through the case-preserving
// walk so its `withParams` key is not folded (`:amtValue` → `amtValue`, not `amtvalue`).
type MC1 = ExtractParams<
    "update orders set amount = :amtValue, currency = :curCode where id = :orderId", WriteSchema>;
type _MC1 = RequireTrue<AssertEqual<MC1, { amtValue: number; curCode: string; orderId: Order_id }>>;
// Leading-uppercase param too (insert path)
type MC2 = ExtractParams<
    "insert into orders (userId, amount) values (:UID, :Amt)", WriteSchema>;
type _MC2 = RequireTrue<AssertEqual<MC2, { UID: User_id; Amt: number }>>;

// --- SELECT path: single-quoted literals are skipped, so a colon INSIDE a literal is
// never misread as a placeholder. The select sweep scans the WHOLE query (projection +
// WHERE), so these pin the literal-skip behavior in the PROJECTION (where only the sweep
// runs); real params outside literals are still captured, and the WHERE param keeps its
// precise column type. ---

// colon inside a projection string literal → not a param; real WHERE param still bound
type SL1 = ExtractParams<
    "select 'a:b' as lbl, currency from orders where currency = :cur", WriteSchema>;
type _SL1 = RequireTrue<AssertEqual<SL1, { cur: string }>>;

// escaped '' inside the literal degrades the same as the old strip → still no param
type SL2 = ExtractParams<
    "select 'it''s:fine' as lbl from orders where currency = :cur", WriteSchema>;
type _SL2 = RequireTrue<AssertEqual<SL2, { cur: string }>>;

// `'team:' || …` motivating case — the trailing colon in the literal is not :team
type SL3 = ExtractParams<
    "select 'team:' || note as lbl from orders where currency = :cur", WriteSchema>;
type _SL3 = RequireTrue<AssertEqual<SL3, { cur: string }>>;

// a real placeholder in the projection IS captured (loose), and `::cast` is skipped
type SL4 = ExtractParams<
    "select :raw::text as v from orders where currency = :cur", WriteSchema>;
type _SL4 = RequireTrue<AssertEqual<SL4, { raw: DriverParamValue; cur: string }>>;

// multiple adjacent literals around a real WHERE param: only the real param survives
type SL5 = ExtractParams<
    "select 'x:1', 'y:2' from orders where currency = :cur", WriteSchema>;
type _SL5 = RequireTrue<AssertEqual<SL5, { cur: string }>>;
