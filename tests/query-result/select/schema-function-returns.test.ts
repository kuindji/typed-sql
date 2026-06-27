/**
 * Schema-declared function return types (bucket 06).
 * A function NOT known as a builtin resolves its return type from the schema's
 * `functions` map; builtins still win; absent map ⇒ unchanged.
 */
import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { FnSchema, WideSchema, Geometry, Label } from "../../fixtures/parser-schemas.js";

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

// ===========================================================================
// PER-FUNCTION CAST (`functions[fn].casts`) — a cast target determinate only in
// combination with a specific call. PostGIS `ST_AsGeoJSON(location)::json`: the
// bare call returns GeoJSON TEXT, the `::json` cast parses it into an object.
// ===========================================================================

// Per-function `::json` cast → the declared object shape (NOT `unknown`, which
// the bare cast would otherwise yield).
type T12 = QueryResult<`SELECT st_asgeojson(id)::json AS "g" FROM users`, FnSchema>;
type _T12 = RequireTrue<AssertEqual<T12, { g: Geometry | null }>>;

// ADVERSARIAL (load-bearing): T12 must NOT be `{ g: unknown }` (the pre-feature
// result). Guards against the cast silently winning again.
type _T12_not_unknown = RequireTrue<
    AssertEqual<AssertEqual<T12, { g: unknown }>, false>
>;

// `::jsonb` resolves the same per-function entry.
type T13 = QueryResult<`SELECT st_asgeojson(id)::jsonb AS "g" FROM users`, FnSchema>;
type _T13 = RequireTrue<AssertEqual<T13, { g: Geometry | null }>>;

// `cast(... as json)` functional spelling resolves the same as `::json`.
type T14 = QueryResult<`SELECT cast(st_asgeojson(id) as json) AS "g" FROM users`, FnSchema>;
type _T14 = RequireTrue<AssertEqual<T14, { g: Geometry | null }>>;

// REGRESSION PIN (the fixed soundness gap): the BARE call now reflects `returns`
// — GeoJSON text (`string`), not the post-`::json` object shape.
type T15 = QueryResult<`SELECT st_asgeojson(id) AS "g" FROM users`, FnSchema>;
type _T15 = RequireTrue<AssertEqual<T15, { g: string }>>;

// Backward compat: `::json` over an UNMODELED fn (functions-less schema) stays
// `unknown` — the feature only fires for declared functions.
type T16 = QueryResult<`SELECT st_asgeojson(id)::json AS "g" FROM users`, WideSchema>;
type _T16 = RequireTrue<AssertEqual<T16, { g: unknown }>>;

// A built-in cast target still wins when the function declares NO per-fn entry
// for it: `some_nonnull_fn` has no `casts.text`, so `::text` → built-in `string`.
type T17 = QueryResult<`SELECT some_nonnull_fn(id)::text AS "y" FROM users`, FnSchema>;
type _T17 = RequireTrue<AssertEqual<T17, { y: string }>>;

// A per-fn entry OVERRIDES a built-in target (step-1 precedence): `make_label`
// declares `casts.text = Label`, so `make_label(id)::text` is the brand, not
// plain `string`.
type T18 = QueryResult<`SELECT make_label(id)::text AS "l" FROM users`, FnSchema>;
type _T18 = RequireTrue<AssertEqual<T18, { l: Label }>>;
// Adversarial: it is NOT plain `string`.
type _T18_not_string = RequireTrue<AssertEqual<AssertEqual<T18, { l: string }>, false>>;

// RETIREMENT of the `ModeledFnCastReturn` heuristic: a modeled scalar fn under
// `::json` with NO `casts.json` entry no longer falls back to `returns` — it is
// the uninformative built-in `unknown`.
type T19 = QueryResult<`SELECT convert_currency(id)::json AS "x" FROM users`, FnSchema>;
type _T19 = RequireTrue<AssertEqual<T19, { x: unknown }>>;

// ===========================================================================
// SCHEMA-GLOBAL CAST (`schema.casts`) — custom/domain target types resolved by
// target name alone, gated by the uninformative built-in check.
// ===========================================================================

// `::citext` → declared `string` (citext is not a built-in scalar).
type G1 = QueryResult<`SELECT email::citext AS "c" FROM users`, FnSchema>;
type _G1 = RequireTrue<AssertEqual<G1, { c: string }>>;

// `::geometry` → the declared custom type.
type G2 = QueryResult<`SELECT id::geometry AS "g" FROM users`, FnSchema>;
type _G2 = RequireTrue<AssertEqual<G2, { g: Geometry }>>;

// `::geometry[]` → array wrap of the base entry (pins array-decompose-before-gate).
type G3 = QueryResult<`SELECT id::geometry[] AS "g" FROM users`, FnSchema>;
type _G3 = RequireTrue<AssertEqual<G3, { g: Geometry[] }>>;

// `::PUBLIC.GEOMETRY` → qualified + case-insensitive match of the base key.
type G4 = QueryResult<`SELECT id::PUBLIC.GEOMETRY AS "g" FROM users`, FnSchema>;
type _G4 = RequireTrue<AssertEqual<G4, { g: Geometry }>>;

// A `casts` map does NOT redefine a built-in target (uninformative gate):
// `id::text` → built-in `string`, not anything from `casts`.
type G5 = QueryResult<`SELECT id::text AS "x" FROM users`, FnSchema>;
type _G5 = RequireTrue<AssertEqual<G5, { x: string }>>;

// Chained cast strips to the final target before lookup: `email::text::geometry`
// → `geometry` (last cast wins).
type G6 = QueryResult<`SELECT email::text::geometry AS "g" FROM users`, FnSchema>;
type _G6 = RequireTrue<AssertEqual<G6, { g: Geometry }>>;

// Inner nullability (step-2 rule), same `casts.geometry` entry serving both:
// a bare nullable JOIN ref propagates `| null` via the join-null post-pass…
type G7 = QueryResult<
    `SELECT s.tracking::geometry AS "g" FROM orders o LEFT JOIN shipments s ON s.order_id = o.id`,
    FnSchema
>;
type _G7 = RequireTrue<AssertEqual<G7, { g: Geometry | null }>>;
// …while a non-null ref from the same entry stays non-null.
type G8 = QueryResult<
    `SELECT o.id::geometry AS "g" FROM orders o LEFT JOIN shipments s ON s.order_id = o.id`,
    FnSchema
>;
type _G8 = RequireTrue<AssertEqual<G8, { g: Geometry }>>;

// A schema-declared NULLABLE function inner propagates `| null` via
// `CastInnerFnIsNullable` (`convert_currency` is nullable).
type G9 = QueryResult<`SELECT convert_currency(id)::geometry AS "g" FROM users`, FnSchema>;
type _G9 = RequireTrue<AssertEqual<G9, { g: Geometry | null }>>;

// ---------------------------------------------------------------------------
// SCHEMA-GLOBAL CAST — nullability GAPS (pinned as known limitations). Base
// column nullability is DROPPED by any cast (custom or built-in) — only a
// join-null bare ref or a nullable schema-fn inner re-adds `| null`. These
// single-table inners (`shipments.tracking`, `categories.parent_id` are
// base-nullable) therefore type non-null, EXACTLY as `::text` would. Not
// regressions; recover with coalesce / a per-fn entry / a nullable target.
// ---------------------------------------------------------------------------

// Built-in function inner — `lower` is not schema-declared → non-null
// (mirrors `lower(tracking)::text` → string).
type N1 = QueryResult<`SELECT lower(tracking)::citext AS "c" FROM shipments`, FnSchema>;
type _N1 = RequireTrue<AssertEqual<N1, { c: string }>>;

// Parenthesized base-nullable ref — not a simple ref, no function name → non-null
// (mirrors `(tracking)::text` → string).
type N2 = QueryResult<`SELECT (tracking)::geometry AS "g" FROM shipments`, FnSchema>;
type _N2 = RequireTrue<AssertEqual<N2, { g: Geometry }>>;

// Nullable arithmetic — base-nullable operand under a custom cast → non-null
// (mirrors `(parent_id + id)::text` → string).
type N3 = QueryResult<`SELECT (parent_id + id)::geometry AS "g" FROM categories`, FnSchema>;
type _N3 = RequireTrue<AssertEqual<N3, { g: Geometry }>>;

// ---------------------------------------------------------------------------
// FUNCTIONAL `CAST(... AS ...)` — the schema-global path works through the
// functional arms, not just `::`.
// ---------------------------------------------------------------------------

type F1 = QueryResult<`SELECT CAST(id AS geometry) AS "g" FROM users`, FnSchema>;
type _F1 = RequireTrue<AssertEqual<F1, { g: Geometry }>>;

type F2 = QueryResult<`SELECT CAST(id AS geometry[]) AS "g" FROM users`, FnSchema>;
type _F2 = RequireTrue<AssertEqual<F2, { g: Geometry[] }>>;

type F3 = QueryResult<`SELECT CAST(id AS public.geometry) AS "g" FROM users`, FnSchema>;
type _F3 = RequireTrue<AssertEqual<F3, { g: Geometry }>>;

// ---------------------------------------------------------------------------
// ADVERSARIAL / BACKWARD-COMPAT.
// ---------------------------------------------------------------------------

// A bare invalid column under a cast is rejected by the `extends never` guard
// BEFORE any `casts` lookup (matches `not_a_col::text` → never).
type A1 = QueryResult<`SELECT not_a_col::json AS "x" FROM users`, FnSchema>;
type _A1 = RequireTrue<AssertEqual<A1, { x: never }>>;

// `::json` with no matching fn/global entry stays `unknown` (unchanged).
type A2 = QueryResult<`SELECT email::json AS "j" FROM users`, FnSchema>;
type _A2 = RequireTrue<AssertEqual<A2, { j: unknown }>>;

// A schema with NO `casts` and NO `functions` resolves every cast exactly as
// before — a custom target stays `unknown`, a built-in resolves normally.
type A3 = QueryResult<`SELECT email::geometry AS "g" FROM users`, WideSchema>;
type _A3 = RequireTrue<AssertEqual<A3, { g: unknown }>>;
type A4 = QueryResult<`SELECT id::text AS "x" FROM users`, WideSchema>;
type _A4 = RequireTrue<AssertEqual<A4, { x: string }>>;

// `nullable_col::json` null-propagation where no entry matches is unchanged
// (`unknown` absorbs the `| null`).
type A5 = QueryResult<
    `SELECT s.tracking::json AS "j" FROM orders o LEFT JOIN shipments s ON s.order_id = o.id`,
    FnSchema
>;
type _A5 = RequireTrue<AssertEqual<A5, { j: unknown }>>;
