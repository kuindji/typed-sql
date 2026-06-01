// tests/fixtures/reporting-schema.ts
// Minimal schema capturing the two tables the reporting-v2 chains touch.
// Column types mirror the monorepo's Revolut_PaymentDraft / Revolut_PaymentInvoice
// shapes (field aliases resolved to primitives). Nullable columns use `| null`.
export type ReportingSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            Revolut_PaymentDraft: {
                id: string;
                userId: string;
                amount: number;
                currency: string;
                status: string;
                createdAt: string;
                revolutDraftId: string | null;
                reference: string | null;
                transactionId: string | null;
                metadata: string | null;
                vat: number;
                teamId: string | null;
            };
            Revolut_PaymentInvoice: {
                id: string;
                paymentId: string;
                createdAt: string;
                status: string;
                amount: number;
                vat: number;
                userId: string;
                data: string | null;
                s3key: string | null;
                currency: string;
                teamId: string | null;
            };
        };
    };
};
