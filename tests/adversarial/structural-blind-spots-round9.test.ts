/**
 * ADVERSARIAL round 9: structural blind spots in shallow validation.
 *
 * These cases target places where the parser intentionally takes cheap
 * approximations: dropped DISTINCT ON lists, JOIN USING ownership checks,
 * parenthesized predicates in high-complexity UPDATEs, and comma marking in
 * table sources. The assertions below state the SQL semantics the public API
 * should expose; the current implementation returns the opposite result.
 */

import type { ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { WideSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// RED: DISTINCT ON expressions are part of the SELECT scope and should be
// validated. The current StripDistinct helper removes the whole ON-list before
// expression validation, and the FROM-onward ref scan never sees it.
// ---------------------------------------------------------------------------

type D1 = ValidateSQL<"SELECT DISTINCT ON (bogus_col) id FROM products", WideSchema>;
type _D1 = RequireTrue<AssertEqual<D1, false>>;

// Controls: valid DISTINCT ON should still pass, and invalid projection columns
// are still caught because the projection itself is validated after stripping.
type D_OK1 = ValidateSQL<"SELECT DISTINCT ON (category_id) id FROM products", WideSchema>;
type _D_OK1 = RequireTrue<AssertEqual<D_OK1, true>>;

type D_OK2 = ValidateSQL<"SELECT DISTINCT ON (category_id) bogus_col FROM products", WideSchema>;
type _D_OK2 = RequireTrue<AssertEqual<D_OK2, false>>;

// ---------------------------------------------------------------------------
// RED: JOIN ... USING(col) must require the column on both sides of that join.
// The current proxy only checks whether any two tables in the whole query have
// the column, so an unrelated later table can mask an invalid USING pair.
// ---------------------------------------------------------------------------

type J1 = ValidateSQL<
    "SELECT orders.id FROM orders JOIN users USING (status) JOIN products ON products.id = orders.id",
    WideSchema
>;
type _J1 = RequireTrue<AssertEqual<J1, false>>;

// Controls: the same invalid USING pair is rejected when no later table masks
// it, and a real shared USING column remains valid.
type J_OK1 = ValidateSQL<"SELECT orders.id FROM orders JOIN users USING (status)", WideSchema>;
type _J_OK1 = RequireTrue<AssertEqual<J_OK1, false>>;

type J_OK2 = ValidateSQL<"SELECT id FROM orders JOIN payments USING (id)", WideSchema>;
type _J_OK2 = RequireTrue<AssertEqual<J_OK2, true>>;

// ---------------------------------------------------------------------------
// RED: high-complexity UPDATE validates only simple top-level WHERE predicates.
// A parenthesized predicate such as IN (...) is skipped entirely, so a bogus
// top-level column is accepted.
// ---------------------------------------------------------------------------

type U1 = ValidateSQL<
    "UPDATE orders SET total = CASE WHEN EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id) THEN 1 ELSE 0 END WHERE bogus_col IN (1, 2)",
    WideSchema
>;
type _U1 = RequireTrue<AssertEqual<U1, false>>;

// Controls: the same high-complexity shape catches a simple invalid WHERE, and
// a valid parenthesized predicate remains accepted.
type U_OK1 = ValidateSQL<
    "UPDATE orders SET total = CASE WHEN EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id) THEN 1 ELSE 0 END WHERE bogus_col = 1",
    WideSchema
>;
type _U_OK1 = RequireTrue<AssertEqual<U_OK1, false>>;

type U_OK2 = ValidateSQL<
    "UPDATE orders SET total = CASE WHEN EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id) THEN 1 ELSE 0 END WHERE id IN (1, 2)",
    WideSchema
>;
type _U_OK2 = RequireTrue<AssertEqual<U_OK2, true>>;

// ---------------------------------------------------------------------------
// RED: quoted table aliases may contain commas. MarkTopLevelCommas is not
// double-quote-aware, so it treats the comma inside the alias as a FROM-source
// separator and rejects a valid query.
// ---------------------------------------------------------------------------

type A1 = ValidateSQL<'SELECT id FROM users AS "u,1"', WideSchema>;
type _A1 = RequireTrue<AssertEqual<A1, true>>;

// Control: the same quoted alias shape works when there is no comma to confuse
// top-level comma marking.
type A_OK1 = ValidateSQL<'SELECT "u1".id FROM users AS "u1"', WideSchema>;
type _A_OK1 = RequireTrue<AssertEqual<A_OK1, true>>;

export type StructuralBlindSpotsRound9Loaded = true;
