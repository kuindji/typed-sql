/**
 * ADVERSARIAL round 8: quote-aware projection splitting, implicit aliases, and
 * SELECT text that looks like a RETURNING clause.
 *
 * These cases are valid SQL surfaces where punctuation or clause-looking text
 * inside quoted/literal content should remain data, not parser structure.
 */

import type { QueryResult, ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema, WideSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// Double-quoted output aliases can contain punctuation. Commas must not split
// the SELECT list, and `)` inside an alias must not make the alias disappear.
// ---------------------------------------------------------------------------

type Q1 = QueryResult<'SELECT id AS "id, display", email FROM users', WideSchema>;
type _Q1 = RequireTrue<AssertEqual<Q1, { "id, display": number; email: string }>>;

type Q2 = QueryResult<'SELECT id AS "id) display" FROM users', WideSchema>;
type _Q2 = RequireTrue<AssertEqual<Q2, { "id) display": number }>>;

// Controls: ordinary quoted aliases continue to infer the quoted key.
type OK1 = QueryResult<'SELECT id AS "id display", email FROM users', WideSchema>;
type _OK1 = RequireTrue<AssertEqual<OK1, { "id display": number; email: string }>>;

// ---------------------------------------------------------------------------
// Postgres accepts bare implicit output aliases. The parser handles the quoted
// implicit form (`id "x"`) but still treats bare `expr alias` as the expression.
// ---------------------------------------------------------------------------

type I1 = QueryResult<"SELECT id user_id FROM users", WideSchema>;
type _I1 = RequireTrue<AssertEqual<I1, { user_id: number }>>;

type I2 = QueryResult<"SELECT count(*) total FROM users", WideSchema>;
type _I2 = RequireTrue<AssertEqual<I2, { total: number }>>;

// Control: explicit AS for the same aliases already works.
type OK2 = QueryResult<"SELECT id AS user_id FROM users", WideSchema>;
type _OK2 = RequireTrue<AssertEqual<OK2, { user_id: number }>>;

type OK3 = QueryResult<"SELECT count(*) AS total FROM users", WideSchema>;
type _OK3 = RequireTrue<AssertEqual<OK3, { total: number }>>;

// ---------------------------------------------------------------------------
// SELECT aliases are only valid in ORDER BY, not WHERE. Enabling ORDER BY alias
// resolution must not bless the same alias when it appears in the WHERE clause.
// ---------------------------------------------------------------------------

type A1 = ValidateSQL<"SELECT id AS bogus_col FROM users WHERE bogus_col = 1 ORDER BY bogus_col", WideSchema>;
type _A1 = RequireTrue<AssertEqual<A1, false>>;

// Control: ORDER BY may reference a SELECT-list alias.
type OK4 = ValidateSQL<"SELECT id AS user_id FROM users ORDER BY user_id", WideSchema>;
type _OK4 = RequireTrue<AssertEqual<OK4, true>>;

// ---------------------------------------------------------------------------
// Function-call compound argument validation should not depend on spaces around
// arithmetic operators.
// ---------------------------------------------------------------------------

type F1 = ValidateSQL<"SELECT sum(price+bogus_col) AS total FROM products", DeepSchema>;
type _F1 = RequireTrue<AssertEqual<F1, false>>;

// Control: the spaced version is already rejected.
type OK5 = ValidateSQL<"SELECT sum(price + bogus_col) AS total FROM products", DeepSchema>;
type _OK5 = RequireTrue<AssertEqual<OK5, false>>;

// ---------------------------------------------------------------------------
// `returning` inside a SELECT string literal or quoted alias is not a RETURNING
// clause. HasReturning/ExtractReturningList must be quote-aware and query-kind
// aware, otherwise plain SELECT result inference reads the wrong list.
// ---------------------------------------------------------------------------

type R1 = QueryResult<"SELECT ' returning ' AS marker FROM users", WideSchema>;
type _R1 = RequireTrue<AssertEqual<R1, { marker: " returning " }>>;

type R2 = QueryResult<'SELECT id AS "has returning value" FROM users', WideSchema>;
type _R2 = RequireTrue<AssertEqual<R2, { "has returning value": number }>>;

// Control: aliases without the clause-looking token are unaffected.
type OK6 = QueryResult<'SELECT id AS "has value" FROM users', WideSchema>;
type _OK6 = RequireTrue<AssertEqual<OK6, { "has value": number }>>;

export type QuotedAliasReturningRound8AdversarialLoaded = true;
