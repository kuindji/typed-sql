/**
 * Outer-join nullability propagation into TOP-LEVEL ARITHMETIC projections.
 *
 * SQL NULL arithmetic is NULL: if any operand of `A op B` comes from the
 * nullable side of an outer join, the projected value can be NULL at runtime,
 * so the inferred type must be `number | null` — `number` would be a lie.
 *
 * Rules pinned here:
 * - any operand qualified by a nullable-side alias -> `number | null`;
 * - all operands from the non-nullable side (or literals) -> `number`;
 * - inner joins add nothing;
 * - plain-ref and coalesce projections keep their existing behavior
 *   (`coalesce` is nullable only if EVERY arg is — Postgres semantics),
 *   including `coalesce(...)` used as an arithmetic OPERAND.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// nullable-side column * literal -> number | null (qualifier-first operand)
type N1 = QueryResult<
    "SELECT o.total * 2 AS doubled FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N1 = RequireTrue<AssertEqual<N1, { doubled: number | null }>>;

// literal * nullable-side column -> number | null (qualifier NOT leftmost)
type N2 = QueryResult<
    "SELECT 2 * o.total AS doubled FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N2 = RequireTrue<AssertEqual<N2, { doubled: number | null }>>;

// non-nullable-side column + literal -> number (left side of the join is firm)
type N3 = QueryResult<
    "SELECT u.id + 1 AS bumped FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N3 = RequireTrue<AssertEqual<N3, { bumped: number }>>;

// mixed sides -> number | null (the nullable operand poisons the result)
type N4 = QueryResult<
    "SELECT u.id + o.total AS mixed FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N4 = RequireTrue<AssertEqual<N4, { mixed: number | null }>>;

// plain nullable-side ref (no arithmetic) — existing behavior, must not change
type N5 = QueryResult<
    "SELECT o.total AS t FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N5 = RequireTrue<AssertEqual<N5, { t: number | null }>>;

// INNER join: arithmetic over joined columns stays number
type N6 = QueryResult<
    "SELECT o.total * 2 AS d FROM users u JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N6 = RequireTrue<AssertEqual<N6, { d: number }>>;

// spaceless operator, nullable side -> number | null
type N7 = QueryResult<
    "SELECT 2*o.total AS d FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N7 = RequireTrue<AssertEqual<N7, { d: number | null }>>;

// parenthesized nullable operand inside a chain -> number | null
type N8 = QueryResult<
    "SELECT (u.id + o.total) * 2 AS grand FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N8 = RequireTrue<AssertEqual<N8, { grand: number | null }>>;

// coalesce kills the join null even as an arithmetic operand -> number
type N9 = QueryResult<
    "SELECT coalesce(o.total, 0) * 2 AS d FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N9 = RequireTrue<AssertEqual<N9, { d: number }>>;

// aggregate operand from the nullable side -> number | null (an all-NULL
// group sums to NULL; conservative null is the safe direction)
type N10 = QueryResult<
    "SELECT sum(o.total) / count(o.id) AS ratio FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id",
    WideSchema
>;
type _N10 = RequireTrue<AssertEqual<N10, { ratio: number | null }>>;

// plain aggregate projection (no top-level operator) — existing behavior,
// must not change: the arithmetic null pass must not leak into it
type N11 = QueryResult<
    "SELECT sum(o.total) AS s FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id",
    WideSchema
>;
type _N11 = RequireTrue<AssertEqual<N11, { s: number }>>;

// alias-prefix trap: `po` ends with nullable alias `o`; `po.x` must NOT be
// read as an `o.`-qualified ref -> number
type N12 = QueryResult<
    "SELECT po.amount + 1 AS a FROM payments po LEFT JOIN orders o ON o.id = po.order_id",
    WideSchema
>;
type _N12 = RequireTrue<AssertEqual<N12, { a: number }>>;

// coalesce NESTED inside a function-call operand kills the join null too:
// `coalesce(o.total, 0)` has a non-null fallback, so the only nullable-side ref
// (`o.total`) is guarded and the whole `greatest(...)::int` is non-null. The
// arithmetic null pass must see THROUGH the coalesce, not flat-scan for `o.` and
// flag it. This mirrors the real `allocateNaInvoiceSettlements` site
// (`greatest(cap.x - coalesce(t.y, 0), 0)::numeric`). -> number
type N13 = QueryResult<
    "SELECT greatest(u.id - coalesce(o.total, 0), 0)::int AS leftover FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N13 = RequireTrue<AssertEqual<N13, { leftover: number }>>;

// UNGUARDED nullable-side ref inside the same function call stays conservatively
// `number | null`. We model coalesce guards, NOT `greatest`'s own NULL-skipping
// semantics — a bare `o.total` inside the call still propagates join-nullability.
type N14 = QueryResult<
    "SELECT greatest(u.id - o.total, 0)::int AS leftover FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N14 = RequireTrue<AssertEqual<N14, { leftover: number | null }>>;

// over-strip guard: a coalesce whose args are ALL nullable-side is itself
// nullable, so it must NOT be stripped — its refs still propagate. Same shape as
// N13 but the coalesce fallback (`o.user_id`) is also nullable. -> number | null
type N15 = QueryResult<
    "SELECT greatest(u.id - coalesce(o.total, o.user_id), 0)::int AS leftover FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _N15 = RequireTrue<AssertEqual<N15, { leftover: number | null }>>;

export type ArithmeticJoinNullabilityLoaded = true;
