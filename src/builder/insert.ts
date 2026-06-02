// src/builder/insert.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleInsertSQL } from "./write-assemble.js";
import { EMPTY_INSERT_STATE, type RuntimeInsertState } from "./write-state.js";
import {
    assertAllProvided, collectScanned, expandScanned, type DriverParamValue,
} from "./scanner.js";
import type { InsertTag, WriteParamsFor, WriteReturnFor } from "./write-tag.js";

type PushVal<T extends InsertTag, Col extends string, Text extends string, Cond extends boolean> =
    Omit<T, "values"> & { readonly values: readonly [...T["values"], { col: Col; text: Text; cond: Cond }] };

export interface InsertQueryBuilder<S extends DatabaseSchema, T extends InsertTag> {
    into<Tbl extends string>(table: Tbl): InsertQueryBuilder<S, Omit<T, "table"> & { table: Tbl }>;
    value<Col extends string, Text extends string>(col: Col, text: Text):
        InsertQueryBuilder<S, PushVal<T, Col, Text, false>>;
    valueIf<Col extends string, Text extends string>(cond: boolean, col: Col, text: Text):
        InsertQueryBuilder<S, PushVal<T, Col, Text, true>>;
    onConflict<C extends string>(clause: C):
        InsertQueryBuilder<S, Omit<T, "conflict"> & { conflict: C }>;
    returning<R extends string>(cols: R):
        InsertQueryBuilder<S, Omit<T, "returning"> & { returning: R }>;
    withParams(params: WriteParamsFor<T, S>): BoundWrite<S, T>;
    toString(): string;
}

export interface BoundWrite<S extends DatabaseSchema, T> {
    toString(): string;
    getParams(): ReadonlyArray<DriverParamValue>;
    readonly __returning?: WriteReturnFor<T, S>;
}

class InsertImpl<S extends DatabaseSchema, T extends InsertTag> {
    constructor(private readonly st: RuntimeInsertState) {}
    private next(st: RuntimeInsertState): any { return new InsertImpl<S, any>(st); }
    into(table: string): any { return this.next({ ...this.st, table }); }
    value(col: string, text: string): any {
        return this.next({ ...this.st, values: [...this.st.values, { col, text }] });
    }
    valueIf(cond: boolean, col: string, text: string): any {
        return cond ? this.value(col, text) : this.next(this.st);
    }
    onConflict(clause: string): any { return this.next({ ...this.st, conflict: clause }); }
    returning(cols: string): any { return this.next({ ...this.st, returning: cols }); }
    withParams(params: Record<string, DriverParamValue>): any {
        return this.next({ ...this.st, namedParams: { ...this.st.namedParams, ...params } });
    }
    toString(): string {
        const sql = assembleInsertSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return expandScanned(sql, this.st.namedParams);
    }
    getParams(): ReadonlyArray<DriverParamValue> {
        const sql = assembleInsertSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return collectScanned(sql, this.st.namedParams);
    }
}

export type EmptyInsertTag = {
    kind: "insert"; table: ""; values: readonly []; conflict: null;
    wheres: readonly []; using: readonly []; from: readonly []; returning: null;
};

export function createInsertQuery<S extends DatabaseSchema>(): InsertQueryBuilder<S, EmptyInsertTag> {
    return new InsertImpl<S, EmptyInsertTag>(EMPTY_INSERT_STATE) as unknown as InsertQueryBuilder<S, EmptyInsertTag>;
}
