/**
 * Regression guard (CURRENTLY RED): the commerce reporting-v2 link summaries
 * query (serverless/api/reporting-v2/src/lib/links.ts, fetchLinkOrderSums /
 * fetchLinkClickSum, groupBy === "pseId" branch).
 *
 * The production projection labels each PSE group with an UNCAST array_agg
 * subscript over a string-concat:
 *
 *     (array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel"
 *
 * which must infer `groupLabel: string | null` (a `text[]` subscript is a
 * nullable `text`). Under the round-25 `ConcatType` change in
 * src/expressions.ts (the `||` branch now resolves operand-array-ness via a
 * recursive `ExprType<L>` instead of the historical flat `string`), the EXTRA
 * per-`||` instantiation cost tips THIS query over its budget and `groupLabel`
 * collapses to the conservative `unknown` — breaking the production
 * `const rows: LinkOrderSum[] = data ?? []` assignment with TS2322.
 *
 * Reproduction is COST-sensitive, not text-sensitive — the identical expression
 * resolves to `string | null` in isolation. Three ingredients are needed, all
 * present in the real lambda and faithfully mirrored below:
 *   1. the heavy 10-column `convert_currency(...)` aggregate projection,
 *   2. the `groupBy === "pseId" ? <array_agg branch> : <null branch>` TERNARY,
 *      so `typeof q` is a UNION of two heavy builder types (≈2x the cost),
 *   3. the trailing group/orderBy/offsetIf/limitIf clauses.
 * Drop any one and the query falls back under budget and (wrongly) goes green.
 *
 * Bisected: reverting ONLY the `ConcatType` hunk (`? ConcatType<...>` back to
 * `? string`) turns this test green again, confirming the cause. The fix should
 * make the `||`-operand array check cheap enough that this query stays under
 * budget (the assertion below is the CORRECT desired result).
 */
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;

// groupBy sourced from a union (not a narrowed literal) so the ternary below is
// a genuine type-level union, exactly as in the lambda's `LinksGroup` options.
const groupBy = "pseId" as "pseId" | "retailerId";

// convert_currency() expansion — interpolated runtime values, so each fragment
// is a wide `string` (mirrors links.ts convert()). The `group` expression is
// likewise dynamic/opaque (`groupByFields[groupBy]`), pinned at the call site.
const convertTo = "GBP" as string;
const convert = (field: string) =>
    /*sql*/ `convert_currency((${field})::numeric, ordr."currency", '${convertTo}'::text, ordr."orderDate"::date)`;
const groupExpr = `l."referenceUserId"` as string;

// base: "Link" -> click -> order, with the heavy aggregate projection.
const base = createSelectQuery<S>()
    .from(/*sql*/ `"Link" l`)
    .join(/*sql*/ `inner join "LogProductClick" lpc on lpc."linkId" = l."id"`)
    .join(/*sql*/ `inner join "Network_Order" ordr on ordr."clickId" = lpc."sid"`)
    .select([
        /*sql*/ `'${convertTo}' as "currency"`,
        /*sql*/ `sum(${convert(`ordr."grossSaleAmount"`)}) as "grossSaleAmount"`,
        /*sql*/ `avg(${convert(`ordr."grossSaleAmount"`)}) as "avgGrossSaleAmount"`,
        /*sql*/ `sum(${convert(`ordr."saleAmount"`)}) as "saleAmount"`,
        /*sql*/ `avg(${convert(`ordr."saleAmount"`)}) as "avgSaleAmount"`,
        /*sql*/ `sum(${convert(`ordr."grossCommissionAmount"`)}) as "grossCommissionAmount"`,
        /*sql*/ `avg(${convert(`ordr."grossCommissionAmount"`)}) as "avgGrossCommissionAmount"`,
        /*sql*/ `sum(${convert(`ordr."commissionAmount"`)}) as "commissionAmount"`,
        /*sql*/ `avg(${convert(`ordr."commissionAmount"`)}) as "avgCommissionAmount"`,
        /*sql*/ `count(*) as "orderCount"`,
    ]);

// TERNARY UNION: pseId rows carry an array_agg name label (inner-joined User);
// other groupings have `null as "groupLabel"`. `typeof q` is the union.
const labelled = groupBy === "pseId"
    ? base
        .join(/*sql*/ `inner join "User" pse on pse."id" = l."referenceUserId"`)
        .select([
            /*sql*/ `(array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel"`,
        ])
    : base.select([/*sql*/ `null as "groupLabel"`]);

const grouped = labelled
    .select(/*sql*/ `${groupExpr} as "group"`)
    .groupBy(groupExpr);

const q = grouped
    .orderBy(/*sql*/ `sum(${convert(`ordr."commissionAmount"`)}) desc`)
    .offsetIf(true, 0)
    .limitIf(true, 50);

type Row = SelectBuilderResult<typeof q>;

// Runtime touch so bun loads the file and the builder value is "used".
const _qSql: string = q.toString();
void _qSql;

describe("reporting-v2 link summaries (groupLabel depth repro)", () => {
    it("assembles the grouped link-summary SQL at runtime", () => {
        // Runtime assembly always succeeds — the failure is purely type-level
        // (groupLabel degrading to `unknown`). This guards against the port
        // silently producing a malformed query string.
        const sql = q.toString();
        expect(sql).toContain(`FROM "Link" l`);
        expect(sql).toContain(`as "groupLabel"`);
        expect(sql).toContain(`as "orderCount"`);
    });
});

// ===========================================================================
// RED assertion — written as the CORRECT desired result.
// `(array_agg(text || text))[1]` is a nullable text subscript → string | null.
// Under the round-25 ConcatType cost regression it degrades to `unknown`.
// ===========================================================================
type _GroupLabel = RequireTrue<AssertEqual<Row["groupLabel"], string | null>>;

// Marker so the file is a non-empty module even if the assertion above elides.
export type ReportingV2LinkSumsDepthRepro = Row;
