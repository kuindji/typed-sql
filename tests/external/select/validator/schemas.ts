/**
 * Shared test schemas for validator tests
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

export type JsonFieldSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            items: {
                id: number;
                name: string;
                metadata: { foo: string; bar: number; };
                config: {
                    settings: {
                        enabled: boolean;
                        values: number[];
                    };
                    tags: string[];
                };
                extra: { key: string; } | null;
                data: Record<string, unknown>;
            };
        };
    };
};
