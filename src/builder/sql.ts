// src/builder/sql.ts
import type { DatabaseSchema } from "../schema.js";
import type { ExtractParams, ExtractReturning } from "./extract-params.js";
import {
    createScannedQuery, type DriverParamValue,
} from "./scanner.js";

/** A reusable, typed raw-SQL query object. */
export interface TypedSql<Q extends string, S extends DatabaseSchema> {
    withParams(params: ExtractParams<Q, S>): BoundSql<Q, S>;
    toString(): string;
}

export interface BoundSql<Q extends string, S extends DatabaseSchema> {
    toString(): string;
    getParams(): ReadonlyArray<DriverParamValue>;
    /** Phantom carrier for the RETURNING row type (read by createMutateFn). */
    readonly __returning?: ExtractReturning<Q, S>;
}

class BoundSqlImpl<Q extends string, S extends DatabaseSchema> {
    private compiled?: ReturnType<typeof createScannedQuery>;
    private query() { return this.compiled ??= createScannedQuery(this.raw); }
    constructor(
        private readonly raw: string,
        private readonly params: Record<string, DriverParamValue>,
    ) {}
    toString(): string {
        return this.query().expand(this.params);
    }
    getParams(): ReadonlyArray<DriverParamValue> {
        return this.query().collect(this.params);
    }
}

class TypedSqlImpl<Q extends string, S extends DatabaseSchema> {
    constructor(private readonly raw: string) {}
    withParams(params: Record<string, DriverParamValue>): any {
        return new BoundSqlImpl<Q, S>(this.raw, params);
    }
    toString(): string {
        return this.raw;
    }
}

/** Factory binding the schema once; covers INSERT/UPDATE/DELETE in Phase 1. */
export function createSql<S extends DatabaseSchema>() {
    return function sql<Q extends string>(query: Q): TypedSql<Q, S> {
        return new TypedSqlImpl<Q, S>(query) as unknown as TypedSql<Q, S>;
    };
}
