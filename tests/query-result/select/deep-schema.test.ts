/**
 * ADVERSARIAL: deep / nested schema access.
 *
 * Selecting JSON-style object columns directly should preserve their nested
 * shape; JSON path operators (`->`, `->>`, `#>>`) should resolve to a value.
 * The library has no JSON-operator handling and partial object handling.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// Selecting a nested object column directly preserves its full shape
type D1 = QueryResult<"SELECT metadata FROM products", DeepSchema>;
type _D1 = RequireTrue<
    AssertEqual<
        D1,
        {
            metadata: {
                brand: string;
                specs: { weight: number; dims: { w: number; h: number; d: number } };
                tags: string[];
            };
        }
    >
>;

// json ->> 'key' returns text — NULL when the key is absent / the value is JSON null
type D2 = QueryResult<"SELECT metadata->>'brand' AS brand FROM products", DeepSchema>;
type _D2 = RequireTrue<AssertEqual<D2, { brand: string | null }>>;

// json -> 'key' returns json (object/unknown), with key preserved
type D3 = QueryResult<"SELECT metadata->'specs' AS specs FROM products", DeepSchema>;
type _D3 = RequireTrue<AssertEqual<D3, { specs: unknown }>>;

// deep path operator #>> '{specs,weight}'
type D4 = QueryResult<"SELECT metadata#>>'{specs,weight}' AS w FROM products", DeepSchema>;
type _D4 = RequireTrue<AssertEqual<D4, { w: string | null }>>;

// Array column preserved
type D5 = QueryResult<"SELECT prices FROM products", DeepSchema>;
type _D5 = RequireTrue<AssertEqual<D5, { prices: number[] }>>;

// Nullable nested object preserved
type D6 = QueryResult<"SELECT profile FROM users", DeepSchema>;
type _D6 = RequireTrue<
    AssertEqual<D6, { profile: { firstName: string; lastName: string } | null }>
>;

// Fully-qualified schema.table.column across a non-default schema
type D7 = QueryResult<"SELECT analytics.events.kind FROM analytics.events", DeepSchema>;
type _D7 = RequireTrue<AssertEqual<D7, { kind: "click" | "view" | "purchase" }>>;

// A JSON operator referencing a missing column must be invalid
type D8 = ValidateSQL<"SELECT not_json->>'x' AS x FROM products", DeepSchema>;
type _D8 = RequireTrue<AssertEqual<D8, false>>;

// SELECT * across a table with object/array/Record columns merges correctly
type D9 = QueryResult<"SELECT * FROM users", DeepSchema>;
type _D9 = RequireTrue<
    AssertEqual<
        D9,
        {
            id: number;
            email: string;
            balance: number;
            currency: "USD" | "EUR" | "GBP";
            is_active: boolean;
            profile: { firstName: string; lastName: string } | null;
        }
    >
>;

export type DeepSchemaAdversarialLoaded = true;
