/**
 * Shared fixtures for parser and validation stress tests.
 *
 * These schemas are intentionally rich: nested JSON objects, arrays, Record
 * types, enum unions, nullable columns, multiple named schemas, and a wide set
 * of FK-style tables (some sharing column names) so we can stress joins,
 * ambiguity, deep access, and casting.
 */

import type { DatabaseSchema } from "../../src/index.js";

// ---------------------------------------------------------------------------
// DeepSchema: nested JSON, arrays, Record, enums, multiple schemas
// ---------------------------------------------------------------------------

export type DeepSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            products: {
                id: number;
                name: string;
                price: number;
                quantity: number;
                discount: number | null;
                status: "active" | "discontinued" | "draft";
                created_at: string;
                // Deeply nested JSON-style column
                metadata: {
                    brand: string;
                    specs: {
                        weight: number;
                        dims: { w: number; h: number; d: number };
                    };
                    tags: string[];
                };
                attributes: Record<string, unknown>;
                prices: number[];
            };
            users: {
                id: number;
                email: string;
                balance: number;
                currency: "USD" | "EUR" | "GBP";
                is_active: boolean;
                profile: { firstName: string; lastName: string } | null;
            };
        };
        analytics: {
            events: {
                id: number;
                user_id: number;
                kind: "click" | "view" | "purchase";
                payload: Record<string, unknown>;
                ts: string;
            };
        };
    };
};

// ---------------------------------------------------------------------------
// WideSchema: many tables for join / ambiguity stress
// Several tables deliberately share `id`, `created_at`, and `status`.
// ---------------------------------------------------------------------------

export type WideSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: {
                id: number;
                name: string;
                email: string;
                created_at: string;
            };
            orders: {
                id: number;
                user_id: number;
                address_id: number;
                status: "pending" | "paid" | "shipped" | "cancelled";
                total: number;
                created_at: string;
            };
            order_items: {
                id: number;
                order_id: number;
                product_id: number;
                quantity: number;
                unit_price: number;
            };
            products: {
                id: number;
                category_id: number;
                title: string;
                price: number;
                status: "active" | "inactive";
                created_at: string;
            };
            categories: {
                id: number;
                parent_id: number | null;
                name: string;
            };
            payments: {
                id: number;
                order_id: number;
                amount: number;
                method: "card" | "paypal" | "wire";
                status: "ok" | "failed" | "refunded";
                created_at: string;
            };
            shipments: {
                id: number;
                order_id: number;
                carrier: string;
                tracking: string | null;
                status: "label" | "transit" | "delivered";
            };
            addresses: {
                id: number;
                user_id: number;
                line1: string;
                city: string;
                country: string;
            };
        };
    };
};

// Compile-time sanity: both fixtures satisfy the public DatabaseSchema shape.
export type _DeepIsSchema = DeepSchema extends DatabaseSchema ? true : false;
export type _WideIsSchema = WideSchema extends DatabaseSchema ? true : false;
