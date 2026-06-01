// tests/builder/types/db.test.ts
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";
import { createSelectFn } from "../../../src/builder/db.js";
import { createSelectQuery } from "../../../src/builder/select.js";

const select = createSelectFn<EcommerceSchema>((sql, params) =>
    Promise.resolve([] as any[]),
);

// Valid string query compiles and infers rows.
async function ok() {
    const rows = await select("SELECT id FROM Network_Order", []);
    const _r: { id: string }[] = rows;
    return _r;
}

// Invalid literal column is rejected.
// @ts-expect-error - notacol is not a column of Network_Order
const _bad = select("SELECT notacol FROM Network_Order", []);

// Valid builder compiles.
async function okBuilder() {
    const b = createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.id", "s0");
    const rows = await select(b);
    const _r: { id: string }[] = rows;
    return _r;
}

// Builder with an invalid literal alias-qualified column in a fully-literal
// builder IS rejected (no dynamic fragment → full ValidateSQL applies).
// @ts-expect-error - o.notacol is invalid
const _badBuilder = select(createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.notacol", "s0"));
