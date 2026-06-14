/**
 * pg-type → TS scalar mapping: runtime-honest defaults + consumer overrides.
 *
 * node-postgres (default parsers) returns `numeric`/`decimal`/`bigint`/`int8`/
 * `money` as STRINGS and `date`/`timestamp`/`timestamptz` as `Date` objects.
 * The default scalar mapping now reflects that. Consumers whose driver is
 * configured differently (e.g. a `setTypeParser(1700, parseFloat)`) override
 * per-type via module augmentation of `PgTypeOverrides`.
 *
 * The override LOGIC is unit-tested through the 2-arg `SqlScalarToTsWith<N, O>`
 * (so a test can supply an override map WITHOUT globally augmenting
 * `PgTypeOverrides`, which would pollute every other test in the tsc pass).
 * The public `SqlScalarToTs<N>` feeds the augmentable interface into it.
 */

import type {
    SqlScalarToTs,
    SqlScalarToTsWith,
} from "../../../src/expressions.js";
import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// ── Honest defaults (no override) ───────────────────────────────────────────

// numeric family → string (node-pg returns these as strings)
type D1 = RequireTrue<AssertEqual<SqlScalarToTs<"numeric">, string>>;
type D2 = RequireTrue<AssertEqual<SqlScalarToTs<"decimal">, string>>;
type D3 = RequireTrue<AssertEqual<SqlScalarToTs<"bigint">, string>>;
type D4 = RequireTrue<AssertEqual<SqlScalarToTs<"int8">, string>>;
type D5 = RequireTrue<AssertEqual<SqlScalarToTs<"money">, string>>;

// integer / float that DO fit a JS number → number (control, unchanged)
type D6 = RequireTrue<AssertEqual<SqlScalarToTs<"int4">, number>>;
type D7 = RequireTrue<AssertEqual<SqlScalarToTs<"int2">, number>>;
type D8 = RequireTrue<AssertEqual<SqlScalarToTs<"integer">, number>>;
type D9 = RequireTrue<AssertEqual<SqlScalarToTs<"float8">, number>>;
type D10 = RequireTrue<AssertEqual<SqlScalarToTs<"real">, number>>;

// date / timestamp → Date (node-pg parses these to Date objects)
type D11 = RequireTrue<AssertEqual<SqlScalarToTs<"date">, Date>>;
type D12 = RequireTrue<AssertEqual<SqlScalarToTs<"timestamp">, Date>>;
type D13 = RequireTrue<AssertEqual<SqlScalarToTs<"timestamptz">, Date>>;

// time stays string (node-pg returns time/timetz as strings)
type D14 = RequireTrue<AssertEqual<SqlScalarToTs<"time">, string>>;

// unchanged families
type D15 = RequireTrue<AssertEqual<SqlScalarToTs<"text">, string>>;
type D16 = RequireTrue<AssertEqual<SqlScalarToTs<"boolean">, boolean>>;

// ── Override path (via the 2-arg testable form) ──────────────────────────────

// a supplied override wins over the default
type O1 = RequireTrue<
    AssertEqual<SqlScalarToTsWith<"numeric", { numeric: number }>, number>
>;
type O2 = RequireTrue<
    AssertEqual<SqlScalarToTsWith<"timestamp", { timestamp: string }>, string>
>;

// synonyms canonicalize: overriding `numeric` also catches `::decimal`,
// overriding `int8` also catches `bigint`
type O3 = RequireTrue<
    AssertEqual<SqlScalarToTsWith<"decimal", { numeric: number }>, number>
>;
type O4 = RequireTrue<
    AssertEqual<SqlScalarToTsWith<"bigint", { int8: number }>, number>
>;

// a type NOT in the override map still resolves via the honest default
type O5 = RequireTrue<
    AssertEqual<SqlScalarToTsWith<"int4", { numeric: number }>, number>
>;
type O6 = RequireTrue<
    AssertEqual<SqlScalarToTsWith<"numeric", { timestamp: string }>, string>
>;

// an empty override map === default behavior (the zero-cost short-circuit path)
type O7 = RequireTrue<AssertEqual<SqlScalarToTsWith<"numeric", {}>, string>>;
type O8 = RequireTrue<AssertEqual<SqlScalarToTsWith<"timestamp", {}>, Date>>;

// the public alias feeds the (un-augmented) interface → defaults
type O9 = RequireTrue<
    AssertEqual<SqlScalarToTs<"numeric">, SqlScalarToTsWith<"numeric", {}>>
>;

// ── End-to-end: casts in a real query ───────────────────────────────────────

type Q1 = QueryResult<"SELECT price::numeric(18,6) AS p FROM products", DeepSchema>;
type _Q1 = RequireTrue<AssertEqual<Q1, { p: string }>>;

type Q2 = QueryResult<"SELECT created_at::timestamptz AS t FROM products", DeepSchema>;
type _Q2 = RequireTrue<AssertEqual<Q2, { t: Date }>>;

type Q3 = QueryResult<"SELECT created_at::date AS d FROM products", DeepSchema>;
type _Q3 = RequireTrue<AssertEqual<Q3, { d: Date }>>;

export type ScalarOverridesLoaded = true;

// reference the assertion aliases so unused-local lint stays quiet
export type _All = [
    D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D12, D13, D14, D15, D16,
    O1, O2, O3, O4, O5, O6, O7, O8, O9,
    _Q1, _Q2, _Q3,
];
