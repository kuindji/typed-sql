// Regression: an interpolation hole that degrades a JOIN-region token to wide
// `string` must NOT poison the outer-join nullable-qualifier set
// (`NullableRelations`).
//
// The nullability walker token-walks the assembled row SQL. When a `${string}`
// hole lands where a relation qualifier is expected, the token degrades to wide
// `string` and `CleanIdent<string>` = `Lowercase<string>`. If that wide form is
// allowed into the nullable set it becomes a SUPERTYPE of every alias, so
// `ApplyJoinNull` then unions `| null` onto EVERY plain column ref — including
// columns of the non-nullable FROM source, which no outer join can ever null.
//
// This surfaced in reporting-v2 `fetchOrders` (~85 projections over a deep
// LEFT-join chain): every plain `ordr."col"` inferred `| null` even though
// `Network_Order` is the driving relation. The `DropStr` guard in `CnJoinAcc`
// drops the wide form so only real literal aliases enter the set. (The sibling
// `CtDrive` walker for `TablesInQuery` documents and guards the same poison.)
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { NullableRelations } from "../../../src/tables.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";

// A LEFT join whose relation token is a `${string}` hole — the degraded shape a
// hole-bearing join region collapses to. Pre-fix this resolved the nullable set
// to `Lowercase<string>` (poisoning every qualifier match); the guard drops it.
type PoisonSQL = `select o."id" from "O" o left join ${string} on x = o."cid"`;
type Poisoned = NullableRelations<PoisonSQL, EcommerceSchema>;

// The wide-string poison (a supertype of every alias) must be absent.
type _NoWidePoison = RequireTrue<
    AssertEqual<Lowercase<string> extends Poisoned ? true : false, false>
>;

// The driving FROM source `o` must NOT be nullablized.
type _FromSourceNotNull = RequireTrue<
    AssertEqual<"o" extends Poisoned ? true : false, false>
>;

// Control: a clean LEFT join (no hole) still nullablizes exactly the joined
// alias — the guard drops only the wide form, never a real literal qualifier.
type CleanSQL = `select o."id", c."x" from "O" o left join "C" c on c."id" = o."cid"`;
type _CleanJoinedSet = RequireTrue<
    AssertEqual<NullableRelations<CleanSQL, EcommerceSchema>, "c">
>;
