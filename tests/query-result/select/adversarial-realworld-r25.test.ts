/**
 * ADVERSARIAL — round 25 BACKLOG (RED).
 *
 * Each assertion below encodes the CORRECT PostgreSQL result type for a
 * construct the inferrer currently gets WRONG. They are RED on purpose — this
 * file is the make-green backlog, NOT a passing regression pin (the green pin is
 * `adversarial-realworld.test.ts`, round 24). The CURRENT (pre-fix) inferred
 * type is recorded above every block. Probed 2026-06-18 against main (HEAD
 * 1c00b63). No engine changes have been made yet.
 *
 * Verified already-correct and deliberately NOT re-listed here:
 *   metadata->>'k' / metadata#>>'{..}' -> string ; bare comparisons
 *   (price > 100, a = b) -> boolean ; initcap/reverse/repeat/translate -> string ;
 *   octet_length -> number ; prices[1] + prices[2] -> number | null.
 *
 * Groupings:
 *   1. Boolean predicates the round-24 BoolPredicateType fallback misses
 *      (IS TRUE/FALSE, IS [NOT] DISTINCT FROM, regex ~ !~ ~* !~*).
 *   2. String scalar fn: regexp_replace.
 *   3. Numeric scalar fns: ascii, width_bucket, array_position (always nullable).
 *   4. Array-returning fns (NEW category): array_append/prepend/remove/cat,
 *      string_to_array, regexp_split_to_array, array_to_string, unnest, and the
 *      `||` array-concat overload (RISKY — || is also string/jsonb concat).
 *   5. Projection naming for an unaliased predicate.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema, WideSchema } from "../../fixtures/parser-schemas.js";

// ── 1. boolean predicates ───────────────────────────────────────────────────

// CURRENT: { v: unknown }   EXPECTED: { v: boolean }  (IS TRUE never null)
type G1a = QueryResult<"SELECT is_active IS TRUE AS v FROM users", DeepSchema>;
type _G1a = RequireTrue<AssertEqual<G1a, { v: boolean }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: boolean }
type G1b = QueryResult<"SELECT is_active IS NOT TRUE AS v FROM users", DeepSchema>;
type _G1b = RequireTrue<AssertEqual<G1b, { v: boolean }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: boolean }
type G1c = QueryResult<"SELECT is_active IS FALSE AS v FROM users", DeepSchema>;
type _G1c = RequireTrue<AssertEqual<G1c, { v: boolean }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: boolean }  (DISTINCT FROM is NEVER null,
// even though `discount` is nullable — that is the whole point of the operator.)
type G1d = QueryResult<"SELECT price IS DISTINCT FROM quantity AS v FROM products", DeepSchema>;
type _G1d = RequireTrue<AssertEqual<G1d, { v: boolean }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: boolean }
type G1e = QueryResult<"SELECT discount IS NOT DISTINCT FROM price AS v FROM products", DeepSchema>;
type _G1e = RequireTrue<AssertEqual<G1e, { v: boolean }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: boolean }  (regex match; name non-null)
type G1f = QueryResult<"SELECT name ~ 'a' AS v FROM products", DeepSchema>;
type _G1f = RequireTrue<AssertEqual<G1f, { v: boolean }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: boolean }
// ASYMMETRY: the NEGATED forms `name !~ 'a'` and `name !~* 'a'` already type
// boolean today (the leading `!`/NOT path catches them); only the POSITIVE
// `~` / `~*` operators are missed. Pin the positive case.
type G1g = QueryResult<"SELECT name ~* 'a' AS v FROM products", DeepSchema>;
type _G1g = RequireTrue<AssertEqual<G1g, { v: boolean }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: boolean | null }  (tracking is string | null,
// so NULL ~ p is NULL -> regex match propagates operand nullability)
type G1h = QueryResult<"SELECT tracking ~ 'x' AS v FROM shipments", WideSchema>;
type _G1h = RequireTrue<AssertEqual<G1h, { v: boolean | null }>>;

// ── 2. string scalar fn: regexp_replace ─────────────────────────────────────

// CURRENT: { v: unknown }   EXPECTED: { v: string }  (name non-null)
type G2a = QueryResult<"SELECT regexp_replace(name, 'a', 'b') AS v FROM products", DeepSchema>;
type _G2a = RequireTrue<AssertEqual<G2a, { v: string }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: string | null }  (tracking is string | null)
type G2b = QueryResult<"SELECT regexp_replace(tracking, 'a', 'b') AS v FROM shipments", WideSchema>;
type _G2b = RequireTrue<AssertEqual<G2b, { v: string | null }>>;

// ── 3. numeric scalar fns ───────────────────────────────────────────────────

// CURRENT: { v: unknown }   EXPECTED: { v: number }
type G3a = QueryResult<"SELECT ascii(name) AS v FROM products", DeepSchema>;
type _G3a = RequireTrue<AssertEqual<G3a, { v: number }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number }
type G3b = QueryResult<"SELECT width_bucket(price, 0, 100, 10) AS v FROM products", DeepSchema>;
type _G3b = RequireTrue<AssertEqual<G3b, { v: number }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number | null }
// array_position returns NULL when the element is not found -> ALWAYS nullable.
type G3c = QueryResult<"SELECT array_position(prices, 1) AS v FROM products", DeepSchema>;
type _G3c = RequireTrue<AssertEqual<G3c, { v: number | null }>>;

// ── 4. array-returning fns (NEW category) ───────────────────────────────────

// CURRENT: { v: unknown }   EXPECTED: { v: number[] }  (prices is number[])
type G4a = QueryResult<"SELECT array_append(prices, 1) AS v FROM products", DeepSchema>;
type _G4a = RequireTrue<AssertEqual<G4a, { v: number[] }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number[] }  (array_prepend(elem, array))
type G4b = QueryResult<"SELECT array_prepend(1, prices) AS v FROM products", DeepSchema>;
type _G4b = RequireTrue<AssertEqual<G4b, { v: number[] }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number[] }
type G4c = QueryResult<"SELECT array_remove(prices, 1) AS v FROM products", DeepSchema>;
type _G4c = RequireTrue<AssertEqual<G4c, { v: number[] }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number[] }
type G4d = QueryResult<"SELECT array_cat(prices, prices) AS v FROM products", DeepSchema>;
type _G4d = RequireTrue<AssertEqual<G4d, { v: number[] }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: string[] }
type G4e = QueryResult<"SELECT string_to_array(name, ',') AS v FROM products", DeepSchema>;
type _G4e = RequireTrue<AssertEqual<G4e, { v: string[] }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: string[] }
type G4f = QueryResult<"SELECT regexp_split_to_array(name, ',') AS v FROM products", DeepSchema>;
type _G4f = RequireTrue<AssertEqual<G4f, { v: string[] }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: string }
type G4g = QueryResult<"SELECT array_to_string(prices, ',') AS v FROM products", DeepSchema>;
type _G4g = RequireTrue<AssertEqual<G4g, { v: string }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number }  (unnest yields the element type)
type G4h = QueryResult<"SELECT unnest(prices) AS v FROM products", DeepSchema>;
type _G4h = RequireTrue<AssertEqual<G4h, { v: number }>>;

// CURRENT: { v: string }   EXPECTED: { v: number[] }  (RISKY — || is overloaded:
// string concat, array concat, jsonb concat. Both operands are arrays here.)
type G4i = QueryResult<"SELECT prices || prices AS v FROM products", DeepSchema>;
type _G4i = RequireTrue<AssertEqual<G4i, { v: number[] }>>;

// ── 5. projection naming for an unaliased predicate (WON'T-FIX) ──────────────
//
// `SELECT price IS DISTINCT FROM quantity FROM products` -> `{}`.
// Postgres names an unaliased predicate `?column?`, but this engine
// deliberately OMITS unaliased unnameable expressions from the row (see the
// B4 pin in projection-naming.test.ts — `select id, price + 1` -> `{ id }`,
// the arithmetic column dropped). Naming the predicate would contradict that
// established contract, so G5a is intentionally not modeled. Documented here
// rather than pinned.
