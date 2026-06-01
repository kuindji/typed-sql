/**
 * ARITHMETIC & operator expression typing (CONSERVATIVE CONTRACT).
 *
 * Design choice: general arithmetic operators (+, -, *, /, %, <<) are NOT
 * type-inferred — their result type is `unknown` and the author casts when a
 * concrete type is needed. The ONE operator we DO type is `||`, which is
 * unambiguously string concatenation (-> string). Aliases/keys are always
 * preserved; only the value type is `unknown` for bare arithmetic.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// price * quantity -> unknown (bare arithmetic is untyped; cast for a type)
type A1 = QueryResult<"SELECT price * quantity AS total FROM products", DeepSchema>;
type _A1 = RequireTrue<AssertEqual<A1, { total: unknown }>>;

// addition -> unknown
type A2 = QueryResult<"SELECT price + discount AS net FROM products", DeepSchema>;
type _A2 = RequireTrue<AssertEqual<A2, { net: unknown }>>;

// subtraction -> unknown
type A3 = QueryResult<"SELECT price - discount AS net FROM products", DeepSchema>;
type _A3 = RequireTrue<AssertEqual<A3, { net: unknown }>>;

// division -> unknown
type A4 = QueryResult<"SELECT price / quantity AS unit FROM products", DeepSchema>;
type _A4 = RequireTrue<AssertEqual<A4, { unit: unknown }>>;

// modulo -> unknown
type A5 = QueryResult<"SELECT quantity % 2 AS parity FROM products", DeepSchema>;
type _A5 = RequireTrue<AssertEqual<A5, { parity: unknown }>>;

// parenthesized arithmetic -> unknown
type A6 = QueryResult<"SELECT (price + discount) * quantity AS grand FROM products", DeepSchema>;
type _A6 = RequireTrue<AssertEqual<A6, { grand: unknown }>>;

// column + integer literal -> unknown
type A7 = QueryResult<"SELECT price + 10 AS bumped FROM products", DeepSchema>;
type _A7 = RequireTrue<AssertEqual<A7, { bumped: unknown }>>;

// string concatenation operator -> string (the one typed operator)
type A8 = QueryResult<"SELECT name || '!' AS shout FROM products", DeepSchema>;
type _A8 = RequireTrue<AssertEqual<A8, { shout: string }>>;

// concat of two columns -> string
type A9 = QueryResult<"SELECT name || status AS label FROM products", DeepSchema>;
type _A9 = RequireTrue<AssertEqual<A9, { label: string }>>;

// unary negation -> unknown
type A10 = QueryResult<"SELECT -price AS neg FROM products", DeepSchema>;
type _A10 = RequireTrue<AssertEqual<A10, { neg: unknown }>>;

// arithmetic mixed with a known aggregate -> number (aggregate wrapper retained)
type A11 = QueryResult<"SELECT sum(price) / count(id) AS avg_price FROM products", DeepSchema>;
type _A11 = RequireTrue<AssertEqual<A11, { avg_price: number }>>;

// bit shift / bitwise -> unknown
type A12 = QueryResult<"SELECT quantity << 1 AS doubled FROM products", DeepSchema>;
type _A12 = RequireTrue<AssertEqual<A12, { doubled: unknown }>>;

export type ArithmeticAdversarialLoaded = true;
