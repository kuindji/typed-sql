// src/builder/delete.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleDeleteSQL } from "./write-assemble.js";
import { EMPTY_DELETE_STATE, type RuntimeDeleteState } from "./write-state.js";
import {
    assertAllProvided, collectScanned, expandScanned, type DriverParamValue,
} from "./scanner.js";
import type { DeleteTag, WriteParamsFor } from "./write-tag.js";
import type { BoundWrite } from "./insert.js";

type PushUsing<T extends DeleteTag, Text extends string, Cond extends boolean> =
    Omit<T, "using"> & { readonly using: readonly [...T["using"], { text: Text; cond: Cond }] };
type PushWhere<T extends DeleteTag, Text extends string, Cond extends boolean> =
    Omit<T, "wheres"> & { readonly wheres: readonly [...T["wheres"], { text: Text; cond: Cond }] };

export interface DeleteQueryBuilder<S extends DatabaseSchema, T extends DeleteTag> {
    from<Tbl extends string>(table: Tbl): DeleteQueryBuilder<S, Omit<T, "table"> & { table: Tbl }>;
    using<Text extends string>(source: Text): DeleteQueryBuilder<S, PushUsing<T, Text, false>>;
    usingIf<Text extends string>(cond: boolean, source: Text): DeleteQueryBuilder<S, PushUsing<T, Text, true>>;
    where<Text extends string>(cond: Text): DeleteQueryBuilder<S, PushWhere<T, Text, false>>;
    whereIf<Text extends string>(cond: boolean, clause: Text): DeleteQueryBuilder<S, PushWhere<T, Text, true>>;
    returning<R extends string>(cols: R): DeleteQueryBuilder<S, Omit<T, "returning"> & { returning: R }>;
    withParams(params: WriteParamsFor<T, S>): BoundWrite<S, T>;
    toString(): string;
}

class DeleteImpl<S extends DatabaseSchema, T extends DeleteTag> {
    constructor(private readonly st: RuntimeDeleteState) {}
    private next(st: RuntimeDeleteState): any { return new DeleteImpl<S, any>(st); }
    from(table: string): any { return this.next({ ...this.st, table }); }
    using(src: string): any { return this.next({ ...this.st, usings: [...this.st.usings, src] }); }
    usingIf(c: boolean, src: string): any { return c ? this.using(src) : this.next(this.st); }
    where(cond: string): any { return this.next({ ...this.st, wheres: [...this.st.wheres, cond] }); }
    whereIf(c: boolean, cond: string): any { return c ? this.where(cond) : this.next(this.st); }
    returning(cols: string): any { return this.next({ ...this.st, returning: cols }); }
    withParams(params: Record<string, DriverParamValue>): any {
        return this.next({ ...this.st, namedParams: { ...this.st.namedParams, ...params } });
    }
    toString(): string {
        const sql = assembleDeleteSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return expandScanned(sql, this.st.namedParams);
    }
    getParams(): ReadonlyArray<DriverParamValue> {
        const sql = assembleDeleteSQL(this.st);
        assertAllProvided(sql, this.st.namedParams);
        return collectScanned(sql, this.st.namedParams);
    }
}

export type EmptyDeleteTag = {
    kind: "delete"; table: ""; using: readonly []; wheres: readonly []; returning: null;
};

export function createDeleteQuery<S extends DatabaseSchema>(): DeleteQueryBuilder<S, EmptyDeleteTag> {
    return new DeleteImpl<S, EmptyDeleteTag>(EMPTY_DELETE_STATE) as unknown as DeleteQueryBuilder<S, EmptyDeleteTag>;
}
