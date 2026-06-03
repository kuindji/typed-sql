/**
 * ADVERSARIAL round 17: CTE / derived-table exposed-row boundaries.
 *
 * These are small, normal SQL forms. The target is not parser depth; it is the
 * semantic boundary that a CTE or derived table exposes only its projected row
 * to the outer query. The current special validation path checks plain outer
 * projections, but it does not validate outer predicates or refs wrapped inside
 * expressions against that exposed row.
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// ---------------------------------------------------------------------------
// Controls: columns projected by the CTE/derived source are visible outside.
// ---------------------------------------------------------------------------

type CteWhereProjectedColumnValid = ValidateSQL<
    "WITH t AS (SELECT id FROM products) SELECT id FROM t WHERE id = 1",
    WideSchema
>;
type _CteWhereProjectedColumnValid = RequireTrue<AssertEqual<CteWhereProjectedColumnValid, true>>;

type DerivedWhereProjectedColumnValid = ValidateSQL<
    "SELECT id FROM (SELECT id FROM products) dt WHERE dt.id = 1",
    WideSchema
>;
type _DerivedWhereProjectedColumnValid = RequireTrue<AssertEqual<DerivedWhereProjectedColumnValid, true>>;

type DerivedColumnAliasListValid = ValidateSQL<
    "SELECT p.product_id, p.product_title FROM (SELECT id, title FROM products) AS p(product_id, product_title)",
    WideSchema
>;
type _DerivedColumnAliasListValid = RequireTrue<
    AssertEqual<DerivedColumnAliasListValid, true>
>;

type DerivedPartialColumnAliasListValid = ValidateSQL<
    "SELECT p.product_id, p.title FROM (SELECT id, title FROM products) AS p(product_id)",
    WideSchema
>;
type _DerivedPartialColumnAliasListValid = RequireTrue<
    AssertEqual<DerivedPartialColumnAliasListValid, true>
>;

// ---------------------------------------------------------------------------
// RED: outer predicates cannot read columns the CTE did not project.
// ---------------------------------------------------------------------------

type CteWhereUnprojectedColumnInvalid = ValidateSQL<
    "WITH t AS (SELECT id FROM products) SELECT id FROM t WHERE status = 'active'",
    WideSchema
>;
type _CteWhereUnprojectedColumnInvalid = RequireTrue<
    AssertEqual<CteWhereUnprojectedColumnInvalid, false>
>;

type CteWhereQualifiedUnprojectedColumnInvalid = ValidateSQL<
    "WITH t AS (SELECT id FROM products) SELECT id FROM t WHERE t.status = 'active'",
    WideSchema
>;
type _CteWhereQualifiedUnprojectedColumnInvalid = RequireTrue<
    AssertEqual<CteWhereQualifiedUnprojectedColumnInvalid, false>
>;

// ---------------------------------------------------------------------------
// RED: derived-table predicates have the same exposed-row boundary.
// ---------------------------------------------------------------------------

type DerivedWhereUnprojectedColumnInvalid = ValidateSQL<
    "SELECT id FROM (SELECT id FROM products) dt WHERE status = 'active'",
    WideSchema
>;
type _DerivedWhereUnprojectedColumnInvalid = RequireTrue<
    AssertEqual<DerivedWhereUnprojectedColumnInvalid, false>
>;

type DerivedWhereQualifiedUnprojectedColumnInvalid = ValidateSQL<
    "SELECT id FROM (SELECT id FROM products) dt WHERE dt.status = 'active'",
    WideSchema
>;
type _DerivedWhereQualifiedUnprojectedColumnInvalid = RequireTrue<
    AssertEqual<DerivedWhereQualifiedUnprojectedColumnInvalid, false>
>;

type DerivedColumnAliasListHidesOriginalNameInvalid = ValidateSQL<
    "SELECT p.id FROM (SELECT id, title FROM products) AS p(product_id, product_title)",
    WideSchema
>;
type _DerivedColumnAliasListHidesOriginalNameInvalid = RequireTrue<
    AssertEqual<DerivedColumnAliasListHidesOriginalNameInvalid, false>
>;

// ---------------------------------------------------------------------------
// RED: wrapping the unprojected ref in an expression should not bypass the same
// exposed-row check.
// ---------------------------------------------------------------------------

type CteFunctionArgUnprojectedColumnInvalid = ValidateSQL<
    "WITH t AS (SELECT id FROM products) SELECT upper(status) AS product_status FROM t",
    WideSchema
>;
type _CteFunctionArgUnprojectedColumnInvalid = RequireTrue<
    AssertEqual<CteFunctionArgUnprojectedColumnInvalid, false>
>;

type DerivedFunctionArgUnprojectedColumnInvalid = ValidateSQL<
    "SELECT upper(dt.status) AS product_status FROM (SELECT id FROM products) dt",
    WideSchema
>;
type _DerivedFunctionArgUnprojectedColumnInvalid = RequireTrue<
    AssertEqual<DerivedFunctionArgUnprojectedColumnInvalid, false>
>;

export type CteDerivedSurfaceRound17Loaded = true;
