/**
 * ADVERSARIAL ROUND 3: return types of template-literal queries.
 *
 * Real code builds SQL from interpolated values. When the interpolated piece is
 * a concrete literal (`const c = "price" as const`) the query string is a
 * precise literal type and the column is fully inferrable. When it is widened to
 * `string` (e.g. a `let` binding, or any non-`const` value) the interpolated
 * span becomes `${string}` and that fragment is NOT inferrable — per the
 * library's contract it should degrade to `unknown` / be dropped, NOT poison the
 * result. A trailing `::cast` should still rescue the type.
 *
 * The library handles the inferrable cases (see the green controls) but mishandles
 * the non-inferrable ones: a bare `${string}` projection collapses the whole row
 * to `never`, and an explicitly *named* runtime fragment (`${string} AS x`) is
 * silently dropped instead of surfacing as `{ x: unknown }`.
 *
 * Every actual value below was confirmed by probing the compiler.
 */

import type { GetReturnType, QueryResult } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// RED — non-inferrable interpolation mishandled
// ---------------------------------------------------------------------------

// A bare runtime fragment as the whole select list. Nothing is knowable, so the
// result should be the empty/unknown shape `{}` — NOT `never` (actual).
type R1 = QueryResult<`select ${string} from products`, DeepSchema>;
type _R1 = RequireTrue<AssertEqual<R1, {}>>;

// The column is explicitly NAMED `x` even though its value is unknowable, so the
// output column should survive as `{ x: unknown }`. Actual: `{}` (alias dropped).
type R2 = QueryResult<`select ${string} as x from products`, DeepSchema>;
type _R2 = RequireTrue<AssertEqual<R2, { x: unknown }>>;

// A valid sibling plus a named runtime fragment. Expected `{ id: number; y: unknown }`.
// Actual: `{ id: number }` (the named fragment `y` is dropped).
type R3 = QueryResult<`select id, ${string} as y from products`, DeepSchema>;
type _R3 = RequireTrue<AssertEqual<R3, { id: number; y: unknown }>>;

// ---------------------------------------------------------------------------
// GREEN controls — the inferrable cases already work correctly
// ---------------------------------------------------------------------------

// Concrete literal interpolation -> precise column (price is a number column).
type G1 = QueryResult<`select ${"price"} from products`, DeepSchema>;
type _G1 = RequireTrue<AssertEqual<G1, { price: number }>>;

// Literal interpolated inside an aggregate argument, aliased.
type G2 = QueryResult<`select count(${"id"}) as c from products`, DeepSchema>;
type _G2 = RequireTrue<AssertEqual<G2, { c: number }>>;

// A runtime fragment rescued by an explicit cast -> the cast type wins.
type G3 = QueryResult<`select ${string}::int as n from products`, DeepSchema>;
type _G3 = RequireTrue<AssertEqual<G3, { n: number }>>;

// A concrete column plus an unknowable fragment: the fragment contributes
// nothing and the resolved column stands. (Correct.)
type G4 = QueryResult<`select ${"id"}, ${string} from products`, DeepSchema>;
type _G4 = RequireTrue<AssertEqual<G4, { id: number }>>;

export type TemplateLiteralProjectionAdversarialLoaded = true;
