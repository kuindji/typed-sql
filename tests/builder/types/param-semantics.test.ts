// tests/builder/types/param-semantics.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ExtractParams } from "../../../src/builder/extract-params.js";
import type { DriverParamValue } from "../../../src/builder/scanner.js";
import type { WriteSchema, User_id } from "../fixtures/write-schema.js";
import { asUserId } from "../fixtures/write-schema.js";

// §6.2 compatible reuse: same column twice → one key, the column type
type Dup1 = ExtractParams<
    "update orders set userId = :u where userId = :u", WriteSchema>;
type _Dup1 = RequireTrue<AssertEqual<Dup1["u"], User_id>>;

// §6.2 conflicting brands: intersection is unsatisfiable → key cannot be supplied
type Dup2 = ExtractParams<
    "delete from orders where userId = :id and id = :id", WriteSchema>;
// User_id & Order_id collapses (__table: "User" & "Order"); a plain value is rejected.
const _dup2bad = (v: Dup2) => v;
// @ts-expect-error no value satisfies User_id & Order_id
_dup2bad({ id: asUserId("x") });
void _dup2bad;

// §6.4 recognized vs loose
type Rec = ExtractParams<"delete from orders where amount = :a", WriteSchema>;
type _Rec = RequireTrue<AssertEqual<Rec, { a: number }>>;
type Loose = ExtractParams<"delete from orders where amount = any(:a)", WriteSchema>;
type _Loose = RequireTrue<AssertEqual<Loose, { a: DriverParamValue }>>;
