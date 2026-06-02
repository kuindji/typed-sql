/**
 * revolut builder duplicates (SELECT only) — mirrors of the raw SELECTs in
 * commerce app, area: revolut.
 *
 * DML statements (INSERT/UPDATE/DELETE) are intentionally omitted — the
 * builder under test only assembles SELECT queries. The type assertion is the
 * point; complex selects use a smoke `typeof === "string"` assert, simple ones
 * assert the exact normalized SQL.
 *
 * All against db.main.* => ReportingV2Schema.
 *
 * SCHEMA-GAP (column absent from fixture; intended row type kept anyway):
 *   - Team_Revolut_Counterparty."counterpartyId"
 *   - Revolut_Counterparty."counterpartyId"
 *   - Team_Member."role" / "accessSettings" / "createdAt"
 */
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    normalizeWhitespace,
} from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type { Json, ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

// --- payments.ts:124-133 — re-batch guard (IN-list materialized) ---
const qPaymentGuard = createSelectQuery<ReportingV2Schema>()
    .withParams({ id1: "a", id2: "b" })
    .from(`"User_ApprovedPayment"`)
    .where(`id in (:id1, :id2)`)
    .where(`("revolutDraftId" is not null or "status" not in ('approved','re-approved'))`)
    .select(`id`);

// --- payments.ts:158-166 — cohort-sum guard ---
const qPaymentValid = createSelectQuery<ReportingV2Schema>()
    .withParams({ id1: "a", id2: "b", expected: "10" })
    .from(`"User_ApprovedPayment" uap`)
    .where(`uap.id in (:id1, :id2)`)
    .select(`abs(sum(convert_currency(uap."amount"::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date) + convert_currency(uap."vat"::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date)) - :expected::float) < 0.1 as "valid"`);

// --- payments.ts:344-350 / webhook.ts:37-40 — select * by id ---
const qDraftById = createSelectQuery<ReportingV2Schema>()
    .withParams({ id: "d1" })
    .from(`"Revolut_PaymentDraft"`)
    .where(`id = :id`)
    .select(`*`);

// --- teamPayment.ts:20-24 / counterparty.ts:75-78 / teamCounterparty.ts:48-52 ---
// --- team counterparty lookup (SCHEMA-GAP counterpartyId) ---
const qTeamCpId = createSelectQuery<ReportingV2Schema>()
    .withParams({ teamId: "t1" })
    .from(`"Team_Revolut_Counterparty"`)
    .where(`"teamId" = :teamId`)
    .select(`"counterpartyId"`);

// --- teamPayment.ts:167-173 — team-attribution mismatch (joins + coalesce) ---
const qTeamMismatch = createSelectQuery<ReportingV2Schema>()
    .withParams({ id1: "a", id2: "b", teamId: "t1" })
    .from(`"User_ApprovedPayment" uap`)
    .join(`left join "Network_Order" o on o.id = uap."networkOrderId"`)
    .join(`left join "LogProductClick" click on click.sid = o."clickId"`)
    .where(`uap.id in (:id1, :id2)`)
    .where(`coalesce(uap."teamId", click."teamId") is distinct from :teamId`)
    .select(`uap.id`);

// --- teamPayment.ts:204-211 — cohort-sum guard (current_date variant) ---
const qTeamPaymentValid = createSelectQuery<ReportingV2Schema>()
    .withParams({ id1: "a", id2: "b", expected: "10" })
    .from(`"User_ApprovedPayment" uap`)
    .where(`uap.id in (:id1, :id2)`)
    .select(`abs(sum(convert_currency(uap."amount"::numeric, uap."currency", 'GBP'::text, current_date) + convert_currency(uap."vat"::numeric, uap."currency", 'GBP'::text, current_date)) - :expected::float) < 0.1 as "valid"`);

// --- counterparty.ts:14-18 — getUserCounterypartyId (SCHEMA-GAP counterpartyId) ---
const qUserCpId = createSelectQuery<ReportingV2Schema>()
    .withParams({ userId: "u1" })
    .from(`"Revolut_Counterparty"`)
    .where(`"userId" = :userId`)
    .select(`"counterpartyId"`);

// --- counterparty.ts:99-108 — resolve team counterparties via membership ---
// (SCHEMA-GAP Team_Revolut_Counterparty.counterpartyId, Team_Member.createdAt) ---
const qTeamMembershipCp = createSelectQuery<ReportingV2Schema>()
    .withParams({ userId: "u1", teamId: "t1" })
    .from(`"Team_Member" tm`)
    .join(`join "Team_Revolut_Counterparty" trc on trc."teamId" = tm."teamId"`)
    .where(`tm."userId" = :userId`)
    .where(`tm."disabled" = false`)
    .where(`(:teamId::uuid is null or tm."teamId" = :teamId::uuid)`)
    .orderBy(`tm."createdAt" desc, tm."teamId" asc`)
    .limit(2)
    .select(`trc."counterpartyId", tm."teamId"`);

// --- teamCounterparty.ts:21-27 — checkTeamPaymentAccess ---
// (SCHEMA-GAP Team_Member.role, Team_Member.accessSettings) ---
const qTeamMemberAccess = createSelectQuery<ReportingV2Schema>()
    .withParams({ userId: "u1", teamId: "t1" })
    .from(`"Team_Member"`)
    .where(`"userId" = :userId`)
    .where(`"teamId" = :teamId`)
    .where(`"disabled" = false`)
    .select(`"role", "accessSettings"`);

// --- webhook.ts:20-23 — getDraftByTransactionId (select *) ---
const qDraftByTxn = createSelectQuery<ReportingV2Schema>()
    .withParams({ txn: "x1" })
    .from(`"Revolut_PaymentDraft"`)
    .where(`"transactionId" = :txn`)
    .select(`*`);

describe("revolut builder duplicates", () => {
    it("qPaymentGuard assembles", () => {
        expect(typeof qPaymentGuard.toString()).toBe("string");
    });
    it("qPaymentValid assembles", () => {
        expect(typeof qPaymentValid.toString()).toBe("string");
    });
    it("qDraftById assembles exact SQL", () => {
        expect(normalizeWhitespace(qDraftById.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentDraft" WHERE id = $1`,
            ),
        );
    });
    it("qTeamCpId assembles exact SQL", () => {
        expect(normalizeWhitespace(qTeamCpId.toString())).toBe(
            normalizeWhitespace(
                `SELECT "counterpartyId" FROM "Team_Revolut_Counterparty" WHERE "teamId" = $1`,
            ),
        );
    });
    it("qTeamMismatch assembles", () => {
        expect(typeof qTeamMismatch.toString()).toBe("string");
    });
    it("qTeamPaymentValid assembles", () => {
        expect(typeof qTeamPaymentValid.toString()).toBe("string");
    });
    it("qUserCpId assembles exact SQL", () => {
        expect(normalizeWhitespace(qUserCpId.toString())).toBe(
            normalizeWhitespace(
                `SELECT "counterpartyId" FROM "Revolut_Counterparty" WHERE "userId" = $1`,
            ),
        );
    });
    it("qTeamMembershipCp assembles", () => {
        expect(typeof qTeamMembershipCp.toString()).toBe("string");
    });
    it("qTeamMemberAccess assembles exact SQL", () => {
        expect(normalizeWhitespace(qTeamMemberAccess.toString())).toBe(
            normalizeWhitespace(
                `SELECT "role", "accessSettings" FROM "Team_Member" ` +
                    `WHERE "userId" = $1 AND "teamId" = $2 AND "disabled" = false`,
            ),
        );
    });
    it("qDraftByTxn assembles exact SQL", () => {
        expect(normalizeWhitespace(qDraftByTxn.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentDraft" WHERE "transactionId" = $1`,
            ),
        );
    });
});

// ---- Type-level row assertions (intended shapes) ----
type Row_PaymentGuard = SelectBuilderResult<typeof qPaymentGuard>;
type _Row_PaymentGuard = RequireTrue<
    AssertEqual<Row_PaymentGuard, { id: string }>
>;

type Row_PaymentValid = SelectBuilderResult<typeof qPaymentValid>;
type _Row_PaymentValid = RequireTrue<
    AssertEqual<Row_PaymentValid, { valid: boolean }>
>;

type Row_DraftById = SelectBuilderResult<typeof qDraftById>;
type _Row_DraftById = RequireTrue<
    AssertEqual<
        Row_DraftById,
        ReportingV2Schema["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type Row_TeamCpId = SelectBuilderResult<typeof qTeamCpId>;
type _Row_TeamCpId = RequireTrue<
    AssertEqual<Row_TeamCpId, { counterpartyId: string }>
>;

type Row_TeamMismatch = SelectBuilderResult<typeof qTeamMismatch>;
type _Row_TeamMismatch = RequireTrue<
    AssertEqual<Row_TeamMismatch, { id: string }>
>;

type Row_TeamPaymentValid = SelectBuilderResult<typeof qTeamPaymentValid>;
type _Row_TeamPaymentValid = RequireTrue<
    AssertEqual<Row_TeamPaymentValid, { valid: boolean }>
>;

type Row_UserCpId = SelectBuilderResult<typeof qUserCpId>;
type _Row_UserCpId = RequireTrue<
    AssertEqual<Row_UserCpId, { counterpartyId: string }>
>;

type Row_TeamMembershipCp = SelectBuilderResult<typeof qTeamMembershipCp>;
type _Row_TeamMembershipCp = RequireTrue<
    AssertEqual<Row_TeamMembershipCp, { counterpartyId: string; teamId: string }>
>;

type Row_TeamMemberAccess = SelectBuilderResult<typeof qTeamMemberAccess>;
type _Row_TeamMemberAccess = RequireTrue<
    AssertEqual<Row_TeamMemberAccess, { role: string; accessSettings: Json | null }>
>;

type Row_DraftByTxn = SelectBuilderResult<typeof qDraftByTxn>;
type _Row_DraftByTxn = RequireTrue<
    AssertEqual<
        Row_DraftByTxn,
        ReportingV2Schema["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;
