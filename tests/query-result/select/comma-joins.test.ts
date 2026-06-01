/**
 * ADVERSARIAL ROUND 4: comma-separated (ANSI) join sources are ignored past the
 * FIRST table.
 *
 * `from a, b` is standard, portable SQL (the old-style cross join, supported by
 * both Postgres and MySQL). But the table/alias collectors only ever consume the
 * single token immediately after a `from` / `join` / `into` / `update` keyword
 * (`CollectTables`, `src/tables.ts:47`; `CollectAliases`, `src/tables.ts:66`).
 * In `from a, b` the comma is stripped and `b` lands in a non-keyword position,
 * so it is never visited as a table source. The query is NOT bailed out as
 * unparseable — it is actively given a wrong answer in three different ways:
 *
 *   1. VALIDATION false-accept — a nonexistent 2nd+ comma table is never
 *      existence-checked, so the query is reported VALID.
 *   2. RETURN TYPE — the 2nd+ table's columns never enter the projected row.
 *   3. COMPOUND false-reject — a *valid* qualified column on the dropped table
 *      cannot resolve its alias, so a correct query is reported INVALID.
 *
 * The defect is specific to the comma syntax: the explicit `CROSS JOIN` / `JOIN`
 * keyword forms validate and type every table correctly (see GREEN controls),
 * and the FIRST comma table IS checked (`from bogus, users` -> false). Every
 * actual value below was confirmed by probing the compiler.
 */

import type { GetReturnType, ValidateSQL, ValidateFromPart } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema, WideSchema } from "../../fixtures/parser-schemas.js";

// ---------------------------------------------------------------------------
// RED — validation false-accept: a nonexistent comma table escapes the
// existence check because only the first table after FROM is collected.
// ---------------------------------------------------------------------------

// `bogus` is not a table; the fragment must be rejected. Actual: `true`.
type V1 = ValidateFromPart<"users u, bogus b", DeepSchema>;
type _V1 = RequireTrue<AssertEqual<V1, false>>;

// The third comma table is bogus; the fragment must be rejected. Actual: `true`.
type V2 = ValidateFromPart<"users u, products p, bogus b", DeepSchema>;
type _V2 = RequireTrue<AssertEqual<V2, false>>;

// Same hole on the full-query entry point. Actual: `true`.
type V3 = ValidateSQL<"select * from users, bogus", DeepSchema>;
type _V3 = RequireTrue<AssertEqual<V3, false>>;

// ---------------------------------------------------------------------------
// RED — return type: the 2nd+ comma table's columns are dropped from the row.
// ---------------------------------------------------------------------------

// `o.total` belongs to the dropped `orders` table, so it vanishes.
// Actual: `{ email: string }`.
type R1 = GetReturnType<"select u.email, o.total from users u, orders o", WideSchema>;
type _R1 = RequireTrue<AssertEqual<R1, { email: string; total: number }>>;

// `select *` over the comma join must merge BOTH tables' columns (shared `id` /
// `created_at` unioned). Actual: only the `users` columns survive.
type R2 = GetReturnType<"select * from users u, orders o", WideSchema>;
type _R2 = RequireTrue<
    AssertEqual<
        R2,
        {
            id: number;
            name: string;
            email: string;
            created_at: string;
            user_id: number;
            address_id: number;
            status: "pending" | "paid" | "shipped" | "cancelled";
            total: number;
        }
    >
>;

// ---------------------------------------------------------------------------
// RED — compound false-reject: a VALID query is reported invalid because the
// dropped table's alias (`o`) can no longer be resolved.
// ---------------------------------------------------------------------------

// `o.total` is a real column of `orders`; the query is valid. Actual: `false`.
type F1 = ValidateSQL<"select o.total from users u, orders o", WideSchema>;
type _F1 = RequireTrue<AssertEqual<F1, true>>;

// ...and its return type collapses to `{}` for the same reason.
type F2 = GetReturnType<"select o.total from users u, orders o", WideSchema>;
type _F2 = RequireTrue<AssertEqual<F2, { total: number }>>;

// ---------------------------------------------------------------------------
// GREEN controls — verified passing. They prove the defect is specific to the
// comma syntax and honestly scope its blast radius.
// ---------------------------------------------------------------------------

// Two valid comma tables: still accepted (the bug doesn't reject valid pairs).
type G1 = ValidateFromPart<"users u, products p", DeepSchema>;
type _G1 = RequireTrue<AssertEqual<G1, true>>;

type G2 = ValidateFromPart<"orders o, payments pmt", WideSchema>;
type _G2 = RequireTrue<AssertEqual<G2, true>>;

// The explicit CROSS JOIN form DOES catch the bogus table — only commas don't.
type G3 = ValidateFromPart<"users u cross join bogus b", DeepSchema>;
type _G3 = RequireTrue<AssertEqual<G3, false>>;

type G4 = ValidateSQL<"select * from users cross join bogus", DeepSchema>;
type _G4 = RequireTrue<AssertEqual<G4, false>>;

// The FIRST comma table IS validated (the hole is the 2nd+ position only).
type G5 = ValidateSQL<"select * from bogus, users", DeepSchema>;
type _G5 = RequireTrue<AssertEqual<G5, false>>;

// Proper-JOIN twin of R1: the keyword form types both tables correctly.
type G6 = GetReturnType<
    "select u.email, o.total from users u join orders o on o.user_id = u.id",
    WideSchema
>;
type _G6 = RequireTrue<AssertEqual<G6, { email: string; total: number }>>;

// Proper-JOIN twin of F1: the keyword form accepts the valid query.
type G7 = ValidateSQL<
    "select o.total from users u join orders o on o.user_id = u.id",
    WideSchema
>;
type _G7 = RequireTrue<AssertEqual<G7, true>>;

export type CommaJoinsAdversarialLoaded = true;
