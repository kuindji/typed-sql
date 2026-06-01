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
        publishedAt: string | null;
        createdAt: string;
    };
    Link: {
        id: string;
        referenceUserId: string | null;
        createdAt: string;
    };
    Consultation: {
        id: string;
        friId: string | null;
        createdAt: string;
    };
    Moodboard: {
        id: string;
        friId: string | null;
        createdAt: string;
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
