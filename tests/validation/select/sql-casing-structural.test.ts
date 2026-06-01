/**
 * ADVERSARIAL round 10: SQL casing and keyword-looking structural tokens.
 *
 * These cases target syntax that is valid SQL but easy for a shallow token
 * scanner to misread: mixed-case SQL keywords should normalize, quoted
 * identifiers/literals should keep their exact case regardless of query length,
 * and `FROM` inside an operator/expression is not a table-source boundary.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// ---------------------------------------------------------------------------
// SQL keyword casing is insensitive, but double-quoted identifiers are
// case-sensitive: the alias key must stay `CaseSensitiveValue`, never be
// force-lowercased by the normalizer (the literal VALUE itself widens to
// string). NormalizeQuery collapses whitespace before the lowercaser so a long
// query never trips the quote-unaware step-cap bail.
// ---------------------------------------------------------------------------

type LongCaseResult = QueryResult<
    "SELECT id AS a01, id AS a02, id AS a03, id AS a04, id AS a05, id AS a06, id AS a07, id AS a08, id AS a09, id AS a10, 'MiXeD' AS \"CaseSensitiveValue\" FROM users",
    WideSchema
>;
type _LongCaseResult = RequireTrue<
    AssertEqual<
        LongCaseResult,
        {
            a01: number; a02: number; a03: number; a04: number; a05: number;
            a06: number; a07: number; a08: number; a09: number; a10: number;
            CaseSensitiveValue: string;
        }
    >
>;

// Control: ordinary mixed-case SQL syntax and unquoted identifiers are
// case-insensitive and should continue to work.
type MixedKeywordCase = QueryResult<"SeLeCt ID FrOm USERS WhErE EMAIL = 'x'", WideSchema>;
type _MixedKeywordCase = RequireTrue<AssertEqual<MixedKeywordCase, { id: number }>>;

// ---------------------------------------------------------------------------
// RED: quoted SELECT aliases are legal ORDER BY targets even when they contain
// spaces. The scoped ORDER BY alias token scan splits inside the double quotes.
// ---------------------------------------------------------------------------

type QuotedOrderAlias = ValidateSQL<'SELECT id AS "Order ID" FROM users ORDER BY "Order ID"', WideSchema>;
type _QuotedOrderAlias = RequireTrue<AssertEqual<QuotedOrderAlias, true>>;

// Control: unquoted ORDER BY aliases already work.
type BareOrderAlias = ValidateSQL<"SELECT id AS user_id FROM users ORDER BY user_id", WideSchema>;
type _BareOrderAlias = RequireTrue<AssertEqual<BareOrderAlias, true>>;

// ---------------------------------------------------------------------------
// RED: quoted table aliases can contain spaces. A quoted alias is one
// identifier, not two table-source tokens.
// ---------------------------------------------------------------------------

type QuotedTableAlias = ValidateSQL<'SELECT "user alias".id FROM users AS "user alias"', WideSchema>;
type _QuotedTableAlias = RequireTrue<AssertEqual<QuotedTableAlias, true>>;

// Control: quoted table aliases without spaces continue to work.
type SimpleQuotedTableAlias = ValidateSQL<'SELECT "u1".id FROM users AS "u1"', WideSchema>;
type _SimpleQuotedTableAlias = RequireTrue<AssertEqual<SimpleQuotedTableAlias, true>>;

// ---------------------------------------------------------------------------
// RED: `IS DISTINCT FROM` / `IS NOT DISTINCT FROM` are comparison operators.
// The `from` token inside the operator must not be collected as a table source.
// ---------------------------------------------------------------------------

type IsDistinctFrom = ValidateSQL<"SELECT id FROM products WHERE status IS DISTINCT FROM 'active'", WideSchema>;
type _IsDistinctFrom = RequireTrue<AssertEqual<IsDistinctFrom, true>>;

type IsNotDistinctFrom = ValidateSQL<"SELECT id FROM products WHERE status IS NOT DISTINCT FROM 'active'", WideSchema>;
type _IsNotDistinctFrom = RequireTrue<AssertEqual<IsNotDistinctFrom, true>>;

// Control: invalid columns near the same operator should still be rejected.
type IsDistinctFromBadColumn = ValidateSQL<"SELECT id FROM products WHERE bogus_col IS DISTINCT FROM 'active'", WideSchema>;
type _IsDistinctFromBadColumn = RequireTrue<AssertEqual<IsDistinctFromBadColumn, false>>;

export type SqlCasingStructuralRound10Loaded = true;
