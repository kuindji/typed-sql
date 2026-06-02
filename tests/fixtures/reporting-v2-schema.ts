/**
 * Comprehensive schema fixture for the reporting-v2 (and sibling) lambda query
 * tests. Built on top of CommerceMainSchema (which already aggregates the
 * EcommerceSchema public tables + commerce extras), then extended with the
 * tables/columns the real lambda queries reference that the base fixtures lack.
 *
 * Rationale: a dedicated superset fixture keeps the existing `select *` /
 * full-row assertions in other test files from regressing, while ensuring any
 * NEW test failure reflects a genuine engine limitation — not a missing column.
 *
 * Catalogue-side queries (backend-v2 catalogue.ts, hasura-trigger catalogue
 * handlers) use CommerceCatalogueSchema directly — it is already complete.
 */
import type { Json, CommerceMainSchema } from "./commerce-schema.js";

type MainPublic = CommerceMainSchema["schemas"]["public"];

type ReportingV2Public =
    & Omit<
        MainPublic,
        | "Revolut_PaymentInvoice"
        | "Team_Member"
        | "User_Analytics"
        | "Revolut_Counterparty"
        | "Team_Revolut_Counterparty"
        | "Consultation"
        | "Look"
        | "Moodboard"
    >
    & {
        // reporting-v2 controller/pse/assign-previous.ts re-attributes teamId.
        Consultation: MainPublic["Consultation"] & { teamId: string | null };
        Look: MainPublic["Look"] & { teamId: string | null };
        Moodboard: MainPublic["Moodboard"] & { teamId: string | null };

        // reporting-v2 controller/pse/approve-commission.ts + order/set-pse.ts
        Retailer_Commission: {
            retailerId: string;
            affiliateId: string;
            advertiserName: string;
            pseCommission: number;
            tfCommission: number;
            tfCommissionJewellery: number;
            region: string;
            updatedAt: string | null;
            tfSaleCommission: number | null;
        };
        Retailer_Commission_History: {
            retailerId: string;
            affiliateId: string;
            advertiserName: string;
            pseCommission: number;
            tfCommission: number;
            tfCommissionJewellery: number;
            region: string;
            startedAt: string;
            endedAt: string;
            id: string;
        };
        // team/my invoices chains filter on i."teamId" — absent from the
        // ecommerce-derived Revolut_PaymentInvoice shape.
        Revolut_PaymentInvoice: MainPublic["Revolut_PaymentInvoice"] & {
            teamId: string | null;
        };

        // Columns referenced by revolut/teamCounterparty + payment cohort queries.
        Team_Member: MainPublic["Team_Member"] & {
            role: string;
            accessSettings: Json | null;
            createdAt: string;
        };
        Revolut_Counterparty: MainPublic["Revolut_Counterparty"] & {
            counterpartyId: string;
            updatedAt: string;
        };
        Team_Revolut_Counterparty: MainPublic["Team_Revolut_Counterparty"] & {
            counterpartyId: string;
            updatedAt: string;
        };
        // hasura-trigger upserts touch these analytics counters.
        User_Analytics: MainPublic["User_Analytics"] & {
            bankDetailsAddedNum: number;
            pushEnabledTimes: number;
        };

        // backend-v2/controller/my/target.ts — entirely missing from base fixtures.
        User_CommissionTarget: {
            userId: string;
            targetCommission: number;
            currency: string;
            updatedAt: string;
        };
        // backend-v2/controller/my/push-token-remove.ts
        User_ExpoPushToken: {
            id: string;
            userId: string;
            deviceId: string;
            pushToken: string;
            enabled: boolean;
            createdAt: string;
            app: string | null;
            projectId: string | null;
        };
        // backend-v2/controller/moodboard/{rearrange,set-positions}.ts
        Moodboard_ProductReference: {
            id: string;
            moodboardId: string;
            productReferenceId: string;
            userId: string;
            position: number;
            createdAt: string;
        };
        // hasura-trigger/handlers/invitation.ts
        Invitation: {
            id: string;
            email: string | null;
            createdAt: string;
            used: boolean;
            accepted: boolean;
            usedAt: string | null;
            userId: string | null;
            name: string | null;
            disabled: boolean;
            createdBy: string | null;
        };
        // hasura-trigger/handlers/revolutPaymentInvoice.ts
        Revolut_PaymentCreditNote: {
            id: string;
            invoiceId: string;
            paymentId: string | null;
            userId: string | null;
            amount: number;
            vat: number;
            currency: string;
            createdAt: string;
            data: Json | null;
        };
        // cli migrations/cognito-custom-attr/backfill-cognito-attrs.ts
        User_Cognito: {
            cognitoId: string;
            userId: string;
        };
        // cron delete-connections/src/index.ts
        Connection: {
            id: string;
            deleted: boolean;
            deletedAt: string | null;
        };
        // cron remove-recently-deleted/src/index.ts
        User_RecentlyDeleted: {
            id: string;
            userId: string;
            deletedAt: string | null;
        };
    };

export type ReportingV2Schema = {
    defaultSchema: "public";
    schemas: {
        public: ReportingV2Public;
    };
};

export type { Json };
export type {
    CommerceCatalogueSchema as ReportingV2CatalogueSchema,
} from "./commerce-schema.js";
