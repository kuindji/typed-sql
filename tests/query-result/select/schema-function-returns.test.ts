/**
 * Schema-declared function return types (bucket 06).
 * A function NOT known as a builtin resolves its return type from the schema's
 * `functions` map; builtins still win; absent map ⇒ unchanged.
 */
import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { FnSchema, WideSchema } from "../../fixtures/parser-schemas.js";

// Bare nullable schema function → mapped return.
type T1 = QueryResult<`SELECT convert_currency(id) AS "x" FROM users`, FnSchema>;
type _T1 = RequireTrue<AssertEqual<T1, { x: number | null }>>;

// Bare non-null schema function → mapped return, no null.
type T2 = QueryResult<`SELECT some_nonnull_fn(id) AS "y" FROM users`, FnSchema>;
type _T2 = RequireTrue<AssertEqual<T2, { y: number }>>;

// Unknown function on a functions-LESS schema stays unknown (backward compat).
type T3 = QueryResult<`SELECT convert_currency(id) AS "x" FROM users`, WideSchema>;
type _T3 = RequireTrue<AssertEqual<T3, { x: unknown }>>;

// CORE: nullable schema function under an outer cast keeps `| null`.
type T4 = QueryResult<`SELECT convert_currency(id)::float8 AS "x" FROM users`, FnSchema>;
type _T4 = RequireTrue<AssertEqual<T4, { x: number | null }>>;

// Non-null schema function under a cast → no null added.
type T5 = QueryResult<`SELECT some_nonnull_fn(id)::float8 AS "y" FROM users`, FnSchema>;
type _T5 = RequireTrue<AssertEqual<T5, { y: number }>>;

// Backward compat: same cast on a functions-LESS schema → plain number.
type T6 = QueryResult<`SELECT convert_currency(id)::float8 AS "x" FROM users`, WideSchema>;
type _T6 = RequireTrue<AssertEqual<T6, { x: number }>>;

// ADVERSARIAL (load-bearing): T4 must NOT be { x: number }.
type T7 = QueryResult<`SELECT convert_currency(id)::float8 AS "x" FROM users`, FnSchema>;
type _T7 = RequireTrue<AssertEqual<AssertEqual<T7, { x: number }>, false>>;

// Builtin still wins over a colliding schema entry (FnSchema maps `count`→string).
type T8 = QueryResult<`SELECT count(*) AS "c" FROM users`, FnSchema>;
type _T8 = RequireTrue<AssertEqual<T8, { c: number }>>;

// Function name matching is case-insensitive (mirrors table/column matching).
type T9 = QueryResult<`SELECT CONVERT_CURRENCY(id) AS "x" FROM users`, FnSchema>;
type _T9 = RequireTrue<AssertEqual<T9, { x: number | null }>>;

// A schema-QUALIFIED call does NOT resolve (unqualified-only matching) → unknown.
type T10 = QueryResult<`SELECT public.convert_currency(id) AS "x" FROM users`, FnSchema>;
type _T10 = RequireTrue<AssertEqual<T10, { x: unknown }>>;

// Multi-arg / nested-paren args still resolve by the leading function name.
type T11 = QueryResult<`SELECT convert_currency(round(id), 'USD')::float8 AS "x" FROM users`, FnSchema>;
type _T11 = RequireTrue<AssertEqual<T11, { x: number | null }>>;

// ---------------------------------------------------------------------------
// Modeled fn under an UNINFORMATIVE cast (`::json`/`::jsonb` → `unknown`): the
// declared return WINS over the cast. The cast is runtime plumbing (so the
// driver parses the value into the declared shape), not a deliberate retype.
// This is the PostGIS `ST_AsGeoJSON(location)::json` use case.
// ---------------------------------------------------------------------------

// Object-returning modeled fn under `::json` → the declared object shape (NOT
// `unknown`, which is what the bare cast would otherwise yield).
type T12 = QueryResult<`SELECT st_asgeojson(id)::json AS "g" FROM users`, FnSchema>;
type _T12 = RequireTrue<
    AssertEqual<T12, { g: { type: "Point"; coordinates: number[] } | null }>
>;

// ADVERSARIAL (load-bearing): T12 must NOT be `{ g: unknown }` (the pre-feature
// result). Guards against the cast silently winning again.
type _T12_not_unknown = RequireTrue<
    AssertEqual<AssertEqual<T12, { g: unknown }>, false>
>;

// `::jsonb` behaves identically (both json/jsonb map to `unknown`).
type T13 = QueryResult<`SELECT st_asgeojson(id)::jsonb AS "g" FROM users`, FnSchema>;
type _T13 = RequireTrue<
    AssertEqual<T13, { g: { type: "Point"; coordinates: number[] } | null }>
>;

// `cast(... as json)` spelling resolves the same as `::json`.
type T14 = QueryResult<`SELECT cast(st_asgeojson(id) as json) AS "g" FROM users`, FnSchema>;
type _T14 = RequireTrue<
    AssertEqual<T14, { g: { type: "Point"; coordinates: number[] } | null }>
>;

// A nullable scalar modeled fn under `::json` keeps its declared `| null` too.
type T15 = QueryResult<`SELECT convert_currency(id)::json AS "x" FROM users`, FnSchema>;
type _T15 = RequireTrue<AssertEqual<T15, { x: number | null }>>;

// Backward compat: `::json` over an UNMODELED fn (functions-less schema) stays
// `unknown` — the feature only fires for declared functions.
type T16 = QueryResult<`SELECT st_asgeojson(id)::json AS "g" FROM users`, WideSchema>;
type _T16 = RequireTrue<AssertEqual<T16, { g: unknown }>>;

// A REAL-typed cast still WINS over the declared return (explicit retype): the
// feature defers to any cast that carries actual type information.
type T17 = QueryResult<`SELECT some_nonnull_fn(id)::text AS "y" FROM users`, FnSchema>;
type _T17 = RequireTrue<AssertEqual<T17, { y: string }>>;
