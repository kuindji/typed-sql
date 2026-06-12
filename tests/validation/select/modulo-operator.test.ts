/**
 * Modulo (%) operator validation — closes the spaceless `%` gap.
 *
 * Before this round, `%` was absent from HasSpecial and the tokenizer
 * (PadOperators/OperatorToken/DQuotedPunct), so `quantity%2` parsed as a
 * single bogus identifier (false reject) while `a % bogus_col` was silently
 * accepted (the `%` token never blessed its RHS for validation).
 *
 * `%` padding is QUOTE-AWARE (MaybePadModulo): `LIKE '%foo%'` literal
 * interiors are never padded, on any dispatch path. Pinned directly via
 * LooseScanView unit assertions below.
 *
 * If this file compiles without errors, all tests pass.
 */

import type { LooseScanView } from "../../../src/parsing.js";
import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/validation-schemas.js";

// ============================================================================
// Spaceless modulo — was falsely rejected (the gap)
// ============================================================================

// Test: spaceless modulo in the SELECT list validates
type V_SpacelessSelect = ValidateSQL<"SELECT id%2 AS parity FROM users", TestSchema>;
type _M1 = RequireTrue<AssertEqual<V_SpacelessSelect, true>>;

// Test: spaced modulo keeps validating (regression pin)
type V_SpacedSelect = ValidateSQL<"SELECT id % 2 AS parity FROM users", TestSchema>;
type _M2 = RequireTrue<AssertEqual<V_SpacedSelect, true>>;

// Test: spaceless modulo in WHERE validates
type V_SpacelessWhere = ValidateSQL<"SELECT id FROM users WHERE id%2 = 0", TestSchema>;
type _M3 = RequireTrue<AssertEqual<V_SpacelessWhere, true>>;

// Test: spaceless modulo in GROUP BY validates
type V_SpacelessGroupBy = ValidateSQL<"SELECT count(*) AS n FROM users GROUP BY id%2", TestSchema>;
type _M4 = RequireTrue<AssertEqual<V_SpacelessGroupBy, true>>;

// ============================================================================
// Full symmetry — bogus operands around % are now caught
// ============================================================================

// Test: spaced bogus RHS is rejected (was a silent accept before this round:
// `%` was not an OperatorToken, so CanPrecedeColumn never blessed the RHS)
type V_BogusRhsSpaced = ValidateSQL<"SELECT id % bogus_col AS x FROM users", TestSchema>;
type _M5 = RequireTrue<AssertEqual<V_BogusRhsSpaced, false>>;

// Test: spaceless bogus RHS is rejected. NOTE: this is `false` today too,
// but for the WRONG reason (the whole `id%bogus_col` token fails a column
// lookup). It must STAY false once padding splits it properly.
// TRANSIENT: after the HasSpecial fix and BEFORE the tokenizer padding lands,
// this flips to `true` (the whole token is lenient-skipped) — expected mid-round.
type V_BogusRhsSpaceless = ValidateSQL<"SELECT id%bogus_col AS x FROM users", TestSchema>;
type _M6 = RequireTrue<AssertEqual<V_BogusRhsSpaceless, false>>;

// ============================================================================
// LIKE patterns — % inside string literals must never be padded
// ============================================================================

// Test: small quoted query (neutralized path: literal is blanked upstream)
type V_LikeSmall = ValidateSQL<"SELECT id FROM users WHERE name LIKE '%foo%'", TestSchema>;
type _M7 = RequireTrue<AssertEqual<V_LikeSmall, true>>;

// Test: LIKE pattern and a spaceless modulo in the same WHERE
type V_LikeAndModulo = ValidateSQL<
    "SELECT id FROM users WHERE name LIKE '%foo%' AND id%2 = 0",
    TestSchema
>;
type _M8 = RequireTrue<AssertEqual<V_LikeAndModulo, true>>;

// Test: multi-line UPDATE with LIKE + spaceless modulo stays valid
type V_LikeMultilineUpdate = ValidateSQL<
    "UPDATE users\nSET name = 'x'\nWHERE name LIKE '%foo%' AND id%2 = 0",
    TestSchema
>;
type _M9 = RequireTrue<AssertEqual<V_LikeMultilineUpdate, true>>;

// Test: report-scale (>500 chars, exceeds the length budget so literal
// blanking is SKIPPED — ShouldNeutralizeForScan is false) SELECT with a LIKE
// pattern stays valid. Guards the non-neutralized dispatch path end to end.
type V_LikeReportScale = ValidateSQL<
    "SELECT id AS c01, id AS c02, id AS c03, id AS c04, id AS c05, id AS c06, id AS c07, id AS c08, id AS c09, id AS c10, id AS c11, id AS c12, id AS c13, id AS c14, id AS c15, id AS c16, id AS c17, id AS c18, id AS c19, id AS c20, id AS c21, id AS c22, id AS c23, id AS c24, id AS c25, id AS c26, id AS c27, id AS c28, id AS c29, id AS c30, id AS c31, id AS c32, id AS c33, id AS c34, id AS c35, id AS c36, id AS c37, id AS c38, id AS c39, id AS c40, id AS c41, id AS c42, id AS c43, id AS c44, id AS c45, id AS c46, id AS c47, id AS c48 FROM users WHERE name LIKE '%foo%'",
    TestSchema
>;
type _M10 = RequireTrue<AssertEqual<V_LikeReportScale, true>>;

// ============================================================================
// Quoted identifiers containing % — must not be split by padding
// ============================================================================

// Test: a double-quoted alias containing % stays a single token. Without the
// DQuotedPunct strip, padding would explode `"mod%2"` into bogus tokens and
// falsely reject. (The strip rewrites it to `"mod2"` — same treatment as the
// existing `"u,1"` -> `"u1"` behavior.)
type V_QuotedAliasWithPercent = ValidateSQL<
    'SELECT id AS "mod%2" FROM users',
    TestSchema
>;
type _M11 = RequireTrue<AssertEqual<V_QuotedAliasWithPercent, true>>;

// ============================================================================
// Cast-operand chain — stays lenient (never a new rejection)
// ============================================================================

// Test: a cast as the LHS operand of % keeps validating (the `::` routes the
// expression away from token-ref validation; the % padding must not break it)
type V_CastOperandChain = ValidateSQL<"SELECT id::numeric % 10 AS x FROM users", TestSchema>;
type _M12 = RequireTrue<AssertEqual<V_CastOperandChain, true>>;

// ============================================================================
// LooseScanView unit pins — quote-aware padding, precisely
// ============================================================================

// Pin: % is padded OUTSIDE literals, never inside them
type _P1 = RequireTrue<AssertEqual<
    LooseScanView<"where name like '%foo%' and id%2 = 0">,
    "where name like '%foo%' and id % 2 = 0"
>>;

// Pin: %-free input is untouched (gate short-circuits)
type _P2 = RequireTrue<AssertEqual<
    LooseScanView<"where id = 1">,
    "where id = 1"
>>;

// Pin: quote-free input with % gets plain padding
type _P3 = RequireTrue<AssertEqual<
    LooseScanView<"id%2">,
    "id % 2"
>>;

// Pin: unterminated literal — the tail after the opener is copied verbatim
// (lenient: no padding inside what is textually a string literal)
type _P4 = RequireTrue<AssertEqual<
    LooseScanView<"name like '%foo">,
    "name like '%foo"
>>;

// All modulo validator tests pass if this file compiles
export type ModuloValidatorTestsPass = true;
