/**
 * revolut plain-SQL fixtures — copied verbatim from
 * /Users/kuindji/Projects/TheFloorr/monorepo/serverless/api/revolut.
 * Setup-only: assertions encode the INTENDED row type; failures => engine fix-list.
 *
 * All queries run against db.main.* => Main (ReportingV2Schema).
 *
 * SCHEMA-GAP notes (column absent from the fixture; assertion left as the
 * intended shape so it surfaces as a real gap, not an invented column):
 *   - Team_Revolut_Counterparty."counterpartyId" / "updatedAt"
 *   - Revolut_Counterparty."counterpartyId" / "updatedAt"
 *   - Team_Member."role" / "accessSettings" / "createdAt"
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    Json,
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";

type Main = ReportingV2Schema;
type Catalogue = ReportingV2CatalogueSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// controller/payments.ts:124-133 — re-batch guard
// (materialized: IN-list ${idPlaceholders} -> $1, $2)
// ---------------------------------------------------------------------------
type Q_PaymentGuard = `
    select id from "User_ApprovedPayment"
    where id in ($1, $2)
      and (
          "revolutDraftId" is not null
          or "status" not in ('approved','re-approved')
      )`;
type _V_PaymentGuard = Expect<Equal<ValidateSQL<Q_PaymentGuard, Main>, true>>;
type _R_PaymentGuard = Expect<
    Equal<GetReturnType<Q_PaymentGuard, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// controller/payments.ts:158-166 — cohort-sum guard
// (materialized: IN-list -> $1,$2; $${expectedParamIndex} -> $3)
// convert_currency cast (::numeric) is number; outer abs(...) < 0.1 is boolean.
// ---------------------------------------------------------------------------
type Q_PaymentValid = `
    select abs(
        sum(
            convert_currency(uap."amount"::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date)
          + convert_currency(uap."vat"::numeric,    uap."currency", 'GBP'::text, uap."createdAt"::date)
        ) - $3::float
    ) < 0.1 as "valid"
    from "User_ApprovedPayment" uap
    where uap.id in ($1, $2)`;
type _V_PaymentValid = Expect<Equal<ValidateSQL<Q_PaymentValid, Main>, true>>;
type _R_PaymentValid = Expect<
    Equal<GetReturnType<Q_PaymentValid, Main>, { valid: boolean }>
>;

// ---------------------------------------------------------------------------
// controller/payments.ts:344-350 — removePaymentDraft lookup (select *)
// ---------------------------------------------------------------------------
type Q_DraftById = `
    select * from "Revolut_PaymentDraft"
    where id = $1`;
type _V_DraftById = Expect<Equal<ValidateSQL<Q_DraftById, Main>, true>>;
type _R_DraftById = Expect<
    Equal<
        GetReturnType<Q_DraftById, Main>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// ---------------------------------------------------------------------------
// controller/payments.ts:236-240 — INSERT (DML, no RETURNING data shape beyond id)
// (materialized: prepareInsert -> explicit columns / $n / returning id)
// ---------------------------------------------------------------------------
type Q_DraftInsert = `
    insert into "Revolut_PaymentDraft" ("reference","userId","teamId","amount","vat","currency","status")
    values ($1, $2, $3, $4, $5, $6, $7)
    returning id`;
type _V_DraftInsert = Expect<Equal<ValidateSQL<Q_DraftInsert, Main>, true>>;
type _R_DraftInsert = Expect<
    Equal<GetReturnType<Q_DraftInsert, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// controller/payments.ts:286-290 — DELETE draft on Revolut rejection (DML)
// ---------------------------------------------------------------------------
type Q_DraftDeleteOnReject = `
    delete from "Revolut_PaymentDraft"
    where id = $1`;
type _V_DraftDeleteOnReject = Expect<
    Equal<ValidateSQL<Q_DraftDeleteOnReject, Main>, true>
>;

// ---------------------------------------------------------------------------
// controller/payments.ts:301-305 — link UAP to draft (DML)
// ---------------------------------------------------------------------------
type Q_LinkUap = `
    update "User_ApprovedPayment"
    set "revolutDraftId" = $1, "status" = 'created'
    where id = $2`;
type _V_LinkUap = Expect<Equal<ValidateSQL<Q_LinkUap, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/payments.ts:313-317 — write Revolut draft id (DML)
// ---------------------------------------------------------------------------
type Q_DraftSetRevolutId = `
    update "Revolut_PaymentDraft"
    set "revolutDraftId" = $1
    where id = $2`;
type _V_DraftSetRevolutId = Expect<
    Equal<ValidateSQL<Q_DraftSetRevolutId, Main>, true>
>;

// ---------------------------------------------------------------------------
// controller/payments.ts:371-375 — removePaymentDraft delete (DML)
// ---------------------------------------------------------------------------
type Q_DraftDelete = `
    delete from "Revolut_PaymentDraft"
    where id = $1`;
type _V_DraftDelete = Expect<Equal<ValidateSQL<Q_DraftDelete, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/teamPayment.ts:20-24 — getTeamCounterpartyId
// SCHEMA-GAP: Team_Revolut_Counterparty.counterpartyId
// ---------------------------------------------------------------------------
type Q_TeamCpId = `
    select "counterpartyId" from "Team_Revolut_Counterparty"
    where "teamId" = $1`;
type _V_TeamCpId = Expect<Equal<ValidateSQL<Q_TeamCpId, Main>, true>>;
type _R_TeamCpId = Expect<
    Equal<GetReturnType<Q_TeamCpId, Main>, { counterpartyId: string }>
>;

// ---------------------------------------------------------------------------
// controller/teamPayment.ts:137-145 — re-batch guard (materialized IN-list -> $1,$2)
// ---------------------------------------------------------------------------
type Q_TeamPaymentGuard = `
    select id from "User_ApprovedPayment"
    where id in ($1, $2)
      and (
          "revolutDraftId" is not null
          or "status" not in ('approved','re-approved')
      )`;
type _V_TeamPaymentGuard = Expect<
    Equal<ValidateSQL<Q_TeamPaymentGuard, Main>, true>
>;
type _R_TeamPaymentGuard = Expect<
    Equal<GetReturnType<Q_TeamPaymentGuard, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// controller/teamPayment.ts:167-173 — team-attribution defence-in-depth
// (materialized: IN-list -> $1,$2; $${teamIdParamIndex} -> $3)
// LEFT JOINs + coalesce + is distinct from
// ---------------------------------------------------------------------------
type Q_TeamMismatch = `
    select uap.id
    from "User_ApprovedPayment" uap
    left join "Network_Order" o on o.id = uap."networkOrderId"
    left join "LogProductClick" click on click.sid = o."clickId"
    where uap.id in ($1, $2)
      and coalesce(uap."teamId", click."teamId") is distinct from $3`;
type _V_TeamMismatch = Expect<Equal<ValidateSQL<Q_TeamMismatch, Main>, true>>;
type _R_TeamMismatch = Expect<
    Equal<GetReturnType<Q_TeamMismatch, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// controller/teamPayment.ts:204-211 — cohort-sum guard (current_date variant)
// (materialized: IN-list -> $1,$2; $${expectedParamIndex} -> $3)
// ---------------------------------------------------------------------------
type Q_TeamPaymentValid = `
    select abs(
        sum(
            convert_currency(uap."amount"::numeric, uap."currency", 'GBP'::text, current_date)
          + convert_currency(uap."vat"::numeric,    uap."currency", 'GBP'::text, current_date)
        ) - $3::float
    ) < 0.1 as "valid"
    from "User_ApprovedPayment" uap
    where uap.id in ($1, $2)`;
type _V_TeamPaymentValid = Expect<
    Equal<ValidateSQL<Q_TeamPaymentValid, Main>, true>
>;
type _R_TeamPaymentValid = Expect<
    Equal<GetReturnType<Q_TeamPaymentValid, Main>, { valid: boolean }>
>;

// ---------------------------------------------------------------------------
// controller/teamPayment.ts:265-268 — INSERT (DML; materialized prepareInsert)
// ---------------------------------------------------------------------------
type Q_TeamDraftInsert = `
    insert into "Revolut_PaymentDraft" ("reference","userId","teamId","amount","vat","currency","status")
    values ($1, $2, $3, $4, $5, $6, $7)
    returning id`;
type _V_TeamDraftInsert = Expect<
    Equal<ValidateSQL<Q_TeamDraftInsert, Main>, true>
>;
type _R_TeamDraftInsert = Expect<
    Equal<GetReturnType<Q_TeamDraftInsert, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// controller/teamPayment.ts:319-320 — DELETE draft on Revolut rejection (DML)
// ---------------------------------------------------------------------------
type Q_TeamDraftDelete = `
    delete from "Revolut_PaymentDraft"
    where id = $1`;
type _V_TeamDraftDelete = Expect<
    Equal<ValidateSQL<Q_TeamDraftDelete, Main>, true>
>;

// ---------------------------------------------------------------------------
// controller/teamPayment.ts:338-340 — link UAP to draft (DML)
// ---------------------------------------------------------------------------
type Q_TeamLinkUap = `
    update "User_ApprovedPayment"
    set "revolutDraftId" = $1, "status" = 'created'
    where id = $2`;
type _V_TeamLinkUap = Expect<Equal<ValidateSQL<Q_TeamLinkUap, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/teamPayment.ts:349-351 — write Revolut draft id (DML)
// ---------------------------------------------------------------------------
type Q_TeamDraftSetRevolutId = `
    update "Revolut_PaymentDraft"
    set "revolutDraftId" = $1
    where id = $2`;
type _V_TeamDraftSetRevolutId = Expect<
    Equal<ValidateSQL<Q_TeamDraftSetRevolutId, Main>, true>
>;

// ---------------------------------------------------------------------------
// controller/counterparty.ts:14-18 — getUserCounterypartyId
// SCHEMA-GAP: Revolut_Counterparty.counterpartyId
// ---------------------------------------------------------------------------
type Q_UserCpId = `
    select "counterpartyId"
    from "Revolut_Counterparty"
    where "userId" = $1`;
type _V_UserCpId = Expect<Equal<ValidateSQL<Q_UserCpId, Main>, true>>;
type _R_UserCpId = Expect<
    Equal<GetReturnType<Q_UserCpId, Main>, { counterpartyId: string }>
>;

// ---------------------------------------------------------------------------
// controller/counterparty.ts:75-78 — team-only counterparty lookup
// SCHEMA-GAP: Team_Revolut_Counterparty.counterpartyId
// ---------------------------------------------------------------------------
type Q_TeamOnlyCp = `
    select "counterpartyId" from "Team_Revolut_Counterparty"
    where "teamId" = $1`;
type _V_TeamOnlyCp = Expect<Equal<ValidateSQL<Q_TeamOnlyCp, Main>, true>>;
type _R_TeamOnlyCp = Expect<
    Equal<GetReturnType<Q_TeamOnlyCp, Main>, { counterpartyId: string }>
>;

// ---------------------------------------------------------------------------
// controller/counterparty.ts:99-108 — resolve team counterparties via membership
// JOIN + uuid casts + order by + limit
// SCHEMA-GAP: Team_Revolut_Counterparty.counterpartyId, Team_Member.createdAt
// ---------------------------------------------------------------------------
type Q_TeamMembershipCp = `
    select trc."counterpartyId", tm."teamId"
    from "Team_Member" tm
    join "Team_Revolut_Counterparty" trc on trc."teamId" = tm."teamId"
    where tm."userId" = $1
      and tm."disabled" = false
      and ($2::uuid is null or tm."teamId" = $2::uuid)
    order by tm."createdAt" desc, tm."teamId" asc
    limit 2`;
type _V_TeamMembershipCp = Expect<
    Equal<ValidateSQL<Q_TeamMembershipCp, Main>, true>
>;
type _R_TeamMembershipCp = Expect<
    Equal<
        GetReturnType<Q_TeamMembershipCp, Main>,
        { counterpartyId: string; teamId: string }
    >
>;

// ---------------------------------------------------------------------------
// controller/counterparty.ts:159-162 — update user counterparty (DML)
// ---------------------------------------------------------------------------
type Q_UserCpUpdate = `
    update "Revolut_Counterparty"
    set "counterpartyId" = $1, "updatedAt" = $2
    where "userId" = $3`;
type _V_UserCpUpdate = Expect<Equal<ValidateSQL<Q_UserCpUpdate, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/counterparty.ts:174-176 — insert user counterparty (DML)
// ---------------------------------------------------------------------------
type Q_UserCpInsert = `
    insert into "Revolut_Counterparty" ("userId", "counterpartyId")
    values ($1, $2)`;
type _V_UserCpInsert = Expect<Equal<ValidateSQL<Q_UserCpInsert, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/counterparty.ts:186-187 — delete user counterparty (DML)
// ---------------------------------------------------------------------------
type Q_UserCpDelete = `
    delete from "Revolut_Counterparty"
    where "userId" = $1`;
type _V_UserCpDelete = Expect<Equal<ValidateSQL<Q_UserCpDelete, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/teamCounterparty.ts:21-27 — checkTeamPaymentAccess
// SCHEMA-GAP: Team_Member.role, Team_Member.accessSettings
// ---------------------------------------------------------------------------
type Q_TeamMemberAccess = `
    select "role", "accessSettings"
    from "Team_Member"
    where "userId" = $1
      and "teamId" = $2
      and "disabled" = false`;
type _V_TeamMemberAccess = Expect<
    Equal<ValidateSQL<Q_TeamMemberAccess, Main>, true>
>;
// Intended shape (role text, accessSettings json):
type _R_TeamMemberAccess = Expect<
    Equal<
        GetReturnType<Q_TeamMemberAccess, Main>,
        { role: string; accessSettings: Json | null }
    >
>;

// ---------------------------------------------------------------------------
// controller/teamCounterparty.ts:48-52 — getTeamCounterpartyId
// SCHEMA-GAP: Team_Revolut_Counterparty.counterpartyId
// ---------------------------------------------------------------------------
type Q_TeamCpIdLookup = `
    select "counterpartyId"
    from "Team_Revolut_Counterparty"
    where "teamId" = $1`;
type _V_TeamCpIdLookup = Expect<
    Equal<ValidateSQL<Q_TeamCpIdLookup, Main>, true>
>;
type _R_TeamCpIdLookup = Expect<
    Equal<GetReturnType<Q_TeamCpIdLookup, Main>, { counterpartyId: string }>
>;

// ---------------------------------------------------------------------------
// controller/teamCounterparty.ts:74-78 — update team counterparty (DML)
// ---------------------------------------------------------------------------
type Q_TeamCpUpdate = `
    update "Team_Revolut_Counterparty"
    set "counterpartyId" = $1, "updatedAt" = $2
    where "teamId" = $3`;
type _V_TeamCpUpdate = Expect<Equal<ValidateSQL<Q_TeamCpUpdate, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/teamCounterparty.ts:89-92 — insert team counterparty (DML)
// ---------------------------------------------------------------------------
type Q_TeamCpInsert = `
    insert into "Team_Revolut_Counterparty" ("teamId", "counterpartyId")
    values ($1, $2)`;
type _V_TeamCpInsert = Expect<Equal<ValidateSQL<Q_TeamCpInsert, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/teamCounterparty.ts:104-107 — delete team counterparty (DML)
// ---------------------------------------------------------------------------
type Q_TeamCpDelete = `
    delete from "Team_Revolut_Counterparty"
    where "teamId" = $1`;
type _V_TeamCpDelete = Expect<Equal<ValidateSQL<Q_TeamCpDelete, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/webhook.ts:20-23 — getDraftByTransactionId (select *)
// ---------------------------------------------------------------------------
type Q_DraftByTxn = `
    select * from "Revolut_PaymentDraft"
    where "transactionId" = $1`;
type _V_DraftByTxn = Expect<Equal<ValidateSQL<Q_DraftByTxn, Main>, true>>;
type _R_DraftByTxn = Expect<
    Equal<
        GetReturnType<Q_DraftByTxn, Main>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// ---------------------------------------------------------------------------
// controller/webhook.ts:37-40 — getDraftById (select *)
// ---------------------------------------------------------------------------
type Q_WebhookDraftById = `
    select * from "Revolut_PaymentDraft"
    where id = $1`;
type _V_WebhookDraftById = Expect<
    Equal<ValidateSQL<Q_WebhookDraftById, Main>, true>
>;
type _R_WebhookDraftById = Expect<
    Equal<
        GetReturnType<Q_WebhookDraftById, Main>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// ---------------------------------------------------------------------------
// controller/webhook.ts:54-58 — setCommissionsPaid (DML)
// ---------------------------------------------------------------------------
type Q_SetCommissionsPaid = `
    update "User_ApprovedPayment"
    set "paid" = true
    where "revolutDraftId" = $1`;
type _V_SetCommissionsPaid = Expect<
    Equal<ValidateSQL<Q_SetCommissionsPaid, Main>, true>
>;

// ---------------------------------------------------------------------------
// controller/webhook.ts:104-108 — insert history row (DML)
// ---------------------------------------------------------------------------
type Q_HistoryInsert = `
    insert into "Revolut_PaymentDraft_History"
    ("revolutDraftId", "data", "createdAt")
    values ($1, $2, $3)`;
type _V_HistoryInsert = Expect<Equal<ValidateSQL<Q_HistoryInsert, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/webhook.ts:124-127 — set transactionId (DML)
// ---------------------------------------------------------------------------
type Q_DraftSetTxn = `
    update "Revolut_PaymentDraft"
    set "transactionId" = $1
    where id = $2`;
type _V_DraftSetTxn = Expect<Equal<ValidateSQL<Q_DraftSetTxn, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/webhook.ts:136-139 — set status (TransactionCreated branch) (DML)
// ---------------------------------------------------------------------------
type Q_DraftSetStatusCreated = `
    update "Revolut_PaymentDraft"
    set "status" = $1
    where id = $2`;
type _V_DraftSetStatusCreated = Expect<
    Equal<ValidateSQL<Q_DraftSetStatusCreated, Main>, true>
>;

// ---------------------------------------------------------------------------
// controller/webhook.ts:156-159 — set status (TransactionStateChanged branch) (DML)
// (identical SQL to the above; both kept since both appear verbatim)
// ---------------------------------------------------------------------------
type Q_DraftSetStatusChanged = `
    update "Revolut_PaymentDraft"
    set "status" = $1
    where id = $2`;
type _V_DraftSetStatusChanged = Expect<
    Equal<ValidateSQL<Q_DraftSetStatusChanged, Main>, true>
>;

// Suppress unused-type-import lint for the Catalogue alias (no catalogue
// queries exist in the revolut lambda; kept for header-template parity).
type _CatalogueUnused = Catalogue;
