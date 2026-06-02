// tests/builder/fixtures/write-schema.ts
// Realistic branded schema fixture for the write-builder tests. Mirrors the
// monorepo shape: branded scalar field types, FK columns referencing other
// brands, nullable columns, JSON columns, and wide tables (the TS2589 stressor).
import type { DatabaseSchema } from "../../../src/schema.js";

export type User_id = string & { __table: "User" };
export type Order_id = string & { __table: "Order" };
export type Product_id = string & { __table: "Product" };
export type Team_id = string & { __table: "Team" };
export type Invoice_id = string & { __table: "Invoice" };
export type Json = unknown;

type WideUser = {
    id: User_id;
    teamId: Team_id | null;
    email: string;
    name: string | null;
    phone: string | null;
    status: "active" | "pending" | "banned";
    age: number;
    score: number | null;
    verified: boolean;
    createdAt: string;
    updatedAt: string | null;
    metadata: Json;
    c13: string; c14: string; c15: string; c16: string;
    c17: string; c18: string; c19: string; c20: string;
    c21: number | null; c22: number; c23: boolean; c24: boolean;
    c25: string | null; c26: string; c27: string; c28: string;
    c29: string; c30: string; c31: string; c32: string;
};

type WideOrder = {
    id: Order_id;
    userId: User_id;
    productId: Product_id | null;
    teamId: Team_id | null;
    invoiceId: Invoice_id | null;
    amount: number;
    currency: string;
    quantity: number;
    note: string | null;
    paid: boolean;
    createdAt: string;
    d12: string; d13: string; d14: string; d15: string;
    d16: string; d17: string; d18: string; d19: string;
    d20: number | null; d21: number; d22: boolean; d23: boolean;
    d24: string | null; d25: string; d26: string; d27: string;
    d28: string; d29: string; d30: string;
};

type Product = {
    id: Product_id;
    name: string;
    price: number;
    active: boolean;
    tags: string[];          // array-VALUED column (distinct from IN-expansion)
    meta: { sku: string };   // JSON/object column
};

export type WriteSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: WideUser;
            orders: WideOrder;
            products: Product;
        };
    };
};

export const asUserId = (s: string) => s as User_id;
export const asOrderId = (s: string) => s as Order_id;
export const asProductId = (s: string) => s as Product_id;
export const asTeamId = (s: string) => s as Team_id;
