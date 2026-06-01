/**
 * ADVERSARIAL: queries constructed with template-literal types.
 *
 * Real codebases build SQL from string unions / interpolation. A union of
 * literal query strings should distribute to a union of result objects, and a
 * column name drawn from a literal union should produce the union of column
 * types. The library's runtime-fragment guards tend to collapse these to `{}`
 * or a single branch.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// A column name from a literal union -> distributed query union -> result union
type Col = "id" | "name";
type Q1 = `SELECT ${Col} FROM products`;
type T1 = QueryResult<Q1, DeepSchema>;
type _T1 = RequireTrue<AssertEqual<T1, { id: number } | { name: string }>>;

// Table name from a literal union (both valid) -> union of full-row results
type Tbl = "products" | "users";
type Q2 = `SELECT id FROM ${Tbl}`;
type T2 = QueryResult<Q2, DeepSchema>;
type _T2 = RequireTrue<AssertEqual<T2, { id: number } | { id: number }>>;

// Interpolated WHERE clause must not change the projection type
type Pred = "price > 10" | "price < 5";
type Q3 = `SELECT name FROM products WHERE ${Pred}`;
type T3 = QueryResult<Q3, DeepSchema>;
type _T3 = RequireTrue<AssertEqual<T3, { name: string }>>;

// A union of two fully-formed queries should distribute
type Q4 = "SELECT id FROM products" | "SELECT email FROM users";
type T4 = QueryResult<Q4, DeepSchema>;
type _T4 = RequireTrue<AssertEqual<T4, { id: number } | { email: string }>>;

// Validation should distribute too: both branches valid -> true
type V1 = ValidateSQL<`SELECT ${Col} FROM products`, DeepSchema>;
type _V1 = RequireTrue<AssertEqual<V1, true>>;

// One valid + one invalid column -> not unconditionally true
type BadCol = "id" | "nonexistent_col";
type V2 = ValidateSQL<`SELECT ${BadCol} FROM products`, DeepSchema>;
type _V2 = RequireTrue<AssertEqual<V2, boolean>>;

// Interpolated column list (two columns) -> both projected
type Q5 = `SELECT id, ${"name" | "price"} FROM products`;
type T5 = QueryResult<Q5, DeepSchema>;
type _T5 = RequireTrue<
    AssertEqual<T5, { id: number; name: string } | { id: number; price: number }>
>;

export type TemplateAdversarialLoaded = true;
