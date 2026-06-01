/**
 * Extended DML: INSERT...SELECT, UPDATE...FROM, DELETE...USING,
 * ON CONFLICT, multi-row VALUES, RETURNING.
 *
 * Mostly exercises situations the library already handles (green controls),
 * broadening coverage beyond the basic insert/update/delete suites.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// INSERT ... SELECT, valid source columns.
type D1 = ValidateSQL<"INSERT INTO users (id, name) SELECT id, title FROM products", WideSchema>;
type _D1 = RequireTrue<AssertEqual<D1, true>>;

// INSERT ... SELECT, invalid source column -> false.
type D2 = ValidateSQL<"INSERT INTO users (id, name) SELECT bogus FROM products", WideSchema>;
type _D2 = RequireTrue<AssertEqual<D2, false>>;

// INSERT, invalid TARGET column -> false.
type D3 = ValidateSQL<"INSERT INTO users (id, bogus) VALUES (1, 2)", WideSchema>;
type _D3 = RequireTrue<AssertEqual<D3, false>>;

// Multi-row VALUES, valid -> true.
type D4 = ValidateSQL<"INSERT INTO users (id, name) VALUES (1, 'a'), (2, 'b')", WideSchema>;
type _D4 = RequireTrue<AssertEqual<D4, true>>;

// UPDATE ... FROM, valid SET + join predicate -> true.
type D5 = ValidateSQL<"UPDATE orders SET total = 1 FROM users WHERE users.id = orders.user_id", WideSchema>;
type _D5 = RequireTrue<AssertEqual<D5, true>>;

// UPDATE ... FROM, invalid SET column -> false.
type D6 = ValidateSQL<"UPDATE orders SET bogus_col = 1 FROM users WHERE users.id = orders.user_id", WideSchema>;
type _D6 = RequireTrue<AssertEqual<D6, false>>;

// DELETE ... USING, invalid qualified column -> false.
type D7 = ValidateSQL<"DELETE FROM users USING orders WHERE orders.bogus = users.id", WideSchema>;
type _D7 = RequireTrue<AssertEqual<D7, false>>;

// ON CONFLICT DO UPDATE with excluded.* -> true.
type D8 = ValidateSQL<"INSERT INTO users (id, name) VALUES (1, 'a') ON CONFLICT (id) DO UPDATE SET name = excluded.name", WideSchema>;
type _D8 = RequireTrue<AssertEqual<D8, true>>;

// RETURNING with an alias -> typed projection.
type D9 = QueryResult<"UPDATE orders SET total = 1 RETURNING id AS oid", WideSchema>;
type _D9 = RequireTrue<AssertEqual<D9, { oid: number }>>;

// RETURNING an invalid column -> false.
type D10 = ValidateSQL<"UPDATE orders SET total = 1 RETURNING bogus_col", WideSchema>;
type _D10 = RequireTrue<AssertEqual<D10, false>>;

export type DmlExtendedTestsLoaded = true;
