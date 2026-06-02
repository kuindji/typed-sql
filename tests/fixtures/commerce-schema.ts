import type { EcommerceSchema } from "./ecommerce-schema.js";

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

type EcommerceTables = EcommerceSchema["schemas"]["public"];

type MainTables = Omit<
    EcommerceTables,
    | "Network_Order"
    | "Network_Order_CJ_Item"
    | "Network_Order_Partnerize_Item"
    | "Network_Order_Rakuten_Item"
    | "Revolut_PaymentDraft"
    | "User_ApprovedPayment"
> & {
    Network_Order: EcommerceTables["Network_Order"] & {
        manualPseBalance: number | null;
        realPseBalance: number;
        archived: boolean;
    };
    Network_Order_CJ_Item: EcommerceTables["Network_Order_CJ_Item"] & {
        manualPseBalance: number | null;
        realPseBalance: number;
    };
    Network_Order_Partnerize_Item: EcommerceTables["Network_Order_Partnerize_Item"] & {
        manualPseBalance: number | null;
        realPseBalance: number;
    };
    Network_Order_Rakuten_Item: EcommerceTables["Network_Order_Rakuten_Item"] & {
        manualPseBalance: number | null;
        realPseBalance: number;
    };
    ExchangeRate: {
        from: string;
        to: string;
        rate: number;
        updatedAt: string;
    };
    ExchangeRate_History: {
        date: string;
        from: string;
        to: string;
        rate: number;
    };
    Revolut_PaymentDraft_History: {
        id: string;
        revolutDraftId: string;
        data: string;
        createdAt: string;
    };
    Revolut_PaymentDraft: {
        id: string;
        userId: string | null;
        amount: number;
        currency: string;
        status: string;
        createdAt: string;
        revolutDraftId: string | null;
        reference: string;
        transactionId: string | null;
        metadata: Json | null;
        vat: number;
        teamId: string | null;
    };
    PSEApplication: {
        id: string;
        userId: string | null;
        accepted: boolean;
        createdVia: string | null;
        submittedWithOptional: boolean;
        createdAt: string;
    };
    User_Analytics: {
        userId: string;
        isPSE: boolean;
        isPSEAdopted: boolean;
        isPSEPartiallyAdopted: boolean;
        isPSEActive: boolean;
        pushFirstEnabledAt: string | null;
        bankDetailsFirstAddedAt: string | null;
        linkFirstCreatedAt: string | null;
        consultationFirstCreatedAt: string | null;
        lookFirstCreatedAt: string | null;
        moodboardFirstCreatedAt: string | null;
        catalogueFirstSentAt: string | null;
        catalogueFirstSharedAt: string | null;
        saleByECFirstAt: string | null;
        saleByPSEFirstAt: string | null;
        invitationFirstSharedAt: string | null;
        invitationFirstAcceptedAt: string | null;
    };
    Look: {
        id: string;
        friId: string | null;
        consultationId: string | null;
        publishedAt: string | null;
        createdAt: string;
    };
    Link: {
        id: string;
        referenceUserId: string | null;
        lookProductId: string | null;
        catalogueProductId: string | null;
        targetUrl: string | null;
        sku: string | null;
        moodboardId: string | null;
        productReferenceId: string | null;
        teamId: string | null;
        hash: string;
        brand: string | null;
        name: string | null;
        retailer: string | null;
        createdAt: string;
    };
    Product: {
        id: string;
        lookId: string | null;
        productReferenceId: string | null;
        name: string | null;
        retailer: string | null;
    };
    Catalogue_ProductReference: {
        id: string;
        productId: string | null;
    };
    User_PaymentSettings: {
        id: string;
        userId: string;
        friCommission: number | null;
        contributorCommission: number | null;
        pseCommission: number | null;
        companyName: string | null;
        billingAddress: Json | null;
        vatNumber: string | null;
        vatRegDate: string | null;
        companyRegNumber: string | null;
        vatEnabled: boolean;
        vatCountry: string | null;
    };
    Team_PaymentSettings: {
        teamId: string;
        companyName: string | null;
        companyRegNumber: string | null;
        vatNumber: string | null;
        vatRegDate: string | null;
        vatCountry: string | null;
        vatEnabled: boolean;
        billingAddress: Json | null;
    };
    Consultation: {
        id: string;
        friId: string | null;
        createdAt: string;
    };
    Moodboard: {
        id: string;
        friId: string | null;
        name: string | null;
        createdAt: string;
    };
    Retailer: {
        id: string;
        name: string;
        visible: boolean;
    };
    Chat_Participant: {
        id: string;
        chatId: string;
        userId: string;
    };
    Team: {
        id: string;
        name: string;
    };
    Team_Member: {
        id: string;
        teamId: string;
        userId: string;
        teamRoleId: string | null;
        disabled: boolean;
    };
    Team_Role: {
        id: string;
        name: string;
    };
    Team_Revolut_Counterparty: {
        id: string;
        teamId: string;
    };
    Revolut_Counterparty: {
        id: string;
        userId: string;
    };
    Team_Member_SalesTarget: {
        id: string;
        teamId: string;
        pseId: string;
        annualSalesTarget: number;
        monthlySalesTarget: number;
        currency: string;
        updatedAt: string;
    };
    Network_Order_Correction: {
        id: string;
        orderId: string;
        correctionDate: string;
        details: string;
    };
    User_ApprovedPayment: {
        id: string;
        userId: string | null;
        networkOrderId: string | null;
        type: number | null;
        amount: number;
        currency: string;
        comment: string | null;
        createdAt: string;
        paid: boolean;
        paymentMonth: string | null;
        revolutDraftId: string | null;
        revolutReference: string | null;
        vat: number;
        status: string;
        teamId: string | null;
    };
};

export type CommerceMainSchema = {
    defaultSchema: "public";
    schemas: {
        public: MainTables;
    };
};

export type CommerceCatalogueSchema = {
    defaultSchema: "catalogue";
    schemas: {
        catalogue: {
            api_key_settings: {
                api_key_id: string;
                settings: Json;
                internal: boolean;
            };
            file: {
                id: string;
                file_group_id: string;
                region: string;
                import_state: string | null;
                import_enabled: boolean;
                download_enabled: boolean;
                search_enabled: boolean;
                created_at: string;
                // cli maintenance/feeds/{stale-feeds-report,check-remote-sources}.ts
                source: string;
                source_path: string;
                variant: string;
                last_downloaded_at: string | null;
                last_checked_at: string | null;
                last_modified_at: string | null;
                s3_filename: string | null;
                download_failed: boolean;
                last_download_error: string | null;
                size_downloaded: number | null;
            };
            file_history: {
                file_id: string;
                last_import_id: string | null;
                rows_in_file: number | null;
                products_in_file: number | null;
                stats: Json | null;
                timing: Json | null;
                created_at: string;
                total_time: number | null;
                failed: boolean;
                error: string | null;
            };
            product: {
                id: string;
                retailer: string;
            };
            product_metadata: {
                product_id: string;
                file_id: string;
                used: boolean | null;
            };
            product_search: {
                product_id: string;
                tags: string[];
                new_in_at: string | null;
            };
            // cli migrations/s3-vector/s3-vectors-migrate.ts — partitioned
            // search tables (suffix resolved to "gb" in the materialized query).
            product_image_search_gb: {
                product_id: string;
                partition_key: string;
                color_id: string | null;
                embedding: number[] | null;
            };
            product_search_gb: {
                product_id: string;
                partition_key: string;
                tags: string[];
                min_price_usd: number | null;
                new_in_at: string | null;
            };
            query_stats: {
                id: string;
                params: Json;
                use_count: number;
                last_used_at: string;
            };
            query_stats_date: {
                query_stats_id: string;
                date: string;
                use_count: number;
            };
            query_stats_log: {
                id: string;
                query_stats_id: string;
                used_at: string;
                execution_time: number | null;
                partitions: Json | null;
            };
            retailer: {
                id: string;
                new_in_weight: number | null;
                new_products_last_7_days: number | null;
            };
            task: {
                id: string;
                task: string;
                status: string;
                params: Json | null;
                created_at: string;
                updated_at: string;
                error: string | null;
                state: Json | null;
            };
        };
    };
};
