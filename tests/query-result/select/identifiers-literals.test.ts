/**
 * ADVERSARIAL: identifiers, quoting, comments, and literals (round 2).
 *
 * Covers quoted/back-ticked identifiers, case-insensitive resolution,
 * schema-qualified refs, SQL comments, and literal typings. Comment handling is
 * the likely defect (the normalizer does not strip `--` / block comments).
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// Double-quoted identifier.
type I1 = QueryResult<'SELECT "name" FROM users', WideSchema>;
type _I1 = RequireTrue<AssertEqual<I1, { name: string }>>;

// MySQL back-ticked identifier.
type I2 = QueryResult<"SELECT `name` FROM users", WideSchema>;
type _I2 = RequireTrue<AssertEqual<I2, { name: string }>>;

// Case-insensitive table + column resolution.
type I3 = QueryResult<"SELECT ID FROM USERS", WideSchema>;
type _I3 = RequireTrue<AssertEqual<I3, { id: number }>>;

// Schema-qualified table.
type I4 = QueryResult<"SELECT id FROM public.users", WideSchema>;
type _I4 = RequireTrue<AssertEqual<I4, { id: number }>>;

// Qualified + quoted column.
type I5 = QueryResult<'SELECT u."name" FROM users u', WideSchema>;
type _I5 = RequireTrue<AssertEqual<I5, { name: string }>>;

// --- BUG (likely): block comment between projection items ---
type I6 = QueryResult<"SELECT id, /* note */ name FROM users", WideSchema>;
type _I6 = RequireTrue<AssertEqual<I6, { id: number; name: string }>>;

// Trailing line comment.
type I7 = QueryResult<"SELECT id FROM users -- trailing", WideSchema>;
type _I7 = RequireTrue<AssertEqual<I7, { id: number }>>;

// String literal widens to string (literals are not preserved).
type I8 = QueryResult<"SELECT 'hi' AS x FROM users", WideSchema>;
type _I8 = RequireTrue<AssertEqual<I8, { x: string }>>;

// Boolean literal.
type I9 = QueryResult<"SELECT true AS x FROM users", WideSchema>;
type _I9 = RequireTrue<AssertEqual<I9, { x: true }>>;

export type IdentifiersLiteralsAdversarialLoaded = true;
