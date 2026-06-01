/**
 * ADVERSARIAL round 16: relation scope and alias-resolution boundaries.
 *
 * These are small, ordinary SQL forms. They do not stress recursion depth or
 * TypeScript's instantiation limits; each red assertion targets a relation
 * scope boundary the current validator can plausibly mis-handle.
 */

import type { ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { WideSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// RED: once a table has a range alias, PostgreSQL hides the original table name
// for that query level. The alias form is valid; the base-name qualifier is not.
// ---------------------------------------------------------------------------

type AliasQualifierValid = ValidateSQL<"SELECT p.id FROM products p WHERE p.status = 'active'", WideSchema>;
type _AliasQualifierValid = RequireTrue<AssertEqual<AliasQualifierValid, true>>;

type AliasedTableOriginalQualifierInvalid = ValidateSQL<
    "SELECT products.id FROM products p WHERE p.status = 'active'",
    WideSchema
>;
type _AliasedTableOriginalQualifierInvalid = RequireTrue<
    AssertEqual<AliasedTableOriginalQualifierInvalid, false>
>;

// ---------------------------------------------------------------------------
// RED: tables introduced inside a subquery must not satisfy unqualified column
// refs in the outer WHERE. `users.email` is not in scope at the outer level.
// ---------------------------------------------------------------------------

type CorrelatedSubqueryValid = ValidateSQL<
    "SELECT p.id FROM products p WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)",
    WideSchema
>;
type _CorrelatedSubqueryValid = RequireTrue<AssertEqual<CorrelatedSubqueryValid, true>>;

type OuterWhereCannotUseInnerTableColumn = ValidateSQL<
    "SELECT id FROM products WHERE email = 'x' AND EXISTS (SELECT 1 FROM users)",
    WideSchema
>;
type _OuterWhereCannotUseInnerTableColumn = RequireTrue<
    AssertEqual<OuterWhereCannotUseInnerTableColumn, false>
>;

// ---------------------------------------------------------------------------
// RED: derived tables are ordinary FROM sources. Result inference already has a
// derived-table path; validation should also accept a projected outer column.
// ---------------------------------------------------------------------------

type DerivedProjectedColumnValid = ValidateSQL<
    "SELECT id FROM (SELECT id FROM products) dt",
    WideSchema
>;
type _DerivedProjectedColumnValid = RequireTrue<AssertEqual<DerivedProjectedColumnValid, true>>;

// ---------------------------------------------------------------------------
// RED: a CTE likewise exposes only its output row. The outer query cannot read a
// base-table column that the CTE did not project.
// ---------------------------------------------------------------------------

type CteProjectedColumnValid = ValidateSQL<
    "WITH t AS (SELECT id FROM products) SELECT id FROM t",
    WideSchema
>;
type _CteProjectedColumnValid = RequireTrue<AssertEqual<CteProjectedColumnValid, true>>;

type CteUnprojectedColumnInvalid = ValidateSQL<
    "WITH t AS (SELECT id FROM products) SELECT status FROM t",
    WideSchema
>;
type _CteUnprojectedColumnInvalid = RequireTrue<AssertEqual<CteUnprojectedColumnInvalid, false>>;

// A CTE column alias list renames the exposed row. The alias should be valid in
// the outer query, and the original inner name should not leak through.
type CteColumnAliasValid = ValidateSQL<
    "WITH t(product_id) AS (SELECT id FROM products) SELECT product_id FROM t",
    WideSchema
>;
type _CteColumnAliasValid = RequireTrue<AssertEqual<CteColumnAliasValid, true>>;

type CteColumnAliasHidesInnerName = ValidateSQL<
    "WITH t(product_id) AS (SELECT id FROM products) SELECT id FROM t",
    WideSchema
>;
type _CteColumnAliasHidesInnerName = RequireTrue<AssertEqual<CteColumnAliasHidesInnerName, false>>;

export type ScopeResolutionRound16Loaded = true;
