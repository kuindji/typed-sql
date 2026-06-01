/**
 * ADVERSARIAL: comments, quoted literals, and DML edge cases (round 5).
 *
 * These assertions encode normal Postgres/MySQL-ish semantics. They are
 * expected to fail while the parser still treats comment markers inside string
 * literals as comments, leaves pre-FROM line comments inside the select item,
 * skips row-assignment target columns in UPDATE statements, and misses DELETE
 * USING table-source semantics.
 */

import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// --- BUG: block-comment markers inside a string literal are not comments. ---
type C1 = GetReturnType<"SELECT '/* not a comment */' AS note FROM users", WideSchema>;
type _C1 = RequireTrue<AssertEqual<C1, { note: "/* not a comment */" }>>;

// --- BUG: a line comment before FROM should not become part of the select item. ---
type C2 = GetReturnType<"SELECT id -- keep id\nFROM users", WideSchema>;
type _C2 = RequireTrue<AssertEqual<C2, { id: number }>>;

// --- BUG: invalid row-assignment target columns in UPDATE should be rejected. ---
type U1 = ValidateSQL<"UPDATE products SET (title, bogus_col) = ('x', 1) WHERE id = 1", WideSchema>;
type _U1 = RequireTrue<AssertEqual<U1, false>>;

// --- BUG: DELETE ... USING should validate that USING tables exist. ---
type D1 = ValidateSQL<"DELETE FROM orders USING no_such_table WHERE orders.id = 1", WideSchema>;
type _D1 = RequireTrue<AssertEqual<D1, false>>;

// --- BUG: DELETE ... USING aliases should be available to a valid predicate. ---
type D2 = ValidateSQL<"DELETE FROM orders USING users u WHERE u.id = orders.user_id", WideSchema>;
type _D2 = RequireTrue<AssertEqual<D2, true>>;

// INSERT ... SELECT already validates the SELECT projection.
type I1 = ValidateSQL<"INSERT INTO products (id, title) SELECT id, bogus_col FROM users", WideSchema>;
type _I1 = RequireTrue<AssertEqual<I1, false>>;

// DELETE ... USING already validates USING-table aliases.
type D3 = ValidateSQL<"DELETE FROM orders USING users u WHERE u.bogus_col = orders.user_id", WideSchema>;
type _D3 = RequireTrue<AssertEqual<D3, false>>;

// ===========================================================================
// CONTROLS
// ===========================================================================

type OK1 = GetReturnType<"SELECT 'plain text' AS note FROM users", WideSchema>;
type _OK1 = RequireTrue<AssertEqual<OK1, { note: "plain text" }>>;

type OK2 = GetReturnType<"SELECT 'Bob''s from shop' AS note FROM users", WideSchema>;
type _OK2 = RequireTrue<AssertEqual<OK2, { note: "Bob''s from shop" }>>;

type OK3 = ValidateSQL<"UPDATE products SET title = 'x' WHERE id = 1", WideSchema>;
type _OK3 = RequireTrue<AssertEqual<OK3, true>>;

type OK4 = ValidateSQL<"INSERT INTO products (id, title) VALUES (1, 'x')", WideSchema>;
type _OK4 = RequireTrue<AssertEqual<OK4, true>>;

type OK5 = ValidateSQL<"INSERT INTO products (id, title) SELECT id, bogus_col FROM users", WideSchema>;
type _OK5 = RequireTrue<AssertEqual<OK5, false>>;

type OK6 = ValidateSQL<"DELETE FROM orders USING users u WHERE u.bogus_col = orders.user_id", WideSchema>;
type _OK6 = RequireTrue<AssertEqual<OK6, false>>;

export type CommentsDmlRound5AdversarialLoaded = true;
