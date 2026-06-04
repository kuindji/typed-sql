// src/builder/update.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleUpdateSQL } from "./write-assemble.js";
import { EMPTY_UPDATE_STATE, type RuntimeUpdateState } from "./write-state.js";
import {
    assertAllProvided, collectScanned, expandScanned, type DriverParamValue,
} from "./scanner.js";
import type { UpdateTag, WriteParamsFor } from "./write-tag.js";
import type { BoundWrite } from "./insert.js";

type PushSet<T extends UpdateTag, Text extends string, Cond extends boolean> =
    Omit<T, "sets"> & { readonly sets: readonly [...T["sets"], { text: Text; cond: Cond }] };
type PushFrom<T extends UpdateTag, Text extends string, Cond extends boolean> =
    Omit<T, "from"> & { readonly from: readonly [...T["from"], { text: Text; cond: Cond }] };
type PushWhere<T extends UpdateTag, Text extends string, Cond extends boolean> =
    Omit<T, "wheres"> & { readonly wheres: readonly [...T["wheres"], { text: Text; cond: Cond }] };

export interface UpdateQueryBuilder<S extends DatabaseSchema, T extends UpdateTag> {
    table<Tbl extends string, Al extends string = "">(table: Tbl, alias?: Al): UpdateQueryBuilder<S, Omit<T, "table" | "alias"> & { table: Tbl; alias: Al }>;
    set<Text extends string>(assignment: Text): UpdateQueryBuilder<S, PushSet<T, Text, false>>;
    setIf<Text extends string>(cond: boolean, assignment: Text): UpdateQueryBuilder<S, PushSet<T, Text, true>>;
    from<Text extends string>(source: Text): UpdateQueryBuilder<S, PushFrom<T, Text, false>>;
    fromIf<Text extends string>(cond: boolean, source: Text): UpdateQueryBuilder<S, PushFrom<T, Text, true>>;
    where<Text extends string>(cond: Text): UpdateQueryBuilder<S, PushWhere<T, Text, false>>;
    whereIf<Text extends string>(cond: boolean, clause: Text): UpdateQueryBuilder<S, PushWhere<T, Text, true>>;
    returning<R extends string>(cols: R): UpdateQueryBuilder<S, Omit<T, "returning"> & { returning: R }>;
    withParams(params: WriteParamsFor<T, S>): BoundWrite<S, T>;
    toString(): string;
}

class UpdateImpl<S extends DatabaseSchema, T extends UpdateTag> {
    constructor(private readonly st: RuntimeUpdateState) {}
    private next(st: RuntimeUpdateState): any { return new UpdateImpl<S, any>(st); }
    // Store the table and optional alias; alias flows into assembleUpdateSQL.
    table(table: string, alias?: string): any { return this.next({ ...this.st, table, alias }); }
    set(a: string): any { return this.next({ ...this.st, sets: [...this.st.sets, a] }); }
    setIf(c: boolean, a: string): any { return c ? this.set(a) : this.next(this.st); }
    from(src: string): any { return this.next({ ...this.st, froms: [...this.st.froms, src] }); }
    fromIf(c: boolean, src: string): any { return c ? this.from(src) : this.next(this.st); }
    where(cond: string): any { return this.next({ ...this.st, wheres: [...this.st.wheres, cond] }); }
    whereIf(c: boolean, cond: string): any { return c ? this.where(cond) : this.next(this.st); }
    returning(cols: string): any { return this.next({ ...this.st, returning: cols }); }
    withParams(params: Record<string, DriverParamValue>): any {
        return this.next({ ...this.st, namedParams: { ...this.st.namedParams, ...params } });
    }
    toString(): string {
        const sql = assembleUpdateSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return expandScanned(sql, this.st.namedParams);
    }
    getParams(): ReadonlyArray<DriverParamValue> {
        const sql = assembleUpdateSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return collectScanned(sql, this.st.namedParams);
    }
}

export type EmptyUpdateTag = {
    kind: "update"; table: ""; alias: ""; sets: readonly []; from: readonly [];
    wheres: readonly []; returning: null;
};

export function createUpdateQuery<S extends DatabaseSchema>(): UpdateQueryBuilder<S, EmptyUpdateTag> {
    return new UpdateImpl<S, EmptyUpdateTag>(EMPTY_UPDATE_STATE) as unknown as UpdateQueryBuilder<S, EmptyUpdateTag>;
}
