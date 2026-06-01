/**
 * ADVERSARIAL: high-complexity validation bypass (root cause C, round 2).
 *
 * `IsHighComplexitySelect` routes any query containing `offset`, the literal
 * token `snapshot_date`, or 5 joins + order/group/limit to the LIGHT validator,
 * which only checks tables + the SELECT/RETURNING list. Invalid columns in
 * WHERE / ORDER BY / GROUP BY / HAVING are therefore silently accepted.
 *
 * Each assertion below asserts the CORRECT Postgres/MySQL result. Lines marked
 * BUG are demonstrated false-accepts (library returns `true`).
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// --- BUG: invalid WHERE column accepted because of the `offset` trigger ---
type B1 = ValidateSQL<"SELECT id FROM products WHERE bogus_col = 1 OFFSET 5", WideSchema>;
type _B1 = RequireTrue<AssertEqual<B1, false>>;

// --- BUG: invalid *qualified* WHERE column accepted under `offset` ---
type B2 = ValidateSQL<"SELECT p.id FROM products p WHERE p.bogus_col = 1 OFFSET 5", WideSchema>;
type _B2 = RequireTrue<AssertEqual<B2, false>>;

// --- BUG: invalid ORDER BY column accepted under `offset` ---
type B3 = ValidateSQL<"SELECT id FROM products ORDER BY bogus_col OFFSET 5", WideSchema>;
type _B3 = RequireTrue<AssertEqual<B3, false>>;

// --- BUG: the magic `snapshot_date` token accepts a nonexistent column ---
type B4 = ValidateSQL<"SELECT id FROM products WHERE snapshot_date = 1", WideSchema>;
type _B4 = RequireTrue<AssertEqual<B4, false>>;

// --- BUG: invalid GROUP BY column accepted under `offset` ---
type B5 = ValidateSQL<"SELECT id FROM products GROUP BY bogus_col OFFSET 0", WideSchema>;
type _B5 = RequireTrue<AssertEqual<B5, false>>;

// --- BUG: invalid HAVING column accepted under group-by + offset bypass ---
type B6 = ValidateSQL<"SELECT category_id, count(*) FROM products GROUP BY category_id HAVING bogus_col > 1 OFFSET 0", WideSchema>;
type _B6 = RequireTrue<AssertEqual<B6, false>>;

// --- BUG: invalid WHERE column accepted under 5-join + ORDER BY bypass ---
type B7 = ValidateSQL<"SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id JOIN payments pay ON pay.order_id = o.id WHERE bogus_col = 1 ORDER BY u.id", WideSchema>;
type _B7 = RequireTrue<AssertEqual<B7, false>>;

// --- BUG: invalid WHERE column accepted under 5-join + LIMIT bypass ---
type B8 = ValidateSQL<"SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id JOIN payments pay ON pay.order_id = o.id WHERE bogus_col = 1 LIMIT 10", WideSchema>;
type _B8 = RequireTrue<AssertEqual<B8, false>>;

// ===========================================================================
// CONTROLS — these the library already gets right (kept to prove the bypass,
// not loose matching, is the defect).
// ===========================================================================

// Valid query with the same `offset` trigger -> true (no false reject).
type C1 = ValidateSQL<"SELECT id FROM products WHERE price > 1 OFFSET 5", WideSchema>;
type _C1 = RequireTrue<AssertEqual<C1, true>>;

// Same invalid WHERE column WITHOUT a bypass token -> correctly false.
type C2 = ValidateSQL<"SELECT id FROM products WHERE bogus_col = 1", WideSchema>;
type _C2 = RequireTrue<AssertEqual<C2, false>>;

// Bypass token but an invalid TABLE -> still false (tables are validated).
type C3 = ValidateSQL<"SELECT id FROM no_such_table WHERE snapshot_date = 1", WideSchema>;
type _C3 = RequireTrue<AssertEqual<C3, false>>;

// Bypass token with an invalid SELECT-LIST column -> false (list is validated).
type C4 = ValidateSQL<"SELECT bogus_col FROM products OFFSET 5", WideSchema>;
type _C4 = RequireTrue<AssertEqual<C4, false>>;

export type ValidationBypassAdversarialLoaded = true;
