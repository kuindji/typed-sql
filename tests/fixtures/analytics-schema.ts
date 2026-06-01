/**
 * Extended analytics schema for warehouse-scale query tests.
 */

export type AnalyticsWarehouseSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: {
                id: number;
                org_id: number | null;
                manager_id: number | null;
                plan_id: number | null;
                name: string;
                email: string;
                role: "admin" | "user" | "guest";
                country: string;
                is_active: boolean;
                created_at: string;
                deleted_at: string | null;
            };
            organizations: {
                id: number;
                name: string;
                industry: string;
                owner_user_id: number;
                created_at: string;
            };
            posts: {
                id: number;
                author_id: number;
                title: string;
                content: string;
                status: "draft" | "published";
                category: string;
                views: number;
                score: number;
                published_at: string | null;
            };
            comments: {
                id: number;
                post_id: number;
                user_id: number;
                content: string;
                sentiment: "positive" | "neutral" | "negative";
                score: number;
                created_at: string;
            };
            sessions: {
                id: number;
                user_id: number;
                device: string;
                channel: string;
                started_at: string;
                ended_at: string | null;
            };
            events: {
                id: number;
                session_id: number;
                user_id: number;
                event_name: string;
                event_value: number;
                created_at: string;
            };
            subscriptions: {
                id: number;
                user_id: number;
                plan_id: number;
                status: "active" | "trial" | "canceled";
                started_at: string;
                ended_at: string | null;
            };
            plans: {
                id: number;
                code: string;
                name: string;
                monthly_price: number;
                is_enterprise: boolean;
            };
            campaign_attributions: {
                id: number;
                user_id: number;
                campaign: string;
                source: string;
                medium: string;
                created_at: string;
            };
        };
        audit: {
            logs: {
                id: number;
                user_id: number | null;
                action: string;
                created_at: string;
            };
        };
        billing: {
            invoices: {
                id: number;
                user_id: number;
                subscription_id: number;
                amount: number;
                currency: "USD" | "EUR" | "GBP";
                status: "paid" | "open" | "void";
                issued_at: string;
                paid_at: string | null;
            };
            payments: {
                id: number;
                invoice_id: number;
                user_id: number;
                provider: string;
                amount: number;
                status: "succeeded" | "failed";
                created_at: string;
            };
        };
    };
};
