/**
 * ADVERSARIAL: set operations UNION / UNION ALL / INTERSECT / EXCEPT (round 2).
 *
 * Result columns take their names/types from the FIRST branch; every branch must
 * validate. These mostly exercise situations the library already handles (green
 * controls), extending the single UNION case in `subqueries-ctes.test.ts`.
 */

import type { QueryResult, ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { WideSchema } from "./schemas.js";

// UNION — result shape from the first branch.
type U1 = QueryResult<"SELECT id FROM users UNION SELECT id FROM orders", WideSchema>;
type _U1 = RequireTrue<AssertEqual<U1, { id: number }>>;

// UNION ALL — same.
type U2 = QueryResult<"SELECT id FROM users UNION ALL SELECT id FROM orders", WideSchema>;
type _U2 = RequireTrue<AssertEqual<U2, { id: number }>>;

// INTERSECT — first-branch shape.
type U3 = QueryResult<"SELECT id FROM users INTERSECT SELECT order_id FROM payments", WideSchema>;
type _U3 = RequireTrue<AssertEqual<U3, { id: number }>>;

// EXCEPT — first-branch shape.
type U4 = QueryResult<"SELECT id FROM users EXCEPT SELECT id FROM orders", WideSchema>;
type _U4 = RequireTrue<AssertEqual<U4, { id: number }>>;

// Invalid column in the 2nd branch is rejected (UNION).
type U5 = ValidateSQL<"SELECT id FROM users UNION SELECT bogus FROM orders", WideSchema>;
type _U5 = RequireTrue<AssertEqual<U5, false>>;

// Invalid column in the 2nd branch is rejected (INTERSECT).
type U6 = ValidateSQL<"SELECT id FROM users INTERSECT SELECT bogus FROM orders", WideSchema>;
type _U6 = RequireTrue<AssertEqual<U6, false>>;

// Invalid column in the 2nd branch is rejected (EXCEPT).
type U7 = ValidateSQL<"SELECT id FROM users EXCEPT SELECT bogus FROM orders", WideSchema>;
type _U7 = RequireTrue<AssertEqual<U7, false>>;

// Fully valid 3-branch union validates as true.
type U8 = ValidateSQL<"SELECT id FROM users UNION SELECT user_id FROM orders UNION SELECT order_id FROM payments", WideSchema>;
type _U8 = RequireTrue<AssertEqual<U8, true>>;

export type SetOperationsAdversarialLoaded = true;
