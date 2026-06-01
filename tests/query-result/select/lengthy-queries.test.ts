/**
 * ADVERSARIAL: long queries that hit hard char/step caps.
 *
 * `ExtractBeforeFromTopLevel` caps at 350 characters and then falls back to
 * `ExtractBefore<S, " from ">` (first occurrence). A select list longer than
 * 350 chars that contains a subquery with its own `from` therefore truncates
 * incorrectly. Wide projections also stress the merge/split step caps.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// Long select list (>350 chars before FROM) ending in a scalar subquery whose
// inner `from` defeats the naive fallback. Correct projection is 24 numeric
// aliases plus the subquery count.
type L1 = QueryResult<
    "SELECT o.id AS a01, o.id AS a02, o.id AS a03, o.id AS a04, o.id AS a05, o.id AS a06, o.id AS a07, o.id AS a08, o.id AS a09, o.id AS a10, o.id AS a11, o.id AS a12, o.id AS a13, o.id AS a14, o.id AS a15, o.id AS a16, o.id AS a17, o.id AS a18, o.id AS a19, o.id AS a20, o.id AS a21, o.id AS a22, o.id AS a23, o.id AS a24, (SELECT count(*) FROM payments p WHERE p.order_id = o.id) AS pc FROM orders o",
    WideSchema
>;
type _L1 = RequireTrue<
    AssertEqual<
        L1,
        {
            a01: number; a02: number; a03: number; a04: number; a05: number; a06: number;
            a07: number; a08: number; a09: number; a10: number; a11: number; a12: number;
            a13: number; a14: number; a15: number; a16: number; a17: number; a18: number;
            a19: number; a20: number; a21: number; a22: number; a23: number; a24: number;
            pc: number;
        }
    >
>;

// Subquery in the select list earlier in a long list also truncates parsing.
type L2 = QueryResult<
    "SELECT (SELECT max(amount) FROM payments p WHERE p.order_id = o.id) AS top_pay, o.id, o.user_id, o.address_id, o.status, o.total, o.created_at FROM orders o",
    WideSchema
>;
type _L2 = RequireTrue<
    AssertEqual<
        L2,
        {
            top_pay: number;
            id: number;
            user_id: number;
            address_id: number;
            status: "pending" | "paid" | "shipped" | "cancelled";
            total: number;
            created_at: string;
        }
    >
>;

// A long chain of OR predicates must not change the projection.
type L3 = QueryResult<
    "SELECT id FROM orders WHERE total > 1 OR total > 2 OR total > 3 OR total > 4 OR total > 5 OR total > 6 OR total > 7 OR total > 8 OR total > 9 OR total > 10 OR total > 11 OR total > 12 OR total > 13 OR total > 14 OR total > 15 OR total > 16 OR total > 17 OR total > 18 OR total > 19 OR total > 20",
    WideSchema
>;
type _L3 = RequireTrue<AssertEqual<L3, { id: number }>>;

export type LengthyAdversarialLoaded = true;
