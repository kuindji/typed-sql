/**
 * Commerce cron — plain type-level mirrors of the raw SQL in the commerce
 * cron lambdas. COLLECTION pass; reds => engine fix-list.
 *
 * Each distinct raw query (SELECT / INSERT / UPDATE / DELETE) found under the
 * cron area is mirrored here with a ValidateSQL=true assertion, plus a
 * GetReturnType assertion where the row shape is determinable.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";

type S = ReportingV2Schema;
type C = ReportingV2CatalogueSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;

// ===========================================================================
// delete-connections/src/index.ts  (db.main.run, DML)
// ===========================================================================

// --- mirror of commerce cron delete-connections/src/index.ts:6-10 ---
// FIXTURE-GAP: Connection table not in fixture
type Q_DeleteConnections = `
        delete from "Connection"
        where "deleted" = true
        and "deletedAt" < $1
    `;
type _V_DeleteConnections = Expect<Equal<ValidateSQL<Q_DeleteConnections, S>, true>>;

// ===========================================================================
// delete-deactivated-users/src/index.ts  (db.main.run, DML)
// ===========================================================================

// --- mirror of commerce cron delete-deactivated-users/src/index.ts:7-12 ---
type Q_DeleteDeactivatedUsers = `
        delete from "User"
        where "enabled" = false
        and "deactivatedAt" is not null
        and "deactivatedAt" < $1
    `;
type _V_DeleteDeactivatedUsers = Expect<
    Equal<ValidateSQL<Q_DeleteDeactivatedUsers, S>, true>
>;

// ===========================================================================
// cognito-reset-tmp-password/src/index.ts  (db.main.* -> Main)
// ===========================================================================

// --- mirror of commerce cron cognito-reset-tmp-password/src/index.ts:82  (typedSelect) ---
type Q_CognitoResetSelectAll = `select * from "User_Password_Reset"`;
type _V_CognitoResetSelectAll = Expect<
    Equal<ValidateSQL<Q_CognitoResetSelectAll, S>, true>
>;
type _R_CognitoResetSelectAll = Expect<
    Equal<
        GetReturnType<Q_CognitoResetSelectAll, S>,
        S["schemas"]["public"]["User_Password_Reset"]
    >
>;

// --- mirror of commerce cron cognito-reset-tmp-password/src/index.ts:122  (typedSelect) ---
type Q_CognitoSelectUserId = `select "id" from "User" where "email" = $1`;
type _V_CognitoSelectUserId = Expect<
    Equal<ValidateSQL<Q_CognitoSelectUserId, S>, true>
>;
type _R_CognitoSelectUserId = Expect<
    Equal<GetReturnType<Q_CognitoSelectUserId, S>, { id: string }>
>;

// --- mirror of commerce cron cognito-reset-tmp-password/src/index.ts:109-114  (db.main.run, DML) ---
type Q_CognitoUpdateReset = `
                    update "User_Password_Reset"
                    set
                        "updatedAt" = now(),
                        "tempPassword" = $1
                    where "userId" = $2`;
type _V_CognitoUpdateReset = Expect<
    Equal<ValidateSQL<Q_CognitoUpdateReset, S>, true>
>;

// --- mirror of commerce cron cognito-reset-tmp-password/src/index.ts:134-139  (db.main.run, DML) ---
type Q_CognitoInsertReset = `
                        insert into "User_Password_Reset"
                        ("userId", "tempPassword", "email", "updatedAt")
                        values
                        ($1, $2, $3, now())
                    `;
type _V_CognitoInsertReset = Expect<
    Equal<ValidateSQL<Q_CognitoInsertReset, S>, true>
>;

// ===========================================================================
// get-exchange-rates/src/index.ts  (db.main.* -> Main)
// ===========================================================================

// --- mirror of commerce cron get-exchange-rates/src/index.ts:60-64  createHistoryRecord() (DML) ---
type Q_ExchangeHistoryInsert = `
        insert into "ExchangeRate_History" ("from", "to", "rate", "date")
        values ($1, $2, $3, $4)
        on conflict ("date", "from", "to") do nothing;
    `;
type _V_ExchangeHistoryInsert = Expect<
    Equal<ValidateSQL<Q_ExchangeHistoryInsert, S>, true>
>;

// --- mirror of commerce cron get-exchange-rates/src/index.ts:71-75  updateCurrentRecord() (DML) ---
type Q_ExchangeUpsert = `
        insert into "ExchangeRate" ("from", "to", "rate", "updatedAt")
        values ($1, $2, $3, $4)
        on conflict ("from", "to") do update set "rate" = $3, "updatedAt" = $4;
    `;
type _V_ExchangeUpsert = Expect<Equal<ValidateSQL<Q_ExchangeUpsert, S>, true>>;

// --- mirror of commerce cron get-exchange-rates/src/index.ts:85-87  getCurrentSavedRates() (typedSelect) ---
type Q_ExchangeSelectAll = `
        select * from "ExchangeRate"
    `;
type _V_ExchangeSelectAll = Expect<Equal<ValidateSQL<Q_ExchangeSelectAll, S>, true>>;
type _R_ExchangeSelectAll = Expect<
    Equal<
        GetReturnType<Q_ExchangeSelectAll, S>,
        S["schemas"]["public"]["ExchangeRate"]
    >
>;

// ===========================================================================
// remove-recently-deleted/src/index.ts  (db.main.* -> Main)
// ===========================================================================

// --- mirror of commerce cron remove-recently-deleted/src/index.ts:7-11  (typedSelect) ---
// FIXTURE-GAP: User_RecentlyDeleted table not in fixture
type Q_RecentlyDeletedSelect = `
        select * from "User_RecentlyDeleted"
        where "deletedAt" < $1 or "deletedAt" is null
        limit 20
    `;
type _V_RecentlyDeletedSelect = Expect<
    Equal<ValidateSQL<Q_RecentlyDeletedSelect, S>, true>
>;

// --- mirror of commerce cron remove-recently-deleted/src/index.ts:21-24  (db.main.run, DML) ---
type Q_DeleteConsultation = `
                delete from "Consultation"
                where "id" = $1
            `;
type _V_DeleteConsultation = Expect<
    Equal<ValidateSQL<Q_DeleteConsultation, S>, true>
>;

// --- mirror of commerce cron remove-recently-deleted/src/index.ts:29-32  (db.main.run, DML) ---
type Q_DeleteLook = `
                delete from "Look"
                where "id" = $1
            `;
type _V_DeleteLook = Expect<Equal<ValidateSQL<Q_DeleteLook, S>, true>>;

// --- mirror of commerce cron remove-recently-deleted/src/index.ts:37-40  (db.main.run, DML) ---
type Q_DeleteMoodboard = `
                delete from "Moodboard"
                where "id" = $1
            `;
type _V_DeleteMoodboard = Expect<Equal<ValidateSQL<Q_DeleteMoodboard, S>, true>>;

// ===========================================================================
// pse-analytics-update/src/index.ts  (db.main.run, DML)
// ===========================================================================

// --- mirror of commerce cron pse-analytics-update/src/index.ts:5-13  updateUserRoles() ---
// FIXTURE-GAP: User_Analytics.isAdmin / isEC not in fixture; User.groups present
type Q_PseUpdateUserRoles = `
        update "User_Analytics" ua
        set
            "isPSE" = (u."groups" like '%GPS%' or u."groups" like '%FRI%'),
            "isAdmin" = (u."groups" like '%Admin%'),
            "isEC" = u."groups" = 'User'
        from "User" u
        where u."id" = ua."userId";
    `;
type _V_PseUpdateUserRoles = Expect<
    Equal<ValidateSQL<Q_PseUpdateUserRoles, S>, true>
>;

// --- mirror of commerce cron pse-analytics-update/src/index.ts:19-38  updateIsAdopted() ---
// FIXTURE-GAP: User_Analytics.{isProfileCompleted,phoneVerified,phoneVerifiedAt,
//   pushEnabled,bankDetailsAdded,invitationFirstCreatedAt,...} not in fixture
type Q_PseUpdateIsAdopted = `
        update "User_Analytics"
        set "isPSEAdopted" = (
            "isProfileCompleted" = true and
            ("phoneVerified" = true or "phoneVerifiedAt" is not null) and
            ("pushEnabled" = true or "pushFirstEnabledAt" is not null) and
            ("bankDetailsAdded" = true or "bankDetailsFirstAddedAt" is not null) and
            "linkFirstCreatedAt" is not null and
            "consultationFirstCreatedAt" is not null and
            "lookFirstCreatedAt" is not null and
            "moodboardFirstCreatedAt" is not null and
            "catalogueFirstSentAt" is not null and
            "catalogueFirstSharedAt" is not null and
            "saleByECFirstAt" is not null and
            "invitationFirstCreatedAt" is not null and
            "pushFirstEnabledAt" is not null and
            "invitationFirstSharedAt" is not null
        )
        where "isPSEAdopted" = false and "isPSE" = true;
    `;
type _V_PseUpdateIsAdopted = Expect<
    Equal<ValidateSQL<Q_PseUpdateIsAdopted, S>, true>
>;

// --- mirror of commerce cron pse-analytics-update/src/index.ts:44-62  updateIsPartiallyAdopted() ---
// FIXTURE-GAP: same User_Analytics columns as updateIsAdopted not in fixture
type Q_PseUpdateIsPartiallyAdopted = `
        update "User_Analytics"
        set "isPSEPartiallyAdopted" = (
            ("phoneVerified" = true or "phoneVerifiedAt" is not null) or
            ("pushEnabled" = true or "pushFirstEnabledAt" is not null) or
            ("bankDetailsAdded" = true or "bankDetailsFirstAddedAt" is not null) or
            "linkFirstCreatedAt" is not null or
            "consultationFirstCreatedAt" is not null or
            "lookFirstCreatedAt" is not null or
            "moodboardFirstCreatedAt" is not null or
            "catalogueFirstSentAt" is not null or
            "catalogueFirstSharedAt" is not null or
            "saleByECFirstAt" is not null or
            "invitationFirstCreatedAt" is not null or
            "pushFirstEnabledAt" is not null or
            "invitationFirstSharedAt" is not null
        )
        where "isPSEAdopted" = false and "isPSE" = true;
    `;
type _V_PseUpdateIsPartiallyAdopted = Expect<
    Equal<ValidateSQL<Q_PseUpdateIsPartiallyAdopted, S>, true>
>;

// --- mirror of commerce cron pse-analytics-update/src/index.ts:68-97  updateIsActive() ---
// FIXTURE-GAP: User_Analytics.{saleByECLastAt,saleByPSELastAt,linkLastCreatedAt,...} not in fixture
type Q_PseUpdateIsActive = `
        update "User_Analytics" ua
        set "isPSEActive" = coalesce(
            (now() - u."lastLoggedIn") < interval '30 days'
            and
            (
                (now() - "saleByECLastAt") < interval '30 days' or
                (now() - "saleByPSELastAt") < interval '30 days'
            )
            and
            (
                (now() - "linkLastCreatedAt") < interval '30 days' or
                (now() - "consultationLastCreatedAt") < interval '30 days' or
                (now() - "lookLastCreatedAt") < interval '30 days' or
                (now() - "moodboardLastCreatedAt") < interval '30 days' or
                (now() - "catalogueLastSentAt") < interval '30 days' or
                (now() - "catalogueLastSharedAt") < interval '30 days' or
                (now() - "invitationLastCreatedAt") < interval '30 days' or
                (now() - "invitationLastSharedAt") < interval '30 days'
            ),

            false
        )
        from "User" u
        where
            u."id" = ua."userId" and
            ua."isPSE" = true;
    `;
type _V_PseUpdateIsActive = Expect<
    Equal<ValidateSQL<Q_PseUpdateIsActive, S>, true>
>;

// --- mirror of commerce cron pse-analytics-update/src/index.ts:101-108  updateIsProfileCompleted() ---
// FIXTURE-GAP: User_Analytics.{isProfileCompleted,phoneVerified,...} not in fixture
type Q_PseUpdateIsProfileCompleted = `
        update "User_Analytics"
        set "isProfileCompleted" = (
            ("phoneVerified" = true or "phoneVerifiedAt" is not null) and
            ("bankDetailsAdded" = true or "bankDetailsFirstAddedAt" is not null)
        )
        where "isProfileCompleted" = false and "isPSE" = true;
    `;
type _V_PseUpdateIsProfileCompleted = Expect<
    Equal<ValidateSQL<Q_PseUpdateIsProfileCompleted, S>, true>
>;

// ===========================================================================
// update-retailer-weight/src/index.ts  (db.catalogue.run -> Catalogue, DML)
// ===========================================================================

// --- mirror of commerce cron update-retailer-weight/src/index.ts:5-36  main() (WITH ... UPDATE) ---
type Q_UpdateRetailerWeight = `
        with rs as (
            select
            r.id,
            (
                select count(*) as r_count
                from product_search
                where tags @> array['retailer/'||r.id]
                    and new_in_at >= now() - interval '1 week'
            )
            from retailer r
        ),
        total as (
            select sum(r_count) as total_count from rs
        ),
        relative as (
            select
            rs.id, rs.r_count,
            rs.r_count / total.total_count as rel_count,
            (
                (((rs.r_count / total.total_count) - 0) / (1 - 0)) *
                (1 - 0.5) +
                0.5
            ) as interpolated_count
            from rs
            join total on true
        )
        update retailer
        set new_in_weight = 1 - relative.interpolated_count
        from relative
        where retailer.id = relative.id
    `;
type _V_UpdateRetailerWeight = Expect<
    Equal<ValidateSQL<Q_UpdateRetailerWeight, C>, true>
>;

// ===========================================================================
// revolut-draft-state/src/index.ts  (db.main.* -> Main)
// ===========================================================================

// --- mirror of commerce cron revolut-draft-state/src/index.ts:18-21  removeLocalDraft() (DML) ---
type Q_RevolutDeleteDraft = `
        delete from "Revolut_PaymentDraft"
        where "id" = $1
    `;
type _V_RevolutDeleteDraft = Expect<
    Equal<ValidateSQL<Q_RevolutDeleteDraft, S>, true>
>;

// --- mirror of commerce cron revolut-draft-state/src/index.ts:30-34  getLocalDrafts() (typedSelect) ---
type Q_RevolutSelectDrafts = `
        select * from "Revolut_PaymentDraft"
        where "status" in ('CREATED', 'PENDING')
        and "createdAt" < $1
    `;
type _V_RevolutSelectDrafts = Expect<
    Equal<ValidateSQL<Q_RevolutSelectDrafts, S>, true>
>;
type _R_RevolutSelectDrafts = Expect<
    Equal<
        GetReturnType<Q_RevolutSelectDrafts, S>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// --- mirror of commerce cron revolut-draft-state/src/index.ts:62-66  (NOTFOUND) (DML) ---
type Q_RevolutUpdateNotFound = `
                update "Revolut_PaymentDraft"
                set "status" = 'NOTFOUND'
                where "id" = $1
            `;
type _V_RevolutUpdateNotFound = Expect<
    Equal<ValidateSQL<Q_RevolutUpdateNotFound, S>, true>
>;

// --- mirror of commerce cron revolut-draft-state/src/index.ts:96-100  (DECLINED) (DML) ---
type Q_RevolutUpdateDeclined = `
                    update "Revolut_PaymentDraft"
                    set "status" = 'DECLINED'
                    where "id" = $1
                `;
type _V_RevolutUpdateDeclined = Expect<
    Equal<ValidateSQL<Q_RevolutUpdateDeclined, S>, true>
>;

// ===========================================================================
// network-report-download/src/networks/partnerize.ts  (db.main.typedSelect)
// ===========================================================================

// --- mirror of commerce cron network-report-download/src/networks/partnerize.ts:308-316  getDateRanges() ---
type Q_PartnerizeGetDateRanges = `
            select
                min(no."orderDate") as "minDate"
            from "Network_Order_Partnerize_Item" p
            join "Network_Order" no on no."orderId" = p."orderId"
            where
                p.status = 'pending' or
                (p.status = 'approved' and p."selfBillId" is null)
        `;
type _V_PartnerizeGetDateRanges = Expect<
    Equal<ValidateSQL<Q_PartnerizeGetDateRanges, S>, true>
>;
// min(...) over a timestamp column -> aggregate types as the column type (string).
type _R_PartnerizeGetDateRanges = Expect<
    Equal<GetReturnType<Q_PartnerizeGetDateRanges, S>, { minDate: string }>
>;

// ===========================================================================
// network-report-download/src/networks/cj.ts  (db.main.typedSelect)
// ===========================================================================

// --- mirror of commerce cron network-report-download/src/networks/cj.ts:423-428  getDateRanges() ---
type Q_CjGetDateRanges = `
            select min("orderDate") as "startDate"
            from "Network_Order" no
            where no."networkId" = 'cj' and
                    no."status" in ('new', 'pending', 'locked')
        `;
type _V_CjGetDateRanges = Expect<Equal<ValidateSQL<Q_CjGetDateRanges, S>, true>>;
type _R_CjGetDateRanges = Expect<
    Equal<GetReturnType<Q_CjGetDateRanges, S>, { startDate: string }>
>;

// ===========================================================================
// network-partnerize-selfbill-download/src/index.ts  (db.main.* -> Main)
// ===========================================================================

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:67-71  getRanges() min ---
type Q_SelfbillMinDate = `
        select min("creationDate") as "minDate"
        from "Network_Partnerize_Selfbill" p
        where p."status" = 'created' or p."status" = 'sent'
    `;
type _V_SelfbillMinDate = Expect<Equal<ValidateSQL<Q_SelfbillMinDate, S>, true>>;
type _R_SelfbillMinDate = Expect<
    Equal<GetReturnType<Q_SelfbillMinDate, S>, { minDate: string }>
>;

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:78-81  getRanges() count ---
type Q_SelfbillCount = `
            select count(*) as "count"
            from "Network_Partnerize_Selfbill"
        `;
type _V_SelfbillCount = Expect<Equal<ValidateSQL<Q_SelfbillCount, S>, true>>;
type _R_SelfbillCount = Expect<
    Equal<GetReturnType<Q_SelfbillCount, S>, { count: number }>
>;

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:103-106  getRanges() max ---
type Q_SelfbillMaxDate = `
            select max("creationDate") as "maxDate"
            from "Network_Partnerize_Selfbill"
        `;
type _V_SelfbillMaxDate = Expect<Equal<ValidateSQL<Q_SelfbillMaxDate, S>, true>>;
type _R_SelfbillMaxDate = Expect<
    Equal<GetReturnType<Q_SelfbillMaxDate, S>, { maxDate: string }>
>;

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:130-132  createOrUpdateSelfbill() select ---
type Q_SelfbillSelectById = `
        select * from "Network_Partnerize_Selfbill" where "id" = $1
        `;
type _V_SelfbillSelectById = Expect<
    Equal<ValidateSQL<Q_SelfbillSelectById, S>, true>
>;
type _R_SelfbillSelectById = Expect<
    Equal<
        GetReturnType<Q_SelfbillSelectById, S>,
        S["schemas"]["public"]["Network_Partnerize_Selfbill"]
    >
>;

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:137-147  update (DML) ---
type Q_SelfbillUpdate = `
            update "Network_Partnerize_Selfbill"
            set "creationDate" = $1,
                "paymentDate" = $2,
                "netValue" = $3,
                "totalValue" = $4,
                "status" = $5,
                "details" = $6,
                "currency" = $7
            where "id" = $8
        `;
type _V_SelfbillUpdate = Expect<Equal<ValidateSQL<Q_SelfbillUpdate, S>, true>>;

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:162-169  insert (DML) ---
type Q_SelfbillInsert = `
            insert into
            "Network_Partnerize_Selfbill"
            ("id", "creationDate", "paymentDate",
            "netValue", "totalValue",
            "status", "details", "currency")
            values ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
type _V_SelfbillInsert = Expect<Equal<ValidateSQL<Q_SelfbillInsert, S>, true>>;

export type CommerceCronPlainTestsPass = true;
