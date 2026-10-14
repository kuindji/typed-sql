/**
 * TSQL-1 — a range alias that equals the name of ANOTHER schema table (compared
 * case-insensitively) shadows that table, as in Postgres. `from "User" customer`
 * with a "Customer" table in the schema used to resolve `customer.x` to BOTH
 * tables, rejecting the query and typing every column `unknown`. Type-level: this
 * file compiling is the test.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import { createSql } from "../../../src/builder/sql.js";
import type { BuilderReturnType } from "../../../src/builder/return-type.js";

type S = { defaultSchema: "public"; schemas: { public: {
    User: { id: string; givenName: string; teamId: string };
    Team: { id: string; name: string };
    Link: { id: string; url: string };
    Customer: { id: string; userId: string; tier: number };
    Order: { id: string; customerUserId: string };
} } };

// A1 — the reported repro: unquoted, quoted, `as`, and several colliding names.
type A1a = ValidateSQL<`select customer."givenName" as "n" from "User" customer`, S>;
type _A1a = RequireTrue<AssertEqual<A1a, true>>;
type A1b = ValidateSQL<`select "customer"."givenName" as "n" from "User" as "customer"`, S>;
type _A1b = RequireTrue<AssertEqual<A1b, true>>;
type A1c = ValidateSQL<`select team."givenName" as "n" from "User" team`, S>;
type _A1c = RequireTrue<AssertEqual<A1c, true>>;
type A1d = ValidateSQL<`select link."givenName" as "n" from "User" link`, S>;
type _A1d = RequireTrue<AssertEqual<A1d, true>>;
type A1e = ValidateSQL<`select "Team"."givenName" as "n" from "User" "Team"`, S>;
type _A1e = RequireTrue<AssertEqual<A1e, true>>;
type A1Row = GetReturnType<`select customer."givenName" as "n" from "User" customer`, S>;
type _A1Row = RequireTrue<AssertEqual<A1Row, { n: string }>>;
type A1QRow = GetReturnType<`select "Team"."givenName" as "n" from "User" "Team"`, S>;
type _A1QRow = RequireTrue<AssertEqual<A1QRow, { n: string }>>;

// A2 — in a JOIN, including outer-join nullability keyed by the colliding alias.
type A2a = ValidateSQL<`select o.id, customer."givenName" from "Order" o left join "User" as customer on customer.id = o."customerUserId" where customer."teamId" = $1 order by customer."givenName"`, S>;
type _A2a = RequireTrue<AssertEqual<A2a, true>>;
type A2Row = GetReturnType<`select o.id, customer."givenName" from "Order" o left join "User" customer on customer.id = o."customerUserId"`, S>;
type _A2Row = RequireTrue<AssertEqual<A2Row, { id: string; givenName: string | null }>>;
type A2Star = GetReturnType<`select customer.* from "Order" o left join "User" customer on customer.id = o."customerUserId"`, S>;
type _A2Star = RequireTrue<AssertEqual<A2Star, { id: string | null; givenName: string | null; teamId: string | null }>>;
// The shadowed table itself, joined under a different alias, still resolves.
type A2b = GetReturnType<`select c.tier, customer."givenName" from "User" customer join "Customer" c on c."userId" = customer.id`, S>;
type _A2b = RequireTrue<AssertEqual<A2b, { tier: number; givenName: string }>>;

// A3 — the alias resolves to the aliased table only: the shadowed table's
// columns and unknown columns are still rejected.
type A3a = ValidateSQL<`select customer.tier from "User" customer`, S>;
type _A3a = RequireTrue<AssertEqual<A3a, false>>;
type A3b = ValidateSQL<`select customer.nope from "User" customer`, S>;
type _A3b = RequireTrue<AssertEqual<A3b, false>>;

// A4 — write targets.
type A4a = ValidateSQL<`update "User" customer set "givenName" = $1 where customer.id = $2 returning customer."givenName"`, S>;
type _A4a = RequireTrue<AssertEqual<A4a, true>>;
type A4b = ValidateSQL<`delete from "User" customer where customer.id = $1`, S>;
type _A4b = RequireTrue<AssertEqual<A4b, true>>;
const sql = createSql<S>();
// @ts-expect-error - customer.id is "User".id (string), not a number
sql(`update "User" customer set "givenName" = :g where customer.id = :id`).withParams({ g: "x", id: 1 });

// A5 — the builder's join.
const b = createSelectQuery<S>()
    .from(`"Order" o`)
    .join(`left join "User" customer on customer.id = o."customerUserId"`)
    .select(`customer."givenName"`);
type _A5 = RequireTrue<AssertEqual<BuilderReturnType<typeof b>, { givenName: string | null }>>;
