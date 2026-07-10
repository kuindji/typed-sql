// tests/builder/acceptance/reporting-pse-payments-filters.test.ts
// Real conditional chain from reporting-v2/src/lib/psePayments.ts —
// `applyQueryBuilderFilters` (lines ~153-270), the long whereIf/applyIf filter
// chain applied on top of the fetchPsePayments base query (lines ~368-407).
//
// The production helper is generic over the OLD 3-generic
// SelectQueryBuilder<Schema, State, Sql>; the new builder is 2-generic, so the
// chain is inlined here on a concrete base query rather than wrapped in a
// generic helper. The conditional calls are preserved verbatim — this is the
// point: it stresses ts-limits on a long whereIf/applyIf chain + type
// resolution. Imported `setPeriod`/`setQueryBuilderPeriod` maps to
// src/builder/testing/setPeriod.js.
//
// rpd. and utm. are referenced by several WHERE clauses; the production query
// joins them (left join "Revolut_PaymentDraft" rpd, left join lateral (...) utm),
// so those joins are reproduced here. The uapTeamId / excludeTeamAttributed
// clauses reference click. only inside subqueries (no top-level join needed) and
// are kept as written.
//
// Representative projection: base query selects `uap.*` in production; we mirror
// that so the row type resolves to the full User_ApprovedPayment shape.
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

// Representative filter values chosen so as many whereIf branches as possible
// activate (deterministic booleans). Each `const` mirrors a PsePaymentsFilter
// field destructured at the top of applyQueryBuilderFilters.
const status = ["pending", "approved"];           // array  → `in (:status)`
const pseId = "pse-1";                             // scalar → `= :pseId`
const orderId = ["o-1", "o-2"];                    // array  → `in (:orderId)`
const revolutDraftId = ["d-1", "d-2"];             // array  → `in (:revolutDraftId)`
const period = "month" as const;                   // truthy → applyIf(setPeriod)
const teamId = "team-1";                           // scalar → coalesce(...) = :teamId
const uapTeamId = "team-2";                         // truthy → coalesce(...) = :uapTeamId
const excludeTeamAttributed = true;                 // truthy → team-exclusion subquery
const teamDraftOnly = true;                         // truthy → rpd team-draft restriction

// --- Base query from psePayments.ts fetchPsePayments (lines ~368-407), then
//     the applyQueryBuilderFilters chain inlined (lines ~173-269) ---
const q = createSelectQuery<ReportingV2Schema>()
    .from(`"User_ApprovedPayment" uap`)
    .join(`left join "Revolut_PaymentDraft" rpd on rpd."id" = uap."revolutDraftId"`)
    .join(`left join lateral (
        select
            count(*)::int as "teamMemberCount",
            (array_agg(tm2."teamId"))[1]::uuid as "teamId"
        from "Team_Member" tm2
        join "Team" t2 on t2."id" = tm2."teamId"
        where tm2."userId" = uap."userId"
          and tm2."disabled" = false
    ) utm on true`)
    .orderBy(`uap."createdAt" desc`)
    .withParams({
        status: status!,
        pseId: pseId!,
        orderId: orderId!,
        revolutDraftId: revolutDraftId!,
        teamId: teamId!,
        uapTeamId: uapTeamId!,
    })
    .whereIf(!!status && Array.isArray(status), `uap."status" in (:status)`)
    .whereIf(!!status && !Array.isArray(status), `uap."status" = :status`)
    .whereIf(!!pseId && Array.isArray(pseId), `uap."userId" in (:pseId)`)
    .whereIf(!!pseId && !Array.isArray(pseId), `uap."userId" = :pseId`)
    .whereIf(!!orderId && Array.isArray(orderId), `uap."networkOrderId" in (:orderId)`)
    .whereIf(!!orderId && !Array.isArray(orderId), `uap."networkOrderId" = :orderId`)
    .whereIf(
        !!revolutDraftId && (revolutDraftId as unknown) !== true && Array.isArray(revolutDraftId),
        `uap."revolutDraftId" in (:revolutDraftId)`,
    )
    .whereIf(
        !!revolutDraftId && (revolutDraftId as unknown) !== true && !Array.isArray(revolutDraftId),
        `uap."revolutDraftId" = :revolutDraftId`,
    )
    .whereIf((revolutDraftId as unknown) === true, `uap."revolutDraftId" is not null`)
    .whereIf((revolutDraftId as unknown) === null, `uap."revolutDraftId" is null`)
    .applyIf(!!period, (b) => setPeriod(b, period!, `uap."createdAt"`))
    .whereIf(
        !!teamId && Array.isArray(teamId),
        `coalesce(rpd."teamId", case when utm."teamMemberCount" = 1 then utm."teamId" else null end) in (:teamId)`,
    )
    .whereIf(
        !!teamId && !Array.isArray(teamId),
        `coalesce(rpd."teamId", case when utm."teamMemberCount" = 1 then utm."teamId" else null end) = :teamId`,
    )
    .whereIf(
        !!uapTeamId,
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
    .whereIf(
        !!excludeTeamAttributed,
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
    .whereIf(!!teamDraftOnly, `rpd."userId" is null and rpd."teamId" is not null`)
    .select(`uap.*`);
// -----------------------------------------------------------------------

describe("reporting psePayments applyQueryBuilderFilters chain", () => {
    it("assembles to a string (long conditional chain resolves)", () => {
        expect(typeof q.toString()).toBe("string");
    });

    it("binds params in first-appearance order across active branches", () => {
        // Active branches (in clause order): status[in], pseId[=], orderId[in],
        // revolutDraftId[in], setPeriod(literals — no binds), teamId[=], uapTeamId[=].
        // teamDraftOnly / excludeTeamAttributed emit no binds. Array binds for
        // `in (:x)` clauses are flattened into one element per value.
        expect([...q.getParams()]).toEqual([
            "pending",
            "approved",
            "pse-1",
            "o-1",
            "o-2",
            "d-1",
            "d-2",
            "team-1",
            "team-2",
        ]);
    });
});

// Type-level: `uap.*` expands to the full User_ApprovedPayment row, preserved
// through the long conditional chain + applyIf(setPeriod).
type Row = SelectBuilderResult<typeof q>;
type _Row = RequireTrue<
    AssertExtends<
        Row,
        {
            id: string;
            userId: string | null;
            networkOrderId: string | null;
            amount: number;
            currency: string;
            createdAt: string;
            revolutDraftId: string | null;
            vat: number;
            status: string;
            teamId: string | null;
        }
    >
>;
