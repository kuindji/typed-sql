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
    "Revolut_PaymentDraft" | "User_ApprovedPayment"
> & {
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

export type TheFloorrMainSchema = {
    defaultSchema: "public";
    schemas: {
        public: MainTables;
    };
};

export type TheFloorrCatalogueSchema = {
    defaultSchema: "catalogue";
    schemas: {
        catalogue: {
            api_key_settings: {
                api_key_id: string;
                settings: Json;
                internal: boolean;
            };
        };
    };
};
