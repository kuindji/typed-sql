/**
 * ADVERSARIAL round 15: pattern-operator RHS scanning and high-complexity
 * UPDATE aliases.
 *
 * These are deliberately small, ordinary SQL forms. They exercise missing
 * validation surfaces without adding long strings, deep nesting, or tests whose
 * only value is pushing TypeScript's instantiation limits.
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// ---------------------------------------------------------------------------
// RED: `SIMILAR TO` is a pattern-matching operator. Its RHS is an expression,
// so an unquoted unknown column should be rejected just like LIKE/ILIKE RHS.
// ---------------------------------------------------------------------------

type SimilarLiteralPatternValid = ValidateSQL<"SELECT id FROM products WHERE title SIMILAR TO '%shoe%'", WideSchema>;
type _SimilarLiteralPatternValid = RequireTrue<AssertEqual<SimilarLiteralPatternValid, true>>;

type SimilarInvalidRhs = ValidateSQL<"SELECT id FROM products WHERE title SIMILAR TO bogus_col", WideSchema>;
type _SimilarInvalidRhs = RequireTrue<AssertEqual<SimilarInvalidRhs, false>>;

// ---------------------------------------------------------------------------
// RED: `LIKE ... ESCAPE <expr>` has an expression after ESCAPE. A literal escape
// character is valid, but an unknown bareword expression should not disappear.
// ---------------------------------------------------------------------------

type LikeEscapeLiteralValid = ValidateSQL<"SELECT id FROM products WHERE title LIKE 'shoe!%' ESCAPE '!'", WideSchema>;
type _LikeEscapeLiteralValid = RequireTrue<AssertEqual<LikeEscapeLiteralValid, true>>;

type LikeEscapeInvalidExpr = ValidateSQL<"SELECT id FROM products WHERE title LIKE 'shoe!%' ESCAPE bogus_col", WideSchema>;
type _LikeEscapeInvalidExpr = RequireTrue<AssertEqual<LikeEscapeInvalidExpr, false>>;

// ---------------------------------------------------------------------------
// RED: the high-complexity UPDATE validator has its own cheap alias parser. It
// accepts a bare target alias, but mis-parses the standard `AS alias` form.
// ---------------------------------------------------------------------------

type HighComplexityUpdateBareAliasValid = ValidateSQL<
    "UPDATE products p SET status = CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.id = p.id) THEN 'active' ELSE status END WHERE p.id = 1",
    WideSchema
>;
type _HighComplexityUpdateBareAliasValid = RequireTrue<AssertEqual<HighComplexityUpdateBareAliasValid, true>>;

type HighComplexityUpdateAsAliasValid = ValidateSQL<
    "UPDATE products AS p SET status = CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.id = p.id) THEN 'active' ELSE status END WHERE p.id = 1",
    WideSchema
>;
type _HighComplexityUpdateAsAliasValid = RequireTrue<AssertEqual<HighComplexityUpdateAsAliasValid, true>>;

export type PatternUpdateAliasRound15Loaded = true;
