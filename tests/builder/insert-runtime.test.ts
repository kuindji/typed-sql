// tests/builder/insert-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createInsertQuery } from "../../src/builder/insert.js";
import type { ValidateSQL } from "../../src/index.js";
import type { WriteSchema } from "./fixtures/write-schema.js";
import { asUserId, asOrderId } from "./fixtures/write-schema.js";

// Type-level assertion helpers (mirror the integration fixtures).
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true
    : false;
type Expect<T extends true> = T;

describe("createInsertQuery", () => {
    it("assembles columns/values and expands params", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("userId", ":uid")
            .value("amount", ":amt")
            .value("createdAt", "now()")
            .returning("id")
            .withParams({ uid: asUserId("u1"), amt: 5 });
        expect(q.toString()).toBe(
            "insert into orders (userId, amount, createdAt) values ($1, $2, now()) returning id");
        expect([...q.getParams()]).toEqual(["u1", 5]);
    });

    it("includes a conditional value only when its flag is true", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("userId", ":uid")
            .valueIf(false, "note", ":note")
            .withParams({ uid: asUserId("u1") });
        expect(q.toString()).toBe("insert into orders (userId) values ($1)");
        expect([...q.getParams()]).toEqual(["u1"]);
    });

    it("appends onConflict params resolved against target table", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("id", ":id")
            .value("amount", ":amt")
            .onConflict("(id) do update set amount = :amt2")
            .withParams({ id: asOrderId("o1"), amt: 1, amt2: 2 });
        expect(q.toString()).toBe(
            "insert into orders (id, amount) values ($1, $2) on conflict (id) do update set amount = $3");
        expect([...q.getParams()]).toEqual(["o1", 1, 2]);
    });

    it("throws when all value fragments were conditional and excluded", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .valueIf(false, "userId", ":uid")
            .withParams({});
        expect(() => q.toString()).toThrow(/INSERT has no columns/);
    });

    it("supports INSERT ... SELECT", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .columns(`"id", "amount"`)
            .fromSelect(`select i."id", i."amount" from staging i where i."orderId" = :oid`)
            .onConflict("do nothing")
            .withParams({ oid: asOrderId("o1") });
        expect(q.toString()).toBe(
            `insert into orders ("id", "amount") ` +
            `select i."id", i."amount" from staging i where i."orderId" = $1 on conflict do nothing`);
        expect([...q.getParams()]).toEqual(["o1"]);
    });

    // Oracle for serverless/api/hasura-trigger/.../userApprovedPayment.ts
    // (Task 3.3): the migrated createPaymentItems INSERT…SELECT. Shape mirrors
    // the real query — a BARE projected param (`:uapId`, the FK being inserted,
    // not compared to any column), a multi-table join, a literal `(case … end)`
    // VAT expression in the projection, and a single WHERE param (`:oid`) bound
    // to the source item's order column. The two params appear in projection-then-
    // WHERE order, so getParams yields [uapId, oid] — matching the old positional
    // `[newRec.id, orderId]` the raw run() call passed.
    it("INSERT…SELECT with bare projected param + joined where param (oracle)", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .columns(`"userId", "amount", "currency"`)
            .fromSelect(
                `select :uapId, ` +
                `(o."amount" * (case when u."verified" is true then 0.2 else 0 end)) as "amount", ` +
                `o."currency" ` +
                `from orders o join users u on u."id" = o."userId" ` +
                `where o."id" = :oid`,
            )
            .withParams({ uapId: asUserId("u1"), oid: asOrderId("o1") });
        expect(q.toString()).toBe(
            `insert into orders ("userId", "amount", "currency") ` +
            `select $1, ` +
            `(o."amount" * (case when u."verified" is true then 0.2 else 0 end)) as "amount", ` +
            `o."currency" ` +
            `from orders o join users u on u."id" = o."userId" ` +
            `where o."id" = $2`,
        );
        expect([...q.getParams()]).toEqual(["u1", "o1"]);
    });

    // Type-level oracle: the concrete INSERT…SELECT is VALID SQL against the
    // schema (validates the column list, the joined SELECT, the case-expression
    // and the WHERE). Note: INSERT…SELECT param inference is intentionally
    // shallow — a bare projected `:param` (here `:uapId`, not compared to any
    // column) is not surfaced by ExtractParams and the WHERE param resolves
    // loosely — so the migrated call site passes a `string`-typed fromSelect and
    // supplies params via the runtime scanner (proven by the runtime oracle
    // above). What we pin here is that the statement is structurally valid.
    type CreatePaymentItemsSQL =
        `insert into orders ("userId", "amount", "currency") select :uapId, (o."amount" * (case when u."verified" is true then 0.2 else 0 end)) as "amount", o."currency" from orders o join users u on u."id" = o."userId" where o."id" = :oid`;
    type _ValidCreatePaymentItems = Expect<
        Equal<ValidateSQL<CreatePaymentItemsSQL, WriteSchema>, true>
    >;
});
