/**
 * ARITHMETIC & operator expression typing (CONSERVATIVE CONTRACT).
 *
 * Typed shapes (unambiguous in Postgres, so contract-legal):
 * - `||` is string concatenation -> string.
 * - Top-level `A op B` for op in {+, -, *, /, %} types `number` when BOTH
 *   operands type `number` (`| null` propagates from either side — SQL NULL
 *   arithmetic is NULL). number op number is numeric in Postgres; the
 *   interval/date hazards require a non-number operand, which the schema
 *   types as non-number, so the both-number case cannot be ambiguous.
 *   Operands are found by a top-level scan (quote- and paren-aware), so
 *   function calls, parenthesized sub-expressions, and literals all work as
 *   operands and the typing recurses through chains (`a + b * c`).
 *
 * Everything else stays `unknown`:
 * - any operand that doesn't type number (or that the parser can't resolve
 *   — an unresolvable operand degrades to unknown, it does NOT reject);
 * - unary minus (`-price`);
 * - unmodeled operators (`<<`, `&`, single `|`, `^`, `||/`, ...) — a
 *   top-level unmodeled operator char aborts the scan conservatively;
 * - CASE and unmodeled functions as operands (they type unknown).
 *
 * Aliases/keys are always preserved; only the value type varies.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema, WideSchema } from "../../fixtures/parser-schemas.js";

// price * quantity -> number (both operands number)
type A1 = QueryResult<"SELECT price * quantity AS total FROM products", DeepSchema>;
type _A1 = RequireTrue<AssertEqual<A1, { total: number }>>;

// addition with a nullable operand -> number | null (NULL propagates)
type A2 = QueryResult<"SELECT price + discount AS net FROM products", DeepSchema>;
type _A2 = RequireTrue<AssertEqual<A2, { net: number | null }>>;

// subtraction with a nullable operand -> number | null
type A3 = QueryResult<"SELECT price - discount AS net FROM products", DeepSchema>;
type _A3 = RequireTrue<AssertEqual<A3, { net: number | null }>>;

// division by a number column -> number
type A4 = QueryResult<"SELECT price / quantity AS unit FROM products", DeepSchema>;
type _A4 = RequireTrue<AssertEqual<A4, { unit: number }>>;

// modulo -> number
type A5 = QueryResult<"SELECT quantity % 2 AS parity FROM products", DeepSchema>;
type _A5 = RequireTrue<AssertEqual<A5, { parity: number }>>;

// parenthesized arithmetic -> recurses; discount is nullable -> number | null
type A6 = QueryResult<"SELECT (price + discount) * quantity AS grand FROM products", DeepSchema>;
type _A6 = RequireTrue<AssertEqual<A6, { grand: number | null }>>;

// column + integer literal -> number
type A7 = QueryResult<"SELECT price + 10 AS bumped FROM products", DeepSchema>;
type _A7 = RequireTrue<AssertEqual<A7, { bumped: number }>>;

// string concatenation operator -> string
type A8 = QueryResult<"SELECT name || '!' AS shout FROM products", DeepSchema>;
type _A8 = RequireTrue<AssertEqual<A8, { shout: string }>>;

// concat of two columns -> string
type A9 = QueryResult<"SELECT name || status AS label FROM products", DeepSchema>;
type _A9 = RequireTrue<AssertEqual<A9, { label: string }>>;

// unary negation -> unknown (no left operand; not modeled)
type A10 = QueryResult<"SELECT -price AS neg FROM products", DeepSchema>;
type _A10 = RequireTrue<AssertEqual<A10, { neg: unknown }>>;

// aggregate / aggregate -> number; `| null` because the query is ungrouped
// (zero rows → sum is NULL → the whole arithmetic is NULL)
type A11 = QueryResult<"SELECT sum(price) / count(id) AS avg_price FROM products", DeepSchema>;
type _A11 = RequireTrue<AssertEqual<A11, { avg_price: number | null }>>;

// bit shift / bitwise -> unknown (unmodeled operator)
type A12 = QueryResult<"SELECT quantity << 1 AS doubled FROM products", DeepSchema>;
type _A12 = RequireTrue<AssertEqual<A12, { doubled: unknown }>>;

// --- division pins (Tier 1, all still hold) ---

// number column / numeric literal -> number
type A13 = QueryResult<"SELECT price / 10 AS unit FROM products", DeepSchema>;
type _A13 = RequireTrue<AssertEqual<A13, { unit: number }>>;

// nullable number column / numeric literal -> number | null (NULL / 2 is NULL)
type A14 = QueryResult<"SELECT discount / 2 AS half FROM products", DeepSchema>;
type _A14 = RequireTrue<AssertEqual<A14, { half: number | null }>>;

// non-number left side -> unknown (conservative)
type A15 = QueryResult<"SELECT name / 2 AS bad FROM products", DeepSchema>;
type _A15 = RequireTrue<AssertEqual<A15, { bad: unknown }>>;

// string literal containing a slash is NOT mistaken for division -> string
type A16 = QueryResult<"SELECT 'a/b' AS s FROM products", DeepSchema>;
type _A16 = RequireTrue<AssertEqual<A16, { s: string }>>;

// extract(epoch from non-null col) / literal -> number (the pseAgg cohort shape)
type A17 = QueryResult<"SELECT extract(epoch FROM created_at) / 86400 AS days FROM products", DeepSchema>;
type _A17 = RequireTrue<AssertEqual<A17, { days: number }>>;

// column divisor with a typed left side -> number (Tier 2 lifts the
// Tier-1 numeric-literal-divisor restriction)
type A18 = QueryResult<"SELECT price / quantity AS ratio FROM products", DeepSchema>;
type _A18 = RequireTrue<AssertEqual<A18, { ratio: number }>>;

// --- Tier 2: operands on both sides of the Func-branch dispatch ---

// column + function call (op BEFORE the first paren) -> number
type A19 = QueryResult<"SELECT price + count(id) AS bumped FROM products", DeepSchema>;
type _A19 = RequireTrue<AssertEqual<A19, { bumped: number }>>;

// function call + literal (doesn't end in `)`, fallback-slot path) -> number
type A20 = QueryResult<"SELECT count(id) + 1 AS next FROM products", DeepSchema>;
type _A20 = RequireTrue<AssertEqual<A20, { next: number }>>;

// nullable column * literal -> number | null
type A21 = QueryResult<"SELECT discount * 2 AS twice FROM products", DeepSchema>;
type _A21 = RequireTrue<AssertEqual<A21, { twice: number | null }>>;

// `||` whose right operand is a function call (expr ends in `)`) -> string
type A22 = QueryResult<"SELECT name || upper(status) AS label FROM products", DeepSchema>;
type _A22 = RequireTrue<AssertEqual<A22, { label: string }>>;

// operator chars hidden inside a quoted function arg are data -> string
type A23 = QueryResult<"SELECT upper('a + b') AS s FROM products", DeepSchema>;
type _A23 = RequireTrue<AssertEqual<A23, { s: string }>>;

// single `|` (bitwise, unmodeled) at top level aborts -> unknown
type A24 = QueryResult<"SELECT price | quantity AS bits FROM products", DeepSchema>;
type _A24 = RequireTrue<AssertEqual<A24, { bits: unknown }>>;

// single `|` at depth > 0 is data; the top-level `+` still types -> number.
// `| null`: the unmodeled argument types `unknown` (may include null) AND the
// query is ungrouped — both push the conservative null.
type A25 = QueryResult<"SELECT sum(price | quantity) + 1 AS r FROM products", DeepSchema>;
type _A25 = RequireTrue<AssertEqual<A25, { r: number | null }>>;

// `||/` (cube root) must NOT be mistaken for string concat -> unknown
type A26 = QueryResult<"SELECT ||/ count(id) AS root FROM products", DeepSchema>;
type _A26 = RequireTrue<AssertEqual<A26, { root: unknown }>>;

// chained arithmetic recurses through the right side -> number
type A27 = QueryResult<"SELECT price + quantity * 2 AS combo FROM products", DeepSchema>;
type _A27 = RequireTrue<AssertEqual<A27, { combo: number }>>;

// --- `||` NULL propagation (soundness) --------------------------------------
// SQL `a || b` is NULL when ANY operand is NULL. `tracking` is `string | null`,
// so every concat that includes it is `string | null` — regardless of operand
// position, an intervening literal, or a function-call operand. Previously these
// wrongly typed non-null `string` (an unsound claim: the value can be NULL).

// nullable operand on the left / right
type A28 = QueryResult<"SELECT tracking || carrier AS v FROM shipments", WideSchema>;
type _A28 = RequireTrue<AssertEqual<A28, { v: string | null }>>;
type A29 = QueryResult<"SELECT carrier || tracking AS v FROM shipments", WideSchema>;
type _A29 = RequireTrue<AssertEqual<A29, { v: string | null }>>;

// nullable in the middle of a chain
type A30 = QueryResult<"SELECT carrier || tracking || carrier AS v FROM shipments", WideSchema>;
type _A30 = RequireTrue<AssertEqual<A30, { v: string | null }>>;

// a string literal operand does NOT rescue nullability
type A31 = QueryResult<"SELECT tracking || ' x' AS v FROM shipments", WideSchema>;
type _A31 = RequireTrue<AssertEqual<A31, { v: string | null }>>;

// nullable propagates through a function-call operand too (arith-scan `||` path)
type A32 = QueryResult<"SELECT tracking || upper(carrier) AS v FROM shipments", WideSchema>;
type _A32 = RequireTrue<AssertEqual<A32, { v: string | null }>>;

// control: all operands non-null -> plain string (no over-nullability)
type A33 = QueryResult<"SELECT carrier || carrier AS v FROM shipments", WideSchema>;
type _A33 = RequireTrue<AssertEqual<A33, { v: string }>>;

// --- `||` with a non-column left operand must NOT poison the row to `never` ---
// `ParseColumnRef` returns `never` for a function-call / arithmetic left operand;
// a naked `never extends ColumnRef` used to distribute and collapse the whole
// projection to `never`. It must stay on the string-concat path.
type A34 = QueryResult<"SELECT upper(carrier) || carrier AS v FROM shipments", WideSchema>;
type _A34 = RequireTrue<AssertEqual<A34, { v: string }>>;
// coalesce(carrier, …) is non-null (carrier is non-null) -> concat stays string
type A35 = QueryResult<"SELECT coalesce(carrier, tracking) || carrier AS v FROM shipments", WideSchema>;
type _A35 = RequireTrue<AssertEqual<A35, { v: string }>>;

export type ArithmeticAdversarialLoaded = true;
