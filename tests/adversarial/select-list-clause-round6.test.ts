/**
 * ADVERSARIAL round 6: select-list validation gaps, JOIN USING semantics, and
 * double-quoted aliases that contain clause-looking text.
 *
 * These are all valid Postgres/MySQL-ish SQL surfaces where the current
 * type-level parser either skips validation inside a SELECT-list expression or
 * splits the query at text that is not actually a clause boundary.
 */

import type { QueryResult, ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema, WideSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// Function arguments that are complex expressions must still validate their
// column refs. The simple select-list twin below is already caught; wrapping the
// same expression in an aggregate currently hides `bogus_col`.
// ---------------------------------------------------------------------------

type F1 = ValidateSQL<"SELECT sum(price + bogus_col) AS total FROM products", DeepSchema>;
type _F1 = RequireTrue<AssertEqual<F1, false>>;

type F2 = ValidateSQL<"SELECT sum(CASE WHEN bogus_col = 1 THEN price ELSE 0 END) AS total FROM products", DeepSchema>;
type _F2 = RequireTrue<AssertEqual<F2, false>>;

// Control: the non-function form already validates the bad ref.
type OK1 = ValidateSQL<"SELECT price + bogus_col AS total FROM products", DeepSchema>;
type _OK1 = RequireTrue<AssertEqual<OK1, false>>;

// Control: valid complex function arguments stay accepted.
type OK2 = ValidateSQL<"SELECT sum(price + quantity) AS total FROM products", DeepSchema>;
type _OK2 = RequireTrue<AssertEqual<OK2, true>>;

// ---------------------------------------------------------------------------
// OVER(...) / FILTER(...) may omit the space before the parenthesized clause.
// The spaced forms are covered elsewhere; the no-space forms should validate
// the same column refs.
// ---------------------------------------------------------------------------

type W1 = ValidateSQL<"SELECT row_number() OVER(PARTITION BY bogus_col) AS rn FROM users", WideSchema>;
type _W1 = RequireTrue<AssertEqual<W1, false>>;

type W2 = ValidateSQL<"SELECT count(*) FILTER(WHERE bogus_col > 0) AS c FROM users", WideSchema>;
type _W2 = RequireTrue<AssertEqual<W2, false>>;

// Controls: no-space forms with real columns are valid SQL and should pass.
type OK3 = ValidateSQL<"SELECT row_number() OVER(PARTITION BY name ORDER BY id) AS rn FROM users", WideSchema>;
type _OK3 = RequireTrue<AssertEqual<OK3, true>>;

type OK4 = ValidateSQL<"SELECT count(*) FILTER(WHERE id > 0) AS c FROM users", WideSchema>;
type _OK4 = RequireTrue<AssertEqual<OK4, true>>;

// ---------------------------------------------------------------------------
// JOIN ... USING (col) requires `col` to exist on both joined tables. A loose
// unqualified-column check that finds the column on either side is not enough.
// ---------------------------------------------------------------------------

type U1 = ValidateSQL<"SELECT * FROM users u JOIN orders o USING (user_id)", WideSchema>;
type _U1 = RequireTrue<AssertEqual<U1, false>>;

// Control: the equivalent ON predicate with the actual column names is valid.
type OK5 = ValidateSQL<"SELECT * FROM users u JOIN orders o ON o.user_id = u.id", WideSchema>;
type _OK5 = RequireTrue<AssertEqual<OK5, true>>;

// Control: USING(id) is valid for these two tables because both expose `id`.
type OK6 = ValidateSQL<"SELECT * FROM users u JOIN orders o USING (id)", WideSchema>;
type _OK6 = RequireTrue<AssertEqual<OK6, true>>;

// ---------------------------------------------------------------------------
// A double-quoted output alias can contain the token " from ". That text is
// part of the identifier, not the SELECT/FROM boundary.
// ---------------------------------------------------------------------------

type Q1 = QueryResult<'SELECT id AS "came from import" FROM users', WideSchema>;
type _Q1 = RequireTrue<AssertEqual<Q1, { "came from import": number }>>;

// Control: quoted aliases with spaces but no clause-looking token work.
type OK7 = QueryResult<'SELECT id AS "user id" FROM users', WideSchema>;
type _OK7 = RequireTrue<AssertEqual<OK7, { "user id": number }>>;

export type SelectListClauseRound6AdversarialLoaded = true;
