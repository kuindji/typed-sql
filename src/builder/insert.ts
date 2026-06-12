// src/builder/insert.ts
import type { DatabaseSchema } from "../schema.js";
import type { RowTypeForTable } from "../schema.js";
import type { TableKeyFromToken } from "../tables.js";
import { assembleInsertSQL, buildRowsClause } from "./write-assemble.js";
import { EMPTY_INSERT_STATE, type RuntimeInsertState } from "./write-state.js";
import {
    assertAllProvided, collectScanned, expandScanned, type DriverParamValue,
} from "./scanner.js";
import type { InsertTag, WriteParamsFor, WriteReturnFor } from "./write-tag.js";

type PushVal<T extends InsertTag, Col extends string, Text extends string, Cond extends boolean> =
    Omit<T, "values"> & { readonly values: readonly [...T["values"], { col: Col; text: Text; cond: Cond }] };

// Resolved schema row for the `.into()` token ("orders" or "schema.orders",
// case-insensitive via TableKeyFromToken). `never` when unresolvable.
type TableRowFor<Tbl extends string, S extends DatabaseSchema> =
    RowTypeForTable<TableKeyFromToken<Tbl, S> & string, S>;

// Input row for `.rows()`: any subset of the target table's columns with their
// exact (branded) types — keys are emitted verbatim into SQL, so they must
// match the schema's exact casing. Unresolvable table → loose record (lenient).
type RowsInputFor<Tbl extends string, S extends DatabaseSchema> =
    [TableRowFor<Tbl, S>] extends [never] ? Record<string, DriverParamValue>
    : Partial<TableRowFor<Tbl, S>>;

type AllowedRowKeys<Tbl extends string, S extends DatabaseSchema> =
    [TableRowFor<Tbl, S>] extends [never] ? string : keyof TableRowFor<Tbl, S>;

// Two checks the Partial constraint alone cannot make:
// 1. unknown keys — a constraint check is structural, so an excess property in
//    an inferred Row slips through `Row extends Partial<...>`;
// 2. homogeneity — heterogeneous array literals infer Row as a UNION. The
//    best-common-type of `[{a;b},{a}]` is `{a;b} | {a; b?: undefined}` — the
//    missing key reappears as `b?: undefined`, so a plain `keyof` comparison
//    sees identical key sets. Compare PRESENT keys instead (a key whose value
//    is exactly `undefined` in an arm is absent there): every arm's present-key
//    set must equal the union of all arms' present keys. A genuine nullable
//    column (`note: string | null`) keeps its key — `undefined extends string |
//    null` is false — so same-keys-different-value-types rows stay homogeneous.
type PresentKeys<R> = { [K in keyof R]-?: undefined extends R[K] ? never : K }[keyof R];
type AllPresentKeys<R> = R extends any ? PresentKeys<R> : never;
// Every arm's present-key set must equal the union over all arms — i.e. no arm
// is missing a key some other arm has. `All` is captured from the whole union
// up front, then `EachArmCovers` distributes the per-arm comparison against it.
type EachArmCovers<Row, All> =
    Row extends any
        ? [Exclude<All, PresentKeys<Row>>] extends [never] ? true : false
        : never;
type RowsHomogeneous<Row> =
    [EachArmCovers<Row, AllPresentKeys<Row>>] extends [true] ? true : false;
type AllRowKeys<R> = R extends any ? keyof R : never;
type RowsGuard<Row, Allowed> =
    [Exclude<AllRowKeys<Row>, Allowed>] extends [never]
        ? [RowsHomogeneous<Row>] extends [true]
            ? unknown
            : readonly ["Error: all rows must share the same column set"][]
        : readonly ["Error: unknown column in .rows()"][];

export interface InsertQueryBuilder<S extends DatabaseSchema, T extends InsertTag> {
    into<Tbl extends string>(table: Tbl): InsertQueryBuilder<S, Omit<T, "table"> & { table: Tbl }>;
    // INSERT...SELECT: explicit column list, then a free-text SELECT body. When
    // `fromSelect` is set the VALUES path is bypassed and the SELECT form is built.
    columns<C extends string>(cols: C): InsertQueryBuilder<S, Omit<T, "columns"> & { columns: C }>;
    fromSelect<Q extends string>(q: Q): InsertQueryBuilder<S, Omit<T, "fromSelect"> & { fromSelect: Q }>;
    value<Col extends string, Text extends string>(col: Col, text: Text):
        InsertQueryBuilder<S, PushVal<T, Col, Text, false>>;
    valueIf<Col extends string, Text extends string>(cond: boolean, col: Col, text: Text):
        InsertQueryBuilder<S, PushVal<T, Col, Text, true>>;
    // Subset of the target table's columns with their exact (branded) types; all
    // rows must share one column set (RowsGuard enforces unknown-key + homogeneity).
    rows<Row extends RowsInputFor<T["table"], S>>(
        rows: readonly Row[] & RowsGuard<Row, AllowedRowKeys<T["table"], S>>,
    ): InsertQueryBuilder<S, T>;
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
    // Store the explicit column list / SELECT body for the INSERT...SELECT form.
    columns(cols: string): any { return this.next({ ...this.st, columns: cols }); }
    fromSelect(q: string): any { return this.next({ ...this.st, fromSelect: q }); }
    value(col: string, text: string): any {
        return this.next({ ...this.st, values: [...this.st.values, { col, text }] });
    }
    valueIf(cond: boolean, col: string, text: string): any {
        return cond ? this.value(col, text) : this.next(this.st);
    }
    rows(rows: ReadonlyArray<Record<string, DriverParamValue>>): any {
        // Validates eagerly (fail fast) and stores the synthetic per-cell params;
        // assembleInsertSQL re-derives the same names from state.rows.
        const { params } = buildRowsClause(rows);
        return this.next({
            ...this.st, rows,
            namedParams: { ...this.st.namedParams, ...params },
        });
    }
    onConflict(clause: string): any { return this.next({ ...this.st, conflict: clause }); }
    returning(cols: string): any { return this.next({ ...this.st, returning: cols }); }
    withParams(params: Record<string, DriverParamValue>): any {
        // The __tsqlrow_ namespace is reserved for .rows() synthetic params; a
        // user key there would silently overwrite a row value (user params merge
        // last), so reject it outright.
        if (this.st.rows) {
            for (const k of Object.keys(params)) {
                if (k.startsWith("__tsqlrow_")) {
                    throw new Error(
                        `Query parameter ":${k}" uses the reserved __tsqlrow_ prefix`);
                }
            }
        }
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
    columns: ""; fromSelect: "";
    wheres: readonly []; using: readonly []; from: readonly []; returning: null;
};

export function createInsertQuery<S extends DatabaseSchema>(): InsertQueryBuilder<S, EmptyInsertTag> {
    return new InsertImpl<S, EmptyInsertTag>(EMPTY_INSERT_STATE) as unknown as InsertQueryBuilder<S, EmptyInsertTag>;
}
