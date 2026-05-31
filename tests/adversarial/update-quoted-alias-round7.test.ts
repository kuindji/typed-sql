/**
 * ADVERSARIAL round 7: normal UPDATE expression validation, quoted identifiers
 * that contain comment markers, and implicit output aliases.
 *
 * The library's contract is table/field-name validation plus return type
 * inference for raw SQL accepted by Postgres/MySQL. These cases are valid SQL
 * surfaces where the current shallow parser silently skips a column ref or
 * rewrites identifier text while normalizing comments.
 */

import type { QueryResult, ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { WideSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// UPDATE statements should validate field names in RHS expressions and WHERE
// predicates, just like SELECT predicates do. The current normal UPDATE path
// only validates SET target column names, so bogus refs are accepted.
// ---------------------------------------------------------------------------

type U1 = ValidateSQL<"UPDATE orders SET total = bogus_col WHERE id = 1", WideSchema>;
type _U1 = RequireTrue<AssertEqual<U1, false>>;

type U2 = ValidateSQL<"UPDATE orders SET total = 1 WHERE bogus_col = 1", WideSchema>;
type _U2 = RequireTrue<AssertEqual<U2, false>>;

type U3 = ValidateSQL<"UPDATE orders o SET total = 1 WHERE o.bogus_col = 1", WideSchema>;
type _U3 = RequireTrue<AssertEqual<U3, false>>;

// Controls: valid UPDATE refs should continue to pass.
type OK1 = ValidateSQL<"UPDATE orders SET total = total + 1 WHERE id = 1", WideSchema>;
type _OK1 = RequireTrue<AssertEqual<OK1, true>>;

type OK2 = ValidateSQL<"UPDATE orders o SET total = o.total + 1 WHERE o.id = 1", WideSchema>;
type _OK2 = RequireTrue<AssertEqual<OK2, true>>;

// ---------------------------------------------------------------------------
// Comment markers inside double-quoted identifiers are identifier text, not SQL
// comments. StripComments is single-quote-aware but not double-quote-aware, so
// it rewrites the projected alias before return-type inference.
// ---------------------------------------------------------------------------

type Q1 = QueryResult<'SELECT id AS "kept /* marker */ name" FROM users', WideSchema>;
type _Q1 = RequireTrue<AssertEqual<Q1, { "kept /* marker */ name": number }>>;

// Control: the same quoted alias shape without a comment marker works.
type OK3 = QueryResult<'SELECT id AS "kept marker name" FROM users', WideSchema>;
type _OK3 = RequireTrue<AssertEqual<OK3, { "kept marker name": number }>>;

// ---------------------------------------------------------------------------
// Postgres accepts an implicit output alias without AS. The result key should be
// the alias, not the entire expression text.
// ---------------------------------------------------------------------------

type Q2 = QueryResult<'SELECT id "implicit id" FROM users', WideSchema>;
type _Q2 = RequireTrue<AssertEqual<Q2, { "implicit id": number }>>;

// Control: explicit AS for the same alias already works.
type OK4 = QueryResult<'SELECT id AS "implicit id" FROM users', WideSchema>;
type _OK4 = RequireTrue<AssertEqual<OK4, { "implicit id": number }>>;

export type UpdateQuotedAliasRound7AdversarialLoaded = true;
