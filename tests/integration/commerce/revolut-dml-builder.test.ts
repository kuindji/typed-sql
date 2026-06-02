/**
 * revolut DML builder mirrors (INSERT / UPDATE / DELETE) — companion to
 * revolut-builder.test.ts (which covers SELECT only). Mirrors of every raw
 * write statement in the commerce app, area: revolut.
 *
 * Setup-only: assertions encode the INTENDED SQL/params/RETURNING shape;
 * failures => engine fix-list.
 *
 * All against db.main.* => ReportingV2Schema.
 *
 * Source statements use Postgres positional params ($1, $2, ...). The fluent
 * builder uses named :params expanded to $1, $2... in first-seen order, so the
 * emitted SQL is the lowercase builder form with the same ordinal placeholders.
 *
 * NOTE: the fixture now DOES carry the counterparty/Team_Member columns these
 * writes touch (counterpartyId, updatedAt, role, accessSettings), so these
 * mirrors are expected to type-check rather than surface as schema gaps.
 */
import { describe, it, expect } from "bun:test";
import {
    createInsertQuery,
    createUpdateQuery,
    createDeleteQuery,
    createSql,
} from "../../../src/builder/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;

// ===========================================================================
// INSERTs
// ===========================================================================

// --- payments.ts:236-240 / teamPayment.ts:266-268 ---
// prepareInsert("Revolut_PaymentDraft", {reference,userId,teamId,amount,vat,
// currency,status}) + returning id. (identical SQL in both files)
const qDraftInsert = createInsertQuery<S>()
    .into(`"Revolut_PaymentDraft"`)
    .value(`"reference"`, ":reference")
    .value(`"userId"`, ":userId")
    .value(`"teamId"`, ":teamId")
    .value(`"amount"`, ":amount")
    .value(`"vat"`, ":vat")
    .value(`"currency"`, ":currency")
    .value(`"status"`, ":status")
    .returning("id")
    .withParams({
        reference: "r1",
        userId: "u1",
        teamId: "t1",
        amount: 10,
        vat: 2,
        currency: "GBP",
        status: "CREATED",
    });

// --- counterparty.ts:174-176 — insert user counterparty ---
const qUserCpInsert = createInsertQuery<S>()
    .into(`"Revolut_Counterparty"`)
    .value(`"userId"`, ":userId")
    .value(`"counterpartyId"`, ":counterpartyId")
    .withParams({ userId: "u1", counterpartyId: "c1" });

// --- teamCounterparty.ts:89-92 — insert team counterparty ---
const qTeamCpInsert = createInsertQuery<S>()
    .into(`"Team_Revolut_Counterparty"`)
    .value(`"teamId"`, ":teamId")
    .value(`"counterpartyId"`, ":counterpartyId")
    .withParams({ teamId: "t1", counterpartyId: "c1" });

// --- webhook.ts:104-108 — insert payment-draft history row ---
const qHistoryInsert = createInsertQuery<S>()
    .into(`"Revolut_PaymentDraft_History"`)
    .value(`"revolutDraftId"`, ":revolutDraftId")
    .value(`"data"`, ":data")
    .value(`"createdAt"`, ":createdAt")
    .withParams({ revolutDraftId: "d1", data: "{}", createdAt: "2024-01-01" });

// ===========================================================================
// UPDATEs
// ===========================================================================

// --- payments.ts:301-305 / teamPayment.ts:338-340 — link UAP to draft ---
// set "revolutDraftId" = $1, "status" = 'created' where id = $2
const qLinkUap = createUpdateQuery<S>()
    .table(`"User_ApprovedPayment"`)
    .set(`"revolutDraftId" = :draftId`)
    .set(`"status" = 'created'`)
    .where(`id = :id`)
    .withParams({ draftId: "d1", id: "p1" });

// --- payments.ts:313-317 / teamPayment.ts:349-351 — write Revolut draft id ---
const qDraftSetRevolutId = createUpdateQuery<S>()
    .table(`"Revolut_PaymentDraft"`)
    .set(`"revolutDraftId" = :revolutDraftId`)
    .where(`id = :id`)
    .withParams({ revolutDraftId: "x1", id: "d1" });

// --- counterparty.ts:159-162 — update user counterparty ---
const qUserCpUpdate = createUpdateQuery<S>()
    .table(`"Revolut_Counterparty"`)
    .set(`"counterpartyId" = :counterpartyId`)
    .set(`"updatedAt" = :updatedAt`)
    .where(`"userId" = :userId`)
    .withParams({ counterpartyId: "c1", updatedAt: "2024-01-01", userId: "u1" });

// --- teamCounterparty.ts:74-78 — update team counterparty ---
const qTeamCpUpdate = createUpdateQuery<S>()
    .table(`"Team_Revolut_Counterparty"`)
    .set(`"counterpartyId" = :counterpartyId`)
    .set(`"updatedAt" = :updatedAt`)
    .where(`"teamId" = :teamId`)
    .withParams({ counterpartyId: "c1", updatedAt: "2024-01-01", teamId: "t1" });

// --- webhook.ts:54-58 — setCommissionsPaid (paid = true literal, no param) ---
const qSetCommissionsPaid = createUpdateQuery<S>()
    .table(`"User_ApprovedPayment"`)
    .set(`"paid" = true`)
    .where(`"revolutDraftId" = :revolutDraftId`)
    .withParams({ revolutDraftId: "d1" });

// --- webhook.ts:124-127 — set transactionId ---
const qDraftSetTxn = createUpdateQuery<S>()
    .table(`"Revolut_PaymentDraft"`)
    .set(`"transactionId" = :transactionId`)
    .where(`id = :id`)
    .withParams({ transactionId: "x1", id: "d1" });

// --- webhook.ts:136-139 (TransactionCreated) / 156-159 (TransactionStateChanged) ---
// set "status" = $1 where id = $2 (identical SQL in both branches)
const qDraftSetStatus = createUpdateQuery<S>()
    .table(`"Revolut_PaymentDraft"`)
    .set(`"status" = :status`)
    .where(`id = :id`)
    .withParams({ status: "completed", id: "d1" });

// ===========================================================================
// DELETEs
// ===========================================================================

// --- payments.ts:286-290 (on reject) / payments.ts:371-375 (removePaymentDraft)
//     / teamPayment.ts:319-320 — delete draft by id (identical SQL) ---
const qDraftDelete = createDeleteQuery<S>()
    .from(`"Revolut_PaymentDraft"`)
    .where(`id = :id`)
    .withParams({ id: "d1" });

// --- counterparty.ts:186-187 — delete user counterparty ---
const qUserCpDelete = createDeleteQuery<S>()
    .from(`"Revolut_Counterparty"`)
    .where(`"userId" = :userId`)
    .withParams({ userId: "u1" });

// --- teamCounterparty.ts:104-107 — delete team counterparty ---
const qTeamCpDelete = createDeleteQuery<S>()
    .from(`"Team_Revolut_Counterparty"`)
    .where(`"teamId" = :teamId`)
    .withParams({ teamId: "t1" });

// ===========================================================================
// Runtime SQL / param assertions
// ===========================================================================

describe("revolut DML builder mirrors — INSERT", () => {
    it("qDraftInsert assembles columns/values + returning", () => {
        expect(qDraftInsert.toString()).toBe(
            `insert into "Revolut_PaymentDraft" ` +
                `("reference", "userId", "teamId", "amount", "vat", "currency", "status") ` +
                `values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        );
        expect([...qDraftInsert.getParams()]).toEqual([
            "r1", "u1", "t1", 10, 2, "GBP", "CREATED",
        ]);
    });

    it("qUserCpInsert assembles", () => {
        expect(qUserCpInsert.toString()).toBe(
            `insert into "Revolut_Counterparty" ("userId", "counterpartyId") values ($1, $2)`,
        );
        expect([...qUserCpInsert.getParams()]).toEqual(["u1", "c1"]);
    });

    it("qTeamCpInsert assembles", () => {
        expect(qTeamCpInsert.toString()).toBe(
            `insert into "Team_Revolut_Counterparty" ("teamId", "counterpartyId") values ($1, $2)`,
        );
        expect([...qTeamCpInsert.getParams()]).toEqual(["t1", "c1"]);
    });

    it("qHistoryInsert assembles", () => {
        expect(qHistoryInsert.toString()).toBe(
            `insert into "Revolut_PaymentDraft_History" ` +
                `("revolutDraftId", "data", "createdAt") values ($1, $2, $3)`,
        );
        expect([...qHistoryInsert.getParams()]).toEqual(["d1", "{}", "2024-01-01"]);
    });
});

describe("revolut DML builder mirrors — UPDATE", () => {
    it("qLinkUap assembles", () => {
        expect(qLinkUap.toString()).toBe(
            `update "User_ApprovedPayment" set "revolutDraftId" = $1, "status" = 'created' where id = $2`,
        );
        expect([...qLinkUap.getParams()]).toEqual(["d1", "p1"]);
    });

    it("qDraftSetRevolutId assembles", () => {
        expect(qDraftSetRevolutId.toString()).toBe(
            `update "Revolut_PaymentDraft" set "revolutDraftId" = $1 where id = $2`,
        );
        expect([...qDraftSetRevolutId.getParams()]).toEqual(["x1", "d1"]);
    });

    it("qUserCpUpdate assembles", () => {
        expect(qUserCpUpdate.toString()).toBe(
            `update "Revolut_Counterparty" set "counterpartyId" = $1, "updatedAt" = $2 where "userId" = $3`,
        );
        expect([...qUserCpUpdate.getParams()]).toEqual(["c1", "2024-01-01", "u1"]);
    });

    it("qTeamCpUpdate assembles", () => {
        expect(qTeamCpUpdate.toString()).toBe(
            `update "Team_Revolut_Counterparty" set "counterpartyId" = $1, "updatedAt" = $2 where "teamId" = $3`,
        );
        expect([...qTeamCpUpdate.getParams()]).toEqual(["c1", "2024-01-01", "t1"]);
    });

    it("qSetCommissionsPaid assembles", () => {
        expect(qSetCommissionsPaid.toString()).toBe(
            `update "User_ApprovedPayment" set "paid" = true where "revolutDraftId" = $1`,
        );
        expect([...qSetCommissionsPaid.getParams()]).toEqual(["d1"]);
    });

    it("qDraftSetTxn assembles", () => {
        expect(qDraftSetTxn.toString()).toBe(
            `update "Revolut_PaymentDraft" set "transactionId" = $1 where id = $2`,
        );
        expect([...qDraftSetTxn.getParams()]).toEqual(["x1", "d1"]);
    });

    it("qDraftSetStatus assembles", () => {
        expect(qDraftSetStatus.toString()).toBe(
            `update "Revolut_PaymentDraft" set "status" = $1 where id = $2`,
        );
        expect([...qDraftSetStatus.getParams()]).toEqual(["completed", "d1"]);
    });
});

describe("revolut DML builder mirrors — DELETE", () => {
    it("qDraftDelete assembles", () => {
        expect(qDraftDelete.toString()).toBe(
            `delete from "Revolut_PaymentDraft" where id = $1`,
        );
        expect([...qDraftDelete.getParams()]).toEqual(["d1"]);
    });

    it("qUserCpDelete assembles", () => {
        expect(qUserCpDelete.toString()).toBe(
            `delete from "Revolut_Counterparty" where "userId" = $1`,
        );
        expect([...qUserCpDelete.getParams()]).toEqual(["u1"]);
    });

    it("qTeamCpDelete assembles", () => {
        expect(qTeamCpDelete.toString()).toBe(
            `delete from "Team_Revolut_Counterparty" where "teamId" = $1`,
        );
        expect([...qTeamCpDelete.getParams()]).toEqual(["t1"]);
    });
});

// ===========================================================================
// createSql typed-raw mirror — exact positional-param parity with source
// ===========================================================================
// The source writes use Postgres $1/$2 positional params verbatim. The fluent
// builder can model them, but createSql preserves the *exact* original text;
// kept here as a parity check for the draft-insert returning path.
const sql = createSql<S>();

// NB: single-line string literal, not `+` concatenated. A `"a" + "b"` chain
// widens to `string` at the type level, so createSql could not parse the
// RETURNING clause and `__returning` collapsed to `{}`. A single literal
// preserves the precise type; runtime SQL is identical.
const qDraftInsertRaw = sql(
    `insert into "Revolut_PaymentDraft" ("reference", "userId", "teamId", "amount", "vat", "currency", "status") values (:reference, :userId, :teamId, :amount, :vat, :currency, :status) returning id`,
).withParams({
    reference: "r1",
    userId: "u1",
    teamId: "t1",
    amount: 10,
    vat: 2,
    currency: "GBP",
    status: "CREATED",
});

describe("revolut DML createSql parity", () => {
    it("qDraftInsertRaw expands named params to ordinals", () => {
        expect(qDraftInsertRaw.toString()).toBe(
            `insert into "Revolut_PaymentDraft" ` +
                `("reference", "userId", "teamId", "amount", "vat", "currency", "status") ` +
                `values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        );
        expect([...qDraftInsertRaw.getParams()]).toEqual([
            "r1", "u1", "t1", 10, 2, "GBP", "CREATED",
        ]);
    });
});

// ===========================================================================
// Type-level RETURNING row assertions (intended shapes)
// ===========================================================================
// Only the draft-insert path carries a RETURNING clause; the rest return [].

type Ret_DraftInsert = NonNullable<(typeof qDraftInsert)["__returning"]>;
type _Ret_DraftInsert = RequireTrue<AssertEqual<Ret_DraftInsert, { id: string }>>;

type Ret_DraftInsertRaw = NonNullable<(typeof qDraftInsertRaw)["__returning"]>;
type _Ret_DraftInsertRaw = RequireTrue<
    AssertEqual<Ret_DraftInsertRaw, { id: string }>
>;

export type CommerceRevolutDmlBuilderTestsPass = true;
