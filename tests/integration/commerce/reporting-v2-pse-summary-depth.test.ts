/**
 * Regression guard (NOW GREEN): TheFloorr reporting-v2 PSE-payments grouped
 * summary query (serverless/api/reporting-v2/src/lib/psePayments.ts,
 * fetchPsePaymentsSummary). This was a VERIFIED-RED depth repro — compiling the
 * real query tripped TS2589 ("Type instantiation is excessively deep") at the
 * grouped-summary projection, and as collateral the inferred row degraded:
 * aggregate `sum(...)::float8 as "amount"` resolved to `never`, and branded
 * columns (User_id / Team_id / User_ApprovedPayment_id) lost their brand — so
 * the production `satisfies PsePaymentGroupped[]` no longer held.
 *
 * Fixed by: (1) flat With-star/FlagNewConditional rebuilds + balanced merges (depth);
 * (2) expressions.ts top-level-cast detection + redundant-paren unwrap so
 * `sum(...)::float8` / `((case ...)::text)` take their cast type instead of
 * `never`/`unknown`; (3) `MergeRowProj` informativeness-preferring projection
 * merge so a duplicate output alias from two mutually-exclusive `selectIf`
 * branches (`uap."userId" as "pseId"` vs `null::uuid as "pseId"`) keeps the
 * branded type rather than the later `null::<type>` literal.
 *
 * This is a FAITHFUL port (heavy multi-expression projection + the ~17-call
 * .whereIf() chain + the setPeriod 3-clause range against a realistic, branded
 * schema). Minimal repros do NOT trigger the depth blow-up — the FULL query
 * does. The assertions below are the CORRECT/desired result and now hold.
 */
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import type {
    MergeOverrides,
    SelectBuilderResult,
    SelectQueryBuilder,
    SqlTag,
} from "../../../src/builder/index.js";
import type { DatabaseSchema } from "../../../src/index.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type {
    AssertEqual,
    AssertExtends,
    RequireTrue,
} from "../../fixtures/helpers.js";

// Currency union — exact members are irrelevant to the depth repro, this just
// stands in for @common/types' Currency so the override key carries a union.
type Currency = "GBP" | "USD" | "EUR";

// ---------------------------------------------------------------------------
// Branded schema, LOCAL to this test. The shared ReportingV2Schema fixture
// uses plain `string` columns (other tests depend on that), but the brand-loss
// collateral only surfaces when the source columns actually carry a brand. So
// here we take the shared schema's public tables and override ONLY the tables
// this query joins with branded id columns — faithful to TheFloorr's
// fieldTypes.ts (`<col> = string & { __table: "<Table>" }`). Confined to this
// file so no other test fixture/assertion is affected.
// ---------------------------------------------------------------------------
type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

type Branded<T extends string> = string & { __table: T };
type User_id = Branded<"User">;
type Team_id = Branded<"Team">;
type Network_Order_id = Branded<"Network_Order">;
type Revolut_PaymentDraft_id = Branded<"Revolut_PaymentDraft">;
type User_ApprovedPayment_id = Branded<"User_ApprovedPayment">;
type User_ApprovedPayment_Item_id = Branded<"User_ApprovedPayment_Item">;
type Network_Order_CJ_Item_id = Branded<"Network_Order_CJ_Item">;
type Network_Order_Partnerize_Item_id = Branded<"Network_Order_Partnerize_Item">;
type Network_Order_Rakuten_Item_id = Branded<"Network_Order_Rakuten_Item">;

type BasePublic = ReportingV2Schema["schemas"]["public"];

// Branded overrides for the tables the PSE-summary query touches. Column TS
// types (brands + nullability) mirror tableTypes.ts/fieldTypes.ts exactly.
type BrandedTables = {
    User_ApprovedPayment: {
        id: User_ApprovedPayment_id;
        userId: User_id | null;
        networkOrderId: Network_Order_id | null;
        type: number | null;
        amount: number;
        currency: string;
        comment: string | null;
        createdAt: string;
        paid: boolean;
        paymentMonth: string | null;
        revolutDraftId: Revolut_PaymentDraft_id | null;
        revolutReference: string | null;
        vat: number;
        status: string;
        teamId: Team_id | null;
    };
    User_ApprovedPayment_Item: {
        id: User_ApprovedPayment_Item_id;
        userApprovedPaymentId: User_ApprovedPayment_id;
        rakutenItemId: Network_Order_Rakuten_Item_id | null;
        cjItemId: Network_Order_CJ_Item_id | null;
        partnerizeItemId: Network_Order_Partnerize_Item_id | null;
        amount: number;
        vat: number;
        currency: string;
        anyItemId: string;
    };
    User: BasePublic["User"] & {
        id: User_id;
        givenName: string | null;
        familyName: string | null;
    };
    Revolut_PaymentDraft: {
        id: Revolut_PaymentDraft_id;
        userId: User_id | null;
        amount: number;
        currency: string;
        status: string;
        createdAt: string;
        revolutDraftId: string | null;
        reference: string;
        transactionId: string | null;
        metadata: Json | null;
        vat: number;
        teamId: Team_id | null;
    };
    Revolut_Counterparty: {
        id: string;
        userId: User_id;
        counterpartyId: string;
        updatedAt: string;
    };
    Team: {
        id: Team_id;
        name: string;
    };
    Team_Member: {
        id: string;
        teamId: Team_id;
        userId: User_id;
        teamRoleId: string | null;
        disabled: boolean;
        role: string;
        accessSettings: Json | null;
        createdAt: string;
    };
    Team_Revolut_Counterparty: {
        id: string;
        teamId: Team_id;
        counterpartyId: string;
        updatedAt: string;
    };
    Network_Order: BasePublic["Network_Order"] & {
        id: Network_Order_id;
        clickId: string | null;
    };
    LogProductClick: BasePublic["LogProductClick"] & {
        teamId: Team_id | null;
        sid: string | null;
    };
    Network_Order_CJ_Item: BasePublic["Network_Order_CJ_Item"] & {
        id: Network_Order_CJ_Item_id;
        sku: string;
    };
    Network_Order_Partnerize_Item: BasePublic["Network_Order_Partnerize_Item"] & {
        id: Network_Order_Partnerize_Item_id;
        sku: string;
        name: string;
    };
    Network_Order_Rakuten_Item: BasePublic["Network_Order_Rakuten_Item"] & {
        id: Network_Order_Rakuten_Item_id;
        sku: string;
        product: string;
    };
};

type PseSummarySchema = {
    defaultSchema: "public";
    schemas: {
        public: Omit<BasePublic, keyof BrandedTables> & BrandedTables;
    };
};

// ---------------------------------------------------------------------------
// Expected result type — mirror of psePayments.ts PsePaymentGroupped (the
// production `satisfies` target). Branded ids match TheFloorr's fieldTypes.ts.
// ---------------------------------------------------------------------------
type PsePaymentGroupped = {
    // pseId/pseName are set when groupBy === "pseId"; null on team rows.
    pseId?: User_id | null;
    pseName?: string | null;
    currency: Currency;
    amount: number;
    vat: number;
    total: number;
    hasBankDetails: boolean;
    hasTeamBankDetails: boolean;
    teamName: string | null;
    teamId: Team_id | null;
    approvedPaymentIds: User_ApprovedPayment_id[];
};

// ---------------------------------------------------------------------------
// applyQueryBuilderFilters — faithful mirror of psePayments.ts lines ~152-271:
// the ~17 .whereIf() clauses + the .applyIf(setPeriod...) range. SQL text is
// reproduced verbatim (subqueries / coalesce / exists / case) because the text
// content is what drives the instantiation depth the repro depends on. Runtime
// conditions are fixed booleans here (we only type-check); they don't change
// the produced Sql-tag type, which records every whereIf fragment regardless.
// ---------------------------------------------------------------------------
function applyQueryBuilderFilters<
    Schema extends DatabaseSchema,
    Sql extends SqlTag,
>(
    select: SelectQueryBuilder<Schema, Sql>,
): SelectQueryBuilder<Schema, Sql> {
    return select
        .withParams({
            status: "approved",
            pseId: "u1",
            orderId: "o1",
            revolutDraftId: "d1",
            teamId: "t1",
            uapTeamId: "t1",
        })
        .whereIf(true, `uap."status" in (:status)`)
        .whereIf(false, `uap."status" = :status`)
        .whereIf(false, `uap."userId" in (:pseId)`)
        .whereIf(false, `uap."userId" = :pseId`)
        .whereIf(false, `uap."networkOrderId" in (:orderId)`)
        .whereIf(false, `uap."networkOrderId" = :orderId`)
        .whereIf(false, `uap."revolutDraftId" in (:revolutDraftId)`)
        .whereIf(false, `uap."revolutDraftId" = :revolutDraftId`)
        .whereIf(false, `uap."revolutDraftId" is not null`)
        .whereIf(false, `uap."revolutDraftId" is null`)
        // .applyIf(!!period, b => setPeriod(b, period!, `uap."createdAt"`)) —
        // setPeriod appends three range whereIf() clauses (between / >= / <=).
        .applyIf(true, (b) => setPeriod(b, "month", `uap."createdAt"`))
        // Filter by resolved team: prefer draft team, then single active membership.
        .whereIf(
            false,
            `coalesce(rpd."teamId", case when utm."teamMemberCount" = 1 then utm."teamId" else null end) in (:teamId)`,
        )
        .whereIf(
            false,
            `coalesce(rpd."teamId", case when utm."teamMemberCount" = 1 then utm."teamId" else null end) = :teamId`,
        )
        // Restrict to UAPs whose own team is the given one.
        .whereIf(
            false,
            `coalesce(
                uap."teamId",
                (
                    select click."teamId"
                    from "Network_Order" o
                    join "LogProductClick" click on click.sid = o."clickId"
                    where o.id = uap."networkOrderId"
                )
            ) = :uapTeamId`,
        )
        // Restrict to non-team-attributed UAPs.
        .whereIf(
            false,
            `(
                uap."teamId" is null
                and (
                    uap."networkOrderId" is null
                    or exists (
                        select 1
                        from "Network_Order" o
                        join "LogProductClick" click on click.sid = o."clickId"
                        where o.id = uap."networkOrderId"
                          and click."teamId" is null
                    )
                )
            )`,
        )
        // Pure team-draft restriction — matches groupBy:"team" semantics.
        .whereIf(
            false,
            `rpd."userId" is null and rpd."teamId" is not null`,
        ) as unknown as SelectQueryBuilder<Schema, Sql>;
}

// ---------------------------------------------------------------------------
// fetchPsePaymentsSummary — faithful mirror of psePayments.ts builder `q`
// (lines ~843-942). Inlines the convert() helper expansion and the team
// resolution expressions exactly as production does.
// ---------------------------------------------------------------------------
const convert = (field: string) =>
    /*sql*/ `convert_currency(
        (${field})::numeric,
        uap."currency",
        'GBP'::text,
        uap."createdAt"::date
    )`;

const resolvedTeamIdExpr = /*sql*/ `coalesce(
    rpd."teamId",
    case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end
)`;
const displayTeamIdExpr = /*sql*/ `coalesce(
    rpd."teamId",
    uap."teamId",
    case when utm."teamMemberCount" = 1 then utm."teamId" else null end
)`;
const displayTeamNameExpr = /*sql*/ `coalesce(
    dt."name",
    uapt."name",
    case when utm."teamMemberCount" = 1 then utm."teamName" else null end
)`;
const rowHasBankDetailsExpr = /*sql*/ `(
    case
        when uap."revolutDraftId" is not null then true
        else (rc."id" is not null or ${resolvedTeamIdExpr} is not null)
    end
)`;
const counterpartyScopeExpr = /*sql*/ `(
    case
        when uap."revolutDraftId" is not null then
            case
                when rpd."teamId" is not null then 'draft:team:' || rpd."teamId"::text
                else 'draft:user'
            end
        when ${resolvedTeamIdExpr} is not null then 'team:' || ${resolvedTeamIdExpr}::text
        when rc."id" is not null then 'user'
        else null
    end
)`;

// groupBy mirrors production `const { groupBy = "pseId" } = options || {}`.
// Sourced from a union-typed input (not a narrowed literal) so the
// `groupBy === "team"` comparisons are legitimate, exactly as in the lambda.
const options: { groupBy?: "pseId" | "team" | null } = { groupBy: "pseId" };
const groupBy = (options.groupBy ?? "pseId") as "pseId" | "team";

const q = createSelectQuery<PseSummarySchema>()
    .from(/*sql*/ `"User_ApprovedPayment" uap`)
    .join(/*sql*/ `left join "User" pse on pse.id = uap."userId"`)
    .join(
        /*sql*/ `left join "Revolut_Counterparty" rc on rc."userId" = uap."userId"`,
    )
    .join(
        /*sql*/ `left join "Revolut_PaymentDraft" rpd on rpd."id" = uap."revolutDraftId"`,
    )
    .join(/*sql*/ `left join "Team" dt on dt."id" = rpd."teamId"`)
    .join(/*sql*/ `left join "Team" uapt on uapt."id" = uap."teamId"`)
    .join(
        /*sql*/ `left join lateral (
            select
                count(*)::int as "teamCounterpartyCount",
                (array_agg(tm."teamId"))[1]::uuid as "teamId",
                (array_agg(t."name"))[1]::text as "teamName"
            from "Team_Member" tm
            join "Team_Revolut_Counterparty" trc on trc."teamId" = tm."teamId"
            join "Team" t on t."id" = tm."teamId"
            where tm."userId" = uap."userId"
              and tm."disabled" = false
        ) utc on true`,
    )
    .join(
        /*sql*/ `left join lateral (
            select
                count(*)::int as "teamMemberCount",
                (array_agg(tm2."teamId"))[1]::uuid as "teamId",
                (array_agg(t2."name"))[1]::text as "teamName"
            from "Team_Member" tm2
            join "Team" t2 on t2."id" = tm2."teamId"
            where tm2."userId" = uap."userId"
              and tm2."disabled" = false
        ) utm on true`,
    )
    .apply((b) => applyQueryBuilderFilters(b))
    .whereIf(
        groupBy === "pseId",
        /*sql*/ `uap."userId" is not null and (uap."revolutDraftId" is null or rpd."userId" is not null)`,
    )
    .whereIf(
        groupBy === "team",
        /*sql*/ `rpd."userId" is null and rpd."teamId" is not null`,
    )
    .groupByIf(groupBy === "pseId", /*sql*/ `uap."userId"`)
    .groupByIf(groupBy === "team", /*sql*/ `rpd."teamId", dt."name"`)
    .selectIf(groupBy === "pseId", [
        /*sql*/ `uap."userId" as "pseId"`,
        /*sql*/ `((array_agg(pse."givenName" || ' ' || pse."familyName"))[1])::text as "pseName"`,
    ])
    .selectIf(groupBy === "team", [
        /*sql*/ `null::uuid as "pseId"`,
        /*sql*/ `null::text as "pseName"`,
    ])
    .select([
        /*sql*/ `'GBP'::text as "currency"`,
        /*sql*/ `(
            bool_and(${rowHasBankDetailsExpr})
            and count(distinct ${counterpartyScopeExpr}) = 1
        )::boolean as "hasBankDetails"`,
        /*sql*/ `(
            count(distinct ${resolvedTeamIdExpr}) = 1
            and (array_agg(${resolvedTeamIdExpr}))[1] is not null
        )::boolean as "hasTeamBankDetails"`,
        /*sql*/ `((
            case
                when count(distinct ${displayTeamIdExpr}) = 1
                then (array_agg(${displayTeamNameExpr}))[1]::text
                else null
            end
        )::text) as "teamName"`,
        /*sql*/ `(
            case
                when count(distinct ${displayTeamIdExpr}) = 1
                then (array_agg(${displayTeamIdExpr}))[1]::text
                else null
            end
        ) as "teamId"`,
        /*sql*/ `(array_agg(uap."id"))::text[] as "approvedPaymentIds"`,
        /*sql*/ `sum(${convert(`uap."amount"`)})::float8 as "amount"`,
        /*sql*/ `sum(${convert(`uap."vat"`)})::float8 as "vat"`,
        /*sql*/ `sum(${convert(`uap."amount" + uap."vat"`)})::float8 as "total"`,
    ]);

// ---------------------------------------------------------------------------
// Replicate the row type computed at the call site:
//   db.main.typedSelect<typeof q, Overrides>(q)
// which (per packages/common/src/db/api.ts mainTypedSelect builder overload)
// returns data: MergeOverrides<SelectBuilderResult<typeof q>, Overrides>[].
// ---------------------------------------------------------------------------
type Overrides = {
    currency: Currency;
    approvedPaymentIds: User_ApprovedPayment_id[];
    teamId: Team_id | null;
};

type R = MergeOverrides<SelectBuilderResult<typeof q>, Overrides>;

// Runtime touch so the builder/query value is "used" (bun test loads the file).
const _qSql: string = q.toString();
void _qSql;

describe("reporting-v2 PSE-payments grouped summary (depth repro)", () => {
    it("assembles the grouped-summary SQL at runtime", () => {
        // Runtime assembly always succeeds — the failure is purely type-level
        // (TS2589 depth + collateral row degradation). This guards against the
        // port silently producing a malformed query string.
        const sql = q.toString();
        expect(sql).toContain(`FROM "User_ApprovedPayment" uap`);
        expect(sql).toContain(`as "amount"`);
        expect(sql).toContain(`as "approvedPaymentIds"`);
        expect(sql).toContain(`GROUP BY uap."userId"`);
    });
});

// ===========================================================================
// RED assertions — written as the CORRECT desired result.
// ===========================================================================

// (1) Top-level repro of `return (data || []) satisfies PsePaymentGroupped[]`.
//     Under the depth blow-up R degrades and no longer extends the target.
const _rows: R[] = [];
void _rows;
type _Satisfies = RequireTrue<AssertExtends<R, PsePaymentGroupped>>;

// (2) Granular localizers so the fixer sees the collateral precisely.

//     `sum(...)::float8 as "amount"` should be number; degrades to never today.
type _Amount = RequireTrue<AssertEqual<R["amount"], number>>;
type _Vat = RequireTrue<AssertEqual<R["vat"], number>>;
type _Total = RequireTrue<AssertEqual<R["total"], number>>;

//     Branded pseId — brand currently dropped under instantiation pressure.
type _PseIdBrand = RequireTrue<
    AssertExtends<NonNullable<R["pseId"]>, { __table: "User" }>
>;

// Marker so the file is a non-empty module even if everything above elides.
export type ReportingV2PseSummaryDepthRepro = R;
