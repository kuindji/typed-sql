/**
 * TheFloorr query fixtures.
 *
 * Queries are copied from /Users/kuindji/Projects/TheFloorr/monorepo.
 * These tests assert that typed-sql can validate the project's raw SQL and
 * infer useful row shapes from the generated main/catalogue database schemas.
 */

import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    TheFloorrCatalogueSchema,
    TheFloorrMainSchema,
} from "../../fixtures/thefloorr-schema.js";

type Main = TheFloorrMainSchema;
type Catalogue = TheFloorrCatalogueSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
)
    ? true
    : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// packages/common/src/api/middleware/internalCatalogueApiKey.ts
// ---------------------------------------------------------------------------

type Q_InternalCatalogueApiKey = `
    SELECT api_key_id FROM api_key_settings WHERE internal = true LIMIT 1
`;
type _V1 = Expect<Equal<ValidateSQL<Q_InternalCatalogueApiKey, Catalogue>, true>>;
type _R1 = Expect<
    Equal<GetReturnType<Q_InternalCatalogueApiKey, Catalogue>, { api_key_id: string }>
>;

// ---------------------------------------------------------------------------
// serverless/cron/delete-deactivated-users/src/index.ts
// ---------------------------------------------------------------------------

type Q_DeleteDeactivatedUsers = `
    delete from "User"
    where "enabled" = false
    and "deactivatedAt" is not null
    and "deactivatedAt" < $1
`;
type _V2 = Expect<Equal<ValidateSQL<Q_DeleteDeactivatedUsers, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/cron/cognito-reset-tmp-password/src/index.ts
// ---------------------------------------------------------------------------

type Q_SelectPasswordResets = `select * from "User_Password_Reset"`;
type _V3 = Expect<Equal<ValidateSQL<Q_SelectPasswordResets, Main>, true>>;
type _R3 = Expect<
    Equal<
        GetReturnType<Q_SelectPasswordResets, Main>,
        Main["schemas"]["public"]["User_Password_Reset"]
    >
>;

type Q_UpdatePasswordReset = `
    update "User_Password_Reset" 
    set 
        "updatedAt" = now(), 
        "tempPassword" = $1
    where "userId" = $2
`;
type _V4 = Expect<Equal<ValidateSQL<Q_UpdatePasswordReset, Main>, true>>;

type Q_SelectUserIdByEmail = `select "id" from "User" where "email" = $1`;
type _V5 = Expect<Equal<ValidateSQL<Q_SelectUserIdByEmail, Main>, true>>;
type _R5 = Expect<Equal<GetReturnType<Q_SelectUserIdByEmail, Main>, { id: string }>>;

type Q_InsertPasswordReset = `
    insert into "User_Password_Reset" 
    ("userId", "tempPassword", "email", "updatedAt")
    values
    ($1, $2, $3, now())
`;
type _V6 = Expect<Equal<ValidateSQL<Q_InsertPasswordReset, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/cron/get-exchange-rates/src/index.ts
// ---------------------------------------------------------------------------

type Q_InsertExchangeRateHistory = `
    insert into "ExchangeRate_History" ("from", "to", "rate", "date")
    values ($1, $2, $3, $4)
    on conflict ("date", "from", "to") do nothing;
`;
type _V7 = Expect<Equal<ValidateSQL<Q_InsertExchangeRateHistory, Main>, true>>;

type Q_UpsertExchangeRate = `
    insert into "ExchangeRate" ("from", "to", "rate", "updatedAt")
    values ($1, $2, $3, $4)
    on conflict ("from", "to") do update set "rate" = $3, "updatedAt" = $4;
`;
type _V8 = Expect<Equal<ValidateSQL<Q_UpsertExchangeRate, Main>, true>>;

type Q_SelectExchangeRates = `select * from "ExchangeRate"`;
type _V9 = Expect<Equal<ValidateSQL<Q_SelectExchangeRates, Main>, true>>;
type _R9 = Expect<
    Equal<GetReturnType<Q_SelectExchangeRates, Main>, Main["schemas"]["public"]["ExchangeRate"]>
>;

// ---------------------------------------------------------------------------
// serverless/cron/revolut-draft-state/src/index.ts
// ---------------------------------------------------------------------------

type Q_DeleteRevolutDraft = `
    delete from "Revolut_PaymentDraft"
    where "id" = $1
`;
type _V10 = Expect<Equal<ValidateSQL<Q_DeleteRevolutDraft, Main>, true>>;

type Q_SelectStaleRevolutDrafts = `
    select * from "Revolut_PaymentDraft"
    where "status" in ('CREATED', 'PENDING')
    and "createdAt" < $1
`;
type _V11 = Expect<Equal<ValidateSQL<Q_SelectStaleRevolutDrafts, Main>, true>>;
type _R11 = Expect<
    Equal<
        GetReturnType<Q_SelectStaleRevolutDrafts, Main>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type Q_MarkRevolutDraftNotFound = `
    update "Revolut_PaymentDraft"
    set "status" = 'NOTFOUND'
    where "id" = $1
`;
type _V12 = Expect<Equal<ValidateSQL<Q_MarkRevolutDraftNotFound, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/revolut/src/controller/webhook.ts
// ---------------------------------------------------------------------------

type Q_SelectDraftByTransactionId = `
    select * from "Revolut_PaymentDraft"
    where "transactionId" = $1
`;
type _V13 = Expect<Equal<ValidateSQL<Q_SelectDraftByTransactionId, Main>, true>>;
type _R13 = Expect<
    Equal<
        GetReturnType<Q_SelectDraftByTransactionId, Main>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type Q_SelectDraftById = `
    select * from "Revolut_PaymentDraft"
    where id = $1
`;
type _V14 = Expect<Equal<ValidateSQL<Q_SelectDraftById, Main>, true>>;
type _R14 = Expect<
    Equal<GetReturnType<Q_SelectDraftById, Main>, Main["schemas"]["public"]["Revolut_PaymentDraft"]>
>;

type Q_SetCommissionsPaid = `
    update "User_ApprovedPayment"
    set "paid" = true
    where "revolutDraftId" = $1
`;
type _V15 = Expect<Equal<ValidateSQL<Q_SetCommissionsPaid, Main>, true>>;

type Q_InsertRevolutDraftHistory = `
    insert into "Revolut_PaymentDraft_History" 
    ("revolutDraftId", "data", "createdAt")
    values ($1, $2, $3)
`;
type _V16 = Expect<Equal<ValidateSQL<Q_InsertRevolutDraftHistory, Main>, true>>;

type Q_UpdateDraftTransaction = `
    update "Revolut_PaymentDraft"
    set "transactionId" = $1
    where id = $2
`;
type _V17 = Expect<Equal<ValidateSQL<Q_UpdateDraftTransaction, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/controller/pse/payment-status.ts
// ---------------------------------------------------------------------------

type Q_SelectApprovedPayment = `select * from "User_ApprovedPayment" where id = $1`;
type _V18 = Expect<Equal<ValidateSQL<Q_SelectApprovedPayment, Main>, true>>;
type _R18 = Expect<
    Equal<
        GetReturnType<Q_SelectApprovedPayment, Main>,
        Main["schemas"]["public"]["User_ApprovedPayment"]
    >
>;

type Q_SetApprovedPaymentPaid = `
    update "User_ApprovedPayment" 
    set "paid" = true, "status" = 'paid' 
    where id = $1
`;
type _V19 = Expect<Equal<ValidateSQL<Q_SetApprovedPaymentPaid, Main>, true>>;

type Q_DeleteApprovedPayment = `
    delete from "User_ApprovedPayment" 
    where id = $1
`;
type _V20 = Expect<Equal<ValidateSQL<Q_DeleteApprovedPayment, Main>, true>>;

// The fixture should still reject references that are not in TheFloorr schemas.
type Q_InvalidMainColumn = `select "doesNotExist" from "User"`;
type _V21 = Expect<Equal<ValidateSQL<Q_InvalidMainColumn, Main>, false>>;

type Q_InvalidCatalogueTable = `select api_key_id from missing_settings`;
type _V22 = Expect<Equal<ValidateSQL<Q_InvalidCatalogueTable, Catalogue>, false>>;

export type TheFloorrQueryTestsPass = true;
