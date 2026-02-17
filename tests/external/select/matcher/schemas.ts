/**
 * Shared Test Schemas for Matcher Tests
 */

export type TestSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: {
                id: number;
                name: string;
                email: string;
                role: "admin" | "user" | "guest";
                is_active: boolean;
                created_at: string;
                deleted_at: string | null;
                currency: "USD" | "GBP" | "EUR";
            };
            posts: {
                id: number;
                author_id: number;
                title: string;
                content: string;
                views: number;
                status: "draft" | "published";
                published_at: string | null;
            };
            comments: {
                id: number;
                post_id: number;
                user_id: number;
                content: string;
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
    };
};

export type CamelCaseTestSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            userAccounts: {
                id: number;
                firstName: string;
                lastName: string;
                emailAddress: string;
            };
            orderItems: {
                id: number;
                orderId: number;
                unitPrice: number;
            };
        };
    };
};

export type JsonFieldSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            items: {
                id: number;
                name: string;
                // Nested object type (like a JSON field)
                metadata: { foo: string; bar: number; };
                // Deeply nested object
                config: {
                    settings: {
                        enabled: boolean;
                        values: number[];
                    };
                    tags: string[];
                };
                // Nullable object
                extra: { key: string; } | null;
                // Record type (common for JSON)
                data: Record<string, unknown>;
            };
        };
    };
};
