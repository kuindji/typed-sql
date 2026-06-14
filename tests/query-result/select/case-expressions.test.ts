/**
 * CASE expression typing.
 *
 * A `CASE … END` expression is typed as the union of its first `THEN` branch
 * and its `ELSE` branch (SQL requires all branches to be union-compatible, so
 * one THEN + the ELSE captures the type). When there is no `ELSE`, unmatched
 * rows yield NULL, so `| null` is added. Branch exprs are typed by the same
 * engine as a first-hand SELECT projection (literals widen to their base type,
 * columns/casts/functions/nested CASE all resolve). The alias/key is always
 * preserved. Ambiguous branches still fall back to `unknown`.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// Searched CASE, every branch a bare string literal -> the PRESERVED literal
// union (was `string` before the all-literal-arm pass). All arms are scanned, so
// every THEN literal plus the ELSE literal contributes.
type C1 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN 'expensive' ELSE 'cheap' END AS tier FROM products",
    DeepSchema
>;
type _C1 = RequireTrue<AssertEqual<C1, { tier: "expensive" | "cheap" }>>;

// Simple CASE, numeric branches -> number
type C2 = QueryResult<
    "SELECT CASE status WHEN 'active' THEN 1 ELSE 0 END AS flag FROM products",
    DeepSchema
>;
type _C2 = RequireTrue<AssertEqual<C2, { flag: number }>>;

// CASE over columns -> union of THEN (price: number) and ELSE (discount:
// number | null) -> number | null
type C3 = QueryResult<
    "SELECT CASE WHEN discount IS NULL THEN price ELSE discount END AS effective FROM products",
    DeepSchema
>;
type _C3 = RequireTrue<AssertEqual<C3, { effective: number | null }>>;

// CASE without ELSE -> THEN type plus `| null` (unmatched rows are NULL)
type C4 = QueryResult<
    "SELECT CASE WHEN price > 0 THEN name END AS maybe_name FROM products",
    DeepSchema
>;
type _C4 = RequireTrue<AssertEqual<C4, { maybe_name: string | null }>>;

// Nested CASE -> the THEN branch is itself a CASE (string), ELSE 'c' (string)
type C5 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN CASE WHEN quantity > 0 THEN 'a' ELSE 'b' END ELSE 'c' END AS x FROM products",
    DeepSchema
>;
type _C5 = RequireTrue<AssertEqual<C5, { x: string }>>;

// CASE inside an aggregate -> number; `| null` because the query is ungrouped
// (zero rows -> NULL), applied by ApplyUngroupedAggNull
type C6 = QueryResult<
    "SELECT sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count FROM products",
    DeepSchema
>;
type _C6 = RequireTrue<AssertEqual<C6, { active_count: number | null }>>;

// A branch column from the nullable side of an OUTER join carries `| null`,
// exactly as it would as a first-hand projection. THEN `e.id` (events.id is
// non-null in the schema, but left-joined -> number | null), ELSE 0 -> number.
type C7 = QueryResult<
    "SELECT CASE WHEN u.is_active THEN e.id ELSE 0 END AS v FROM users u LEFT JOIN analytics.events e ON e.user_id = u.id",
    DeepSchema
>;
type _C7 = RequireTrue<AssertEqual<C7, { v: number | null }>>;

// KNOWN LIMITATION (documented tradeoff): only the FIRST THEN and the ELSE are
// typed. A *non-first* THEN branch that is nullable (here `discount`) does not
// contribute its `| null` — the result is typed from THEN1 (0 -> number) and
// ELSE (0 -> number). SQL would allow NULL via the middle branch. Typing every
// branch would cost N ExprType calls; the conservative-null gap in this rare
// shape is the accepted trade (same philosophy as ungrouped-aggregate nulls).
// Recover precision with `coalesce(..., 0)` or wrap the value as needed.
type C8 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN 0 WHEN price < 50 THEN discount ELSE 0 END AS x FROM products",
    DeepSchema
>;
type _C8 = RequireTrue<AssertEqual<C8, { x: number }>>;

// All-string-literal searched CASE across MANY arms (the canonical "enum
// mapping" shape, e.g. reporting's click `sourceType`): every THEN literal plus
// the ELSE contributes, so the column infers the exact literal union instead of
// the hand-written one. With `ELSE null`, the null comes from the ELSE arm (no
// extra `| null` added).
type C9 = QueryResult<
    "SELECT CASE WHEN a IS NOT NULL THEN 'moodboard' WHEN b IS NOT NULL THEN 'styling' WHEN c IS NOT NULL THEN 'link' WHEN d IS NOT NULL THEN 'catalogue' ELSE null END AS source FROM products",
    DeepSchema
>;
type _C9 = RequireTrue<
    AssertEqual<
        C9,
        { source: "moodboard" | "styling" | "link" | "catalogue" | null }
    >
>;

// All-string-literal searched CASE with NO ELSE -> the literal union plus
// `| null` (unmatched rows are NULL).
type C10 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN 'hi' WHEN price > 50 THEN 'mid' END AS tier FROM products",
    DeepSchema
>;
type _C10 = RequireTrue<AssertEqual<C10, { tier: "hi" | "mid" | null }>>;

// MIXED arms: a string literal in one branch, a (string) COLUMN in another.
// Not all-literal -> falls back to the widening behavior; the literal is
// absorbed by `string` either way. Stays `string`.
type C11 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN 'expensive' ELSE name END AS label FROM products",
    DeepSchema
>;
type _C11 = RequireTrue<AssertEqual<C11, { label: string }>>;

// Searched CASE with NUMERIC literal arms is NOT narrowed (only string literals
// are preserved) -> widens to `number`, exactly as before.
type C12 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN 1 ELSE 0 END AS flag FROM products",
    DeepSchema
>;
type _C12 = RequireTrue<AssertEqual<C12, { flag: number }>>;

export type CaseAdversarialLoaded = true;
