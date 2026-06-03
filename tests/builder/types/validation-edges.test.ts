// tests/builder/types/validation-edges.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import { createSelectFn } from "../../../src/builder/db.js";
import type { AnySqlTag } from "../../../src/builder/sql-tag.js";
import type { SelectQueryBuilder } from "../../../src/builder/select.js";
import type { BuilderSQL, BuilderReturnType } from "../../../src/builder/return-type.js";

const select = createSelectFn<EcommerceSchema>(() => Promise.resolve([]));

const dynStr: string = "Network_Order o"; // non-literal fragment text

// --- F3: non-literal fragment text → accepted, untyped row ({}) ---
const fDyn = createSelectQuery<EcommerceSchema>().from(dynStr).select("o.id", "s0");
type RowDyn = BuilderReturnType<typeof fDyn>;
type _RowDynEmpty = RequireTrue<AssertEqual<RowDyn, {}>>;
// accepted (compiles) by createSelectFn — calling WITHOUT a cast IS the
// assertion. ValidQueryBuilder's allow-unknown path returns B, so this
// type-checks; if it ever stops compiling, the guard is broken. (A cast here
// would make the test pass even if the guard were wrong — so no cast.)
const _accepted = select(fDyn);
void _accepted;

// genuinely invalid literal in a FULLY-literal builder IS rejected:
// @ts-expect-error - notacol is not a real column
const _rejected = select(createSelectQuery<EcommerceSchema>().from("Network_Order").select("notacol", "s0"));
void _rejected;

// --- F-C: mixed builder (one dynamic fragment) ---
//   real-table-qualified invalid column IS still rejected:
// @ts-expect-error - Network_Order.notacol invalid (caught by Validate*Part)
const _mixedRejected = select(createSelectQuery<EcommerceSchema>().from(dynStr).select("Network_Order.notacol", "s0"));
void _mixedRejected;
//   alias-qualified invalid column is NOW REJECTED: the scope map is built from
//   the literal FROM/JOIN fragments, so `o.notacol` resolves and fails even when
//   another fragment (where) is dynamic. (Previously this compiled — per-fragment
//   validation had no alias scope. Scope-aware FragmentErrors changed that.)
//   The error surfaces on the builder argument passed to select(...) (the builder
//   becomes a SQL-Error string), so the directive sits on that argument line.
const _mixedRejected2 = select(
    // @ts-expect-error - o.notacol invalid (caught by scope-aware FragmentErrors)
    createSelectQuery<EcommerceSchema>()
        .from("Network_Order o")
        .where(dynStr)
        .select("o.notacol", "s0"),
);
void _mixedRejected2;

// --- F-helper: generic helper preserves full row type ---
function setPeriod<S extends EcommerceSchema, Sql extends AnySqlTag>(
    b: SelectQueryBuilder<S, Sql>,
) {
    return b
        .whereIf(true, "o.orderDate >= :from", "p_from")
        .whereIf(true, "o.orderDate <= :to", "p_to");
}
const helped = setPeriod(
    createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.id", "s0"),
);
const unhelped = createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.id", "s0");
type _HelperRow = RequireTrue<
    AssertEqual<BuilderReturnType<typeof helped>, BuilderReturnType<typeof unhelped>>
>;

// --- F4: two SQL forms differ once params are used ---
const pq = createSelectQuery<EcommerceSchema>()
    .from("Network_Order")
    .where("id = :id")
    .withParams({ id: "x" });
// BuilderSQL keeps the raw :name form (withParams does not feed the tag):
type _BuilderSQLRaw = RequireTrue<
    AssertEqual<BuilderSQL<typeof pq>, "SELECT * FROM Network_Order WHERE id = :id">
>;
