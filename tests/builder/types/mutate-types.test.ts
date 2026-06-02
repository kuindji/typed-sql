// tests/builder/types/mutate-types.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import { createMutateFn } from "../../../src/builder/mutate.js";
import { createInsertQuery } from "../../../src/builder/insert.js";
import type { WriteSchema, Order_id } from "../fixtures/write-schema.js";
import { asUserId } from "../fixtures/write-schema.js";

// A real runtime value (not `declare const`): bun executes files under
// tests/builder/types/, so a phantom binding would throw ReferenceError.
const mutate = createMutateFn<WriteSchema>(async () => []);

// with RETURNING → typed Row[]
const q = createInsertQuery<WriteSchema>()
    .into("orders").value("userId", ":uid").value("amount", ":amt").returning("id")
    .withParams({ uid: asUserId("u1"), amt: 5 });
// Derive the row type from the actual call (the object overload resolves to
// Promise<MutationReturnType<typeof q>[]>); an instantiation expression on the
// overloaded `mutate` would trip the raw-string overload's `Q extends string`.
const _rows = mutate(q);
type Rows = Awaited<typeof _rows>;
type _Rows = RequireTrue<AssertEqual<Rows, { id: Order_id }[]>>;
void _rows;

// raw overload is brand-checked
mutate("insert into orders (userId) values (:uid) returning id", { uid: asUserId("u1") });
// @ts-expect-error plain string is not assignable to User_id
mutate("insert into orders (userId) values (:uid) returning id", { uid: "u1" });
