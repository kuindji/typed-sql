/**
 * ADVERSARIAL: arithmetic & operator expression typing.
 *
 * The library has no operator-aware expression typing. Any expression that is
 * not a bare column, literal, cast, or known-function call falls through
 * `ExprType` to `unknown`. Correct SQL semantics give precise numeric/string
 * types, so every assertion below should be RED.
 */

import type { QueryResult } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema } from "./schemas.js";

// price * quantity -> number
type A1 = QueryResult<"SELECT price * quantity AS total FROM products", DeepSchema>;
type _A1 = RequireTrue<AssertEqual<A1, { total: number }>>;

// addition -> number
type A2 = QueryResult<"SELECT price + discount AS net FROM products", DeepSchema>;
type _A2 = RequireTrue<AssertEqual<A2, { net: number }>>;

// subtraction -> number
type A3 = QueryResult<"SELECT price - discount AS net FROM products", DeepSchema>;
type _A3 = RequireTrue<AssertEqual<A3, { net: number }>>;

// division -> number
type A4 = QueryResult<"SELECT price / quantity AS unit FROM products", DeepSchema>;
type _A4 = RequireTrue<AssertEqual<A4, { unit: number }>>;

// modulo -> number
type A5 = QueryResult<"SELECT quantity % 2 AS parity FROM products", DeepSchema>;
type _A5 = RequireTrue<AssertEqual<A5, { parity: number }>>;

// parenthesized arithmetic -> number
type A6 = QueryResult<"SELECT (price + discount) * quantity AS grand FROM products", DeepSchema>;
type _A6 = RequireTrue<AssertEqual<A6, { grand: number }>>;

// column + integer literal -> number
type A7 = QueryResult<"SELECT price + 10 AS bumped FROM products", DeepSchema>;
type _A7 = RequireTrue<AssertEqual<A7, { bumped: number }>>;

// string concatenation operator -> string
type A8 = QueryResult<"SELECT name || '!' AS shout FROM products", DeepSchema>;
type _A8 = RequireTrue<AssertEqual<A8, { shout: string }>>;

// concat of two columns -> string
type A9 = QueryResult<"SELECT name || status AS label FROM products", DeepSchema>;
type _A9 = RequireTrue<AssertEqual<A9, { label: string }>>;

// unary negation -> number
type A10 = QueryResult<"SELECT -price AS neg FROM products", DeepSchema>;
type _A10 = RequireTrue<AssertEqual<A10, { neg: number }>>;

// arithmetic mixed with a known aggregate -> number
type A11 = QueryResult<"SELECT sum(price) / count(id) AS avg_price FROM products", DeepSchema>;
type _A11 = RequireTrue<AssertEqual<A11, { avg_price: number }>>;

// bit shift / bitwise -> number
type A12 = QueryResult<"SELECT quantity << 1 AS doubled FROM products", DeepSchema>;
type _A12 = RequireTrue<AssertEqual<A12, { doubled: number }>>;

export type ArithmeticAdversarialLoaded = true;
