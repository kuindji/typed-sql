/**
 * ADVERSARIAL: validation false-accepts (the most dangerous failures).
 *
 * `ValidateSQLNormalized` SHORT-CIRCUITS to `true` for "high complexity"
 * queries: any query containing `offset`, the literal `snapshot_date`, or 5+
 * joins combined with order/group/limit; and any UPDATE containing
 * `case ... select` / `case ... exists (`. In those branches genuinely invalid
 * tables and columns are accepted. Each `ValidateSQL` below SHOULD be `false`.
 */

import type { ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema, WideSchema } from "./schemas.js";

// OFFSET present -> validation bypassed; invalid column accepted.
type N1 = ValidateSQL<"SELECT nonexistent_col FROM products OFFSET 5", DeepSchema>;
type _N1 = RequireTrue<AssertEqual<N1, false>>;

// OFFSET present -> invalid TABLE accepted.
type N2 = ValidateSQL<"SELECT id FROM no_such_table OFFSET 1", DeepSchema>;
type _N2 = RequireTrue<AssertEqual<N2, false>>;

// The literal token `snapshot_date` anywhere triggers the bypass.
type N3 = ValidateSQL<"SELECT bogus_col FROM orders WHERE snapshot_date = 1", WideSchema>;
type _N3 = RequireTrue<AssertEqual<N3, false>>;

// 5 joins + ORDER BY -> bypass; invalid select column accepted.
type N4 = ValidateSQL<
    "SELECT nonexistent FROM orders o JOIN users u ON o.user_id = u.id JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id JOIN payments pay ON pay.order_id = o.id JOIN shipments s ON s.order_id = o.id ORDER BY o.id",
    WideSchema
>;
type _N4 = RequireTrue<AssertEqual<N4, false>>;

// 5 joins + GROUP BY -> bypass; invalid qualified column accepted.
type N5 = ValidateSQL<
    "SELECT u.bogus FROM orders o JOIN users u ON o.user_id = u.id JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id JOIN payments pay ON pay.order_id = o.id JOIN shipments s ON s.order_id = o.id GROUP BY u.bogus",
    WideSchema
>;
type _N5 = RequireTrue<AssertEqual<N5, false>>;

// UPDATE containing CASE ... SELECT -> bypass; invalid SET column accepted.
type N6 = ValidateSQL<
    "UPDATE orders SET total = CASE WHEN total > (SELECT avg(total) FROM orders) THEN 1 ELSE 0 END, bogus_col = 5 WHERE id = 1",
    WideSchema
>;
type _N6 = RequireTrue<AssertEqual<N6, false>>;

// UPDATE with CASE ... EXISTS ( -> bypass; invalid table in WHERE accepted.
type N7 = ValidateSQL<
    "UPDATE orders SET total = CASE WHEN EXISTS (SELECT 1 FROM payments) THEN total ELSE 0 END WHERE bogus_col = 1",
    WideSchema
>;
type _N7 = RequireTrue<AssertEqual<N7, false>>;

// Control: the SAME invalid column WITHOUT a bypass trigger is correctly caught.
// (Confirms the bypass — not loose matching — is what breaks N1.)
type N8 = ValidateSQL<"SELECT nonexistent_col FROM products", DeepSchema>;
type _N8 = RequireTrue<AssertEqual<N8, false>>;

export type ValidationNegativeAdversarialLoaded = true;
