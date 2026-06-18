/**
 * ADVERSARIAL: window functions / OVER(...) specs (round 2).
 *
 * Two concerns:
 *  - VALIDATION: columns inside OVER(PARTITION BY / ORDER BY ...) and inside
 *    FILTER(WHERE ...) sit BEFORE the top-level FROM, and the select-list treats
 *    `fn() OVER (...)` as a function call (no per-token validation). The loose
 *    ref-scan only covers from-FROM-onward, so invalid columns there escape.
 *  - RETURN TYPE: window function results stay `unknown` per the conservative
 *    contract (the alias/key survives) — kept as green controls.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// --- BUG: invalid column in PARTITION BY is not validated ---
type W1 = ValidateSQL<"SELECT row_number() OVER (PARTITION BY bogus_col) AS rn FROM users", WideSchema>;
type _W1 = RequireTrue<AssertEqual<W1, false>>;

// --- BUG: invalid column in the window ORDER BY is not validated ---
type W2 = ValidateSQL<"SELECT row_number() OVER (ORDER BY bogus_col) AS rn FROM users", WideSchema>;
type _W2 = RequireTrue<AssertEqual<W2, false>>;

// --- BUG: invalid column inside FILTER (WHERE ...) is not validated ---
type W3 = ValidateSQL<"SELECT count(*) FILTER (WHERE bogus_col > 0) AS c FROM users", WideSchema>;
type _W3 = RequireTrue<AssertEqual<W3, false>>;

// ===========================================================================
// CONTROLS
// ===========================================================================

// Valid window spec validates as true.
type C1 = ValidateSQL<"SELECT row_number() OVER (PARTITION BY name ORDER BY id) AS rn FROM users", WideSchema>;
type _C1 = RequireTrue<AssertEqual<C1, true>>;

// Valid FILTER clause validates as true.
type C2 = ValidateSQL<"SELECT count(*) FILTER (WHERE id > 0) AS c FROM users", WideSchema>;
type _C2 = RequireTrue<AssertEqual<C2, true>>;

// Window RANKING functions are unambiguously numeric in Postgres (bigint for
// row_number/rank/dense_rank), so they type as `number`, not `unknown`.
type C3 = QueryResult<"SELECT row_number() OVER (ORDER BY id) AS rn FROM users", WideSchema>;
type _C3 = RequireTrue<AssertEqual<C3, { rn: number }>>;

// Named window (WINDOW w AS (...)) — clause sits after FROM, so it validates.
type C4 = ValidateSQL<"SELECT row_number() OVER w AS rn FROM users WINDOW w AS (ORDER BY id)", WideSchema>;
type _C4 = RequireTrue<AssertEqual<C4, true>>;

export type WindowFunctionsAdversarialLoaded = true;
