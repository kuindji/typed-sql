// src/builder/select.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleSelectSQLRaw } from "./assemble.js";
import { ConditionTreeBuilder } from "./condition-tree.js";
import { type QueryParamInput, type QueryParamValue } from "./params.js";
import type { BuilderResultBrand } from "./return-type.js";
import { createScannedQuery } from "./scanner.js";
import type {
    EmptySqlTag,
    ResolveId,
    SelFrag,
    SqlTag,
    WithFrom,
    WithGroupBy,
    WithHaving,
    WithJoin,
    WithLimit,
    WithOffset,
    WithOrderBy,
    WithoutGroupBy,
    WithoutHaving,
    WithoutJoin,
    WithoutOrderBy,
    WithoutSelect,
    WithoutWhere,
    WithSelect,
    WithWhere,
} from "./sql-tag.js";
import {
    EMPTY_RUNTIME_STATE,
    hasFragment,
    removeFragment,
    type RuntimeSelectState,
    upsertFragment,
} from "./state.js";

// Text a condition contributes to the tag: a tree's Expr literal, or the string.
type CondText<C> = C extends ConditionTreeBuilder<any, infer E extends string>
    ? E
    : C extends string ? C
    : string;

// Render a columns argument (string | readonly string[]) to its joined text.
type ColsText<Cols> = Cols extends readonly string[] ? JoinArr<Cols>
    : Cols extends string ? Cols
    : string;
type JoinArr<A extends readonly string[], Acc extends string = ""> = A extends
    readonly [ infer H extends string, ...infer R extends readonly string[] ]
    ? JoinArr<R, Acc extends "" ? H : `${Acc}, ${H}`>
    : Acc;

// Re-flag every select fragment the applyIf transform INTRODUCED as conditional.
// "Introduced" = a brand-new id OR an existing id whose fragment the transform
// overwrote (different text/flag). Only fragments byte-identical to the input
// tag's same-id fragment are left untouched (they keep their flag). This is what
// makes the F-G2 edge correct: a conditional producer overwriting an
// unconditional slot carries the conditional flag (spec "Fragment-id reuse").
// Flat 11-field rebuild (NOT `Omit<After,"selects"> & {…}`) — see the DEPTH NOTE
// in sql-tag.ts: an `Omit`-based override nests on every chained builder call and
// crosses TS's depth guard.
type FlagNewConditional<Before extends SqlTag, After extends SqlTag> = {
    readonly ctes: After["ctes"];
    readonly selects: ReflagSelects<Before["selects"], After["selects"]>;
    readonly from: After["from"];
    readonly joins: After["joins"];
    readonly wheres: After["wheres"];
    readonly groupBys: After["groupBys"];
    readonly havings: After["havings"];
    readonly orderBys: After["orderBys"];
    readonly limit: After["limit"];
    readonly offset: After["offset"];
    readonly union: After["union"];
};
type ReflagSelects<
    Before extends readonly SelFrag[],
    After extends readonly SelFrag[],
> = {
    [I in keyof After]: After[I] extends SelFrag
        ? FindFragById<Before, After[I]["id"]> extends infer B
            ? [ B ] extends [ never ] ? MarkCond<After[I]> // brand-new id → conditional
            : FragEqual<B, After[I]> extends true ? After[I] // untouched → keep its flag
            : MarkCond<After[I]> // overwritten by transform → conditional
        : MarkCond<After[I]>
        : After[I];
};
type FindFragById<List extends readonly SelFrag[], Id extends string> =
    List extends readonly [
        infer H extends SelFrag,
        ...infer R extends readonly SelFrag[],
    ] ? H["id"] extends Id ? H : FindFragById<R, Id>
        : never;
type FragEqual<A, B> = [ A ] extends [ B ]
    ? ([ B ] extends [ A ] ? true : false)
    : false;
type MarkCond<F extends SelFrag> = {
    id: F["id"];
    text: F["text"];
    cond: true;
};

export interface SelectQueryBuilder<
    Schema extends DatabaseSchema,
    Sql extends SqlTag,
> {
    select<
        const Cols extends string | readonly string[],
        Id extends string | undefined = undefined,
    >(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithSelect<Sql, ColsText<Cols>, ResolveId<Id, ColsText<Cols>>, false>
    >;

    selectIf<
        const Cols extends string | readonly string[],
        Id extends string | undefined = undefined,
    >(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithSelect<Sql, ColsText<Cols>, ResolveId<Id, ColsText<Cols>>, true>
    >;

    from<Src extends string | SelectQueryBuilder<Schema, any>>(
        source: Src,
    ): SelectQueryBuilder<
        Schema,
        WithFrom<Sql, Src extends string ? Src : string>
    >;

    where<
        Cond extends string | ConditionTreeBuilder<any, any>,
        Id extends string | undefined = undefined,
    >(
        condition: Cond,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithWhere<Sql, CondText<Cond>, ResolveId<Id, CondText<Cond>>>
    >;

    whereIf<
        Cond extends string | ConditionTreeBuilder<any, any>,
        Id extends string | undefined = undefined,
    >(
        condition: boolean,
        clause: Cond,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithWhere<Sql, CondText<Cond>, ResolveId<Id, CondText<Cond>>>
    >;

    join<J extends string, Id extends string | undefined = undefined>(
        joinSql: J,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithJoin<Sql, J, ResolveId<Id, J>>>;

    joinIf<J extends string, Id extends string | undefined = undefined>(
        condition: boolean,
        joinSql: J,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithJoin<Sql, J, ResolveId<Id, J>>>;

    groupBy<
        const Cols extends string | readonly string[],
        Id extends string | undefined = undefined,
    >(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithGroupBy<Sql, ColsText<Cols>, ResolveId<Id, ColsText<Cols>>>
    >;

    groupByIf<
        const Cols extends string | readonly string[],
        Id extends string | undefined = undefined,
    >(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithGroupBy<Sql, ColsText<Cols>, ResolveId<Id, ColsText<Cols>>>
    >;

    having<
        Cond extends string | ConditionTreeBuilder<any, any>,
        Id extends string | undefined = undefined,
    >(
        condition: Cond,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithHaving<Sql, CondText<Cond>, ResolveId<Id, CondText<Cond>>>
    >;

    havingIf<
        Cond extends string | ConditionTreeBuilder<any, any>,
        Id extends string | undefined = undefined,
    >(
        condition: boolean,
        clause: Cond,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithHaving<Sql, CondText<Cond>, ResolveId<Id, CondText<Cond>>>
    >;

    orderBy<
        const Cols extends string | readonly string[],
        Id extends string | undefined = undefined,
    >(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithOrderBy<Sql, ColsText<Cols>, ResolveId<Id, ColsText<Cols>>>
    >;

    orderByIf<
        const Cols extends string | readonly string[],
        Id extends string | undefined = undefined,
    >(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<
        Schema,
        WithOrderBy<Sql, ColsText<Cols>, ResolveId<Id, ColsText<Cols>>>
    >;

    /** Emit `SELECT DISTINCT`. Does not change the result column set. */
    distinct(): SelectQueryBuilder<Schema, Sql>;
    /**
     * Emit `SELECT DISTINCT ON (columns)` (PostgreSQL). Does not change the
     * result column set; pair with a matching ORDER BY for deterministic rows.
     */
    distinctOn<const Cols extends string | readonly string[]>(
        columns: Cols,
    ): SelectQueryBuilder<Schema, Sql>;

    limit<const L extends number>(
        limit: L,
    ): SelectQueryBuilder<Schema, WithLimit<Sql, L>>;
    limitIf<const L extends number>(
        condition: boolean,
        limit: L,
    ): SelectQueryBuilder<Schema, WithLimit<Sql, L>>;
    offset<const O extends number>(
        offset: O,
    ): SelectQueryBuilder<Schema, WithOffset<Sql, O>>;
    offsetIf<const O extends number>(
        condition: boolean,
        offset: O,
    ): SelectQueryBuilder<Schema, WithOffset<Sql, O>>;

    removeSelect<Id extends string>(
        id: Id,
    ): SelectQueryBuilder<Schema, WithoutSelect<Sql, Id>>;
    removeJoin<Id extends string>(
        id: Id,
    ): SelectQueryBuilder<Schema, WithoutJoin<Sql, Id>>;
    removeWhere<Id extends string>(
        id: Id,
    ): SelectQueryBuilder<Schema, WithoutWhere<Sql, Id>>;
    removeGroupBy<Id extends string>(
        id: Id,
    ): SelectQueryBuilder<Schema, WithoutGroupBy<Sql, Id>>;
    removeHaving<Id extends string>(
        id: Id,
    ): SelectQueryBuilder<Schema, WithoutHaving<Sql, Id>>;
    removeOrderBy<Id extends string>(
        id: Id,
    ): SelectQueryBuilder<Schema, WithoutOrderBy<Sql, Id>>;

    // Runtime introspection over keyed clause state. Plain booleans — no
    // phantom-type transform; intended for imperative dedup helpers (e.g.
    // "upgrade LEFT JOIN to INNER only if the alias is already joined").
    hasSelect(id: string): boolean;
    hasJoin(id: string): boolean;
    hasWhere(id: string): boolean;
    hasGroupBy(id: string): boolean;
    hasHaving(id: string): boolean;
    hasOrderBy(id: string): boolean;
    hasFrom(): boolean;
    hasLimit(): boolean;
    hasOffset(): boolean;

    withParams<P extends Record<string, QueryParamInput>>(
        params: P,
    ): SelectQueryBuilder<Schema, Sql>;

    apply<Sql2 extends SqlTag>(
        fn: (
            b: SelectQueryBuilder<Schema, Sql>,
        ) => SelectQueryBuilder<Schema, Sql2>,
    ): SelectQueryBuilder<Schema, Sql2>;

    applyIf<Sql2 extends SqlTag>(
        condition: boolean,
        fn: (
            b: SelectQueryBuilder<Schema, Sql>,
        ) => SelectQueryBuilder<Schema, Sql2>,
    ): SelectQueryBuilder<Schema, FlagNewConditional<Sql, Sql2>>;

    getParams(): ReadonlyArray<QueryParamValue>;
    toString(): string;
    toBrandedString(): string & { __type: BuilderResultBrand<Schema, Sql>; };
}

class SelectQueryBuilderImpl<
    Schema extends DatabaseSchema,
    Sql extends SqlTag,
> {
    readonly _state: RuntimeSelectState;
    private compiled?: ReturnType<typeof createScannedQuery>;
    private query() { return this.compiled ??= createScannedQuery(assembleSelectSQLRaw(this._state)); }

    constructor(state?: RuntimeSelectState) {
        this._state = state ?? EMPTY_RUNTIME_STATE;
    }

    private clone(patch: Partial<RuntimeSelectState>): RuntimeSelectState {
        return { ...this._state, ...patch };
    }

    private next(state: RuntimeSelectState): any {
        return new SelectQueryBuilderImpl<Schema, any>(state);
    }

    select(columns: string | readonly string[], id?: string): any {
        const rawCols = Array.isArray(columns)
            ? [ ...columns ]
            : [ columns as string ];
        const cols = rawCols.length > 0 ? [ ...rawCols ] : [];
        const key = id ?? cols.join(", ");
        return this.next(this.clone({
            selects: upsertFragment(this._state.selects, key, cols),
        }));
    }

    selectIf(
        condition: boolean,
        columns: string | readonly string[],
        id?: string,
    ): any {
        return condition ? this.select(columns, id) : this.next(this._state);
    }

    from(
        source: string | {
            toString(): string;
            getParams(): ReadonlyArray<QueryParamValue>;
        },
    ): any {
        let fromSql: string;
        if (typeof source === "string") {
            fromSql = source;
        }
        else {
            if (source.getParams().length > 0) {
                throw new Error(
                    "from() does not support a parameterized subquery builder: the inner "
                        + "builder carries params that cannot be merged into the outer query. "
                        + "Inline the subquery as a string or remove its params.",
                );
            }
            fromSql = `(${source.toString()})`;
        }
        return this.next(this.clone({ fromSql }));
    }

    where(
        condition: string | ConditionTreeBuilder<any, any>,
        id?: string,
    ): any {
        // An empty condition tree contributes nothing — treat it as a no-op
        // (same as a false whereIf) so we never emit an invalid `WHERE ()`.
        // String conditions are always applied verbatim.
        if (condition instanceof ConditionTreeBuilder && condition.isEmpty()) {
            return this.next(this._state);
        }
        const sql = typeof condition === "string"
            ? condition
            : condition.toString();
        const key = id ?? sql;
        return this.next(
            this.clone({
                wheres: upsertFragment(this._state.wheres, key, sql),
            }),
        );
    }

    whereIf(
        condition: boolean,
        clause: string | ConditionTreeBuilder<any, any>,
        id?: string,
    ): any {
        return condition ? this.where(clause, id) : this.next(this._state);
    }

    join(joinSql: string, id?: string): any {
        const key = id ?? joinSql;
        // Idempotent by id: re-joining replaces the value in place, keeping its
        // FROM-chain position. A brand-new id is appended at the tail.
        return this.next(this.clone({
            joins: upsertFragment(this._state.joins, key, joinSql),
        }));
    }

    joinIf(condition: boolean, joinSql: string, id?: string): any {
        return condition ? this.join(joinSql, id) : this.next(this._state);
    }

    groupBy(columns: string | readonly string[], id?: string): any {
        const rawCols = Array.isArray(columns)
            ? [ ...columns ]
            : [ columns as string ];
        const key = id ?? rawCols.join(", ");
        return this.next(this.clone({
            groupBys: upsertFragment(
                this._state.groupBys,
                key,
                rawCols.join(", "),
            ),
        }));
    }

    groupByIf(
        condition: boolean,
        columns: string | readonly string[],
        id?: string,
    ): any {
        return condition ? this.groupBy(columns, id) : this.next(this._state);
    }

    having(
        condition: string | ConditionTreeBuilder<any, any>,
        id?: string,
    ): any {
        // An empty condition tree is a no-op (see where()): never emit
        // `HAVING ()`. String conditions are applied verbatim.
        if (condition instanceof ConditionTreeBuilder && condition.isEmpty()) {
            return this.next(this._state);
        }
        const sql = typeof condition === "string"
            ? condition
            : condition.toString();
        const key = id ?? sql;
        return this.next(
            this.clone({
                havings: upsertFragment(this._state.havings, key, sql),
            }),
        );
    }

    havingIf(
        condition: boolean,
        clause: string | ConditionTreeBuilder<any, any>,
        id?: string,
    ): any {
        return condition ? this.having(clause, id) : this.next(this._state);
    }

    orderBy(columns: string | readonly string[], id?: string): any {
        const rawCols = Array.isArray(columns)
            ? [ ...columns ]
            : [ columns as string ];
        const key = id ?? rawCols.join(", ");
        return this.next(this.clone({
            orderBys: upsertFragment(
                this._state.orderBys,
                key,
                rawCols.join(", "),
            ),
        }));
    }

    orderByIf(
        condition: boolean,
        columns: string | readonly string[],
        id?: string,
    ): any {
        return condition ? this.orderBy(columns, id) : this.next(this._state);
    }

    distinct(): any {
        return this.next(this.clone({ distinct: true }));
    }

    distinctOn(columns: string | readonly string[]): any {
        const cols = Array.isArray(columns)
            ? columns.join(", ")
            : (columns as string);
        return this.next(this.clone({ distinctOn: cols }));
    }

    limit(limit: number): any {
        return this.next(this.clone({ limit }));
    }
    limitIf(condition: boolean, limit: number): any {
        return condition ? this.limit(limit) : this.next(this._state);
    }
    offset(offset: number): any {
        return this.next(this.clone({ offset }));
    }
    offsetIf(condition: boolean, offset: number): any {
        return condition ? this.offset(offset) : this.next(this._state);
    }

    removeSelect(id: string): any {
        if (!hasFragment(this._state.selects, id)) return this.next(this._state);
        return this.next(this.clone({
            selects: removeFragment(this._state.selects, id),
        }));
    }

    removeJoin(id: string): any {
        if (!hasFragment(this._state.joins, id)) return this.next(this._state);
        return this.next(this.clone({
            joins: removeFragment(this._state.joins, id),
        }));
    }

    removeWhere(id: string): any {
        if (!hasFragment(this._state.wheres, id)) return this.next(this._state);
        return this.next(this.clone({
            wheres: removeFragment(this._state.wheres, id),
        }));
    }

    removeGroupBy(id: string): any {
        if (!hasFragment(this._state.groupBys, id)) return this.next(this._state);
        return this.next(this.clone({
            groupBys: removeFragment(this._state.groupBys, id),
        }));
    }

    removeHaving(id: string): any {
        if (!hasFragment(this._state.havings, id)) return this.next(this._state);
        return this.next(this.clone({
            havings: removeFragment(this._state.havings, id),
        }));
    }

    removeOrderBy(id: string): any {
        if (!hasFragment(this._state.orderBys, id)) return this.next(this._state);
        return this.next(this.clone({
            orderBys: removeFragment(this._state.orderBys, id),
        }));
    }

    // has*: read-only checks against the keyed runtime state.
    hasSelect(id: string): boolean {
        return hasFragment(this._state.selects, id);
    }
    hasJoin(id: string): boolean {
        return hasFragment(this._state.joins, id);
    }
    hasWhere(id: string): boolean {
        return hasFragment(this._state.wheres, id);
    }
    hasGroupBy(id: string): boolean {
        return hasFragment(this._state.groupBys, id);
    }
    hasHaving(id: string): boolean {
        return hasFragment(this._state.havings, id);
    }
    hasOrderBy(id: string): boolean {
        return hasFragment(this._state.orderBys, id);
    }
    hasFrom(): boolean {
        return this._state.fromSql !== undefined;
    }
    hasLimit(): boolean {
        return this._state.limit !== undefined;
    }
    hasOffset(): boolean {
        return this._state.offset !== undefined;
    }

    withParams(params: Record<string, QueryParamInput>): any {
        return this.next(this.clone({
            namedParams: { ...this._state.namedParams, ...params },
            namedParamsBound: true,
        }));
    }

    apply(fn: (b: any) => any): any {
        return fn(this);
    }

    applyIf(condition: boolean, fn: (b: any) => any): any {
        return condition ? fn(this) : this;
    }

    getParams(): ReadonlyArray<QueryParamValue> {
        const namedParams = this._state.namedParams;
        if (
            this._state.namedParamsBound || Object.keys(namedParams).length > 0
        ) {
            // IN-list-gated value collection (spec §6.5), shared with writes: an
            // array bound outside `IN (...)` (e.g. `= ANY(:ids)`) passes through
            // as ONE array value rather than being spread into N scalars. Such a
            // value is the array itself (a `readonly SqlValue[]`-shaped driver
            // param, serialized by the adapter), which the scalar-typed
            // `QueryParamValue` return doesn't name — so cast at this boundary.
            // The public return type is kept narrow (not widened to `unknown`) so
            // consumers whose `select()` requires `getParams(): SqlValue[]` still
            // accept the builder; the driver handles the array at runtime.
            return this.query().collect(namedParams) as ReadonlyArray<
                QueryParamValue
            >;
        }
        return this._state.params;
    }

    toString(): string {
        return this._state.namedParamsBound || Object.keys(this._state.namedParams).length > 0
            ? this.query().expand(this._state.namedParams)
            : assembleSelectSQLRaw(this._state);
    }

    toBrandedString(): any {
        return this.toString();
    }
}

export function createSelectQuery<
    Schema extends DatabaseSchema,
>(): SelectQueryBuilder<Schema, EmptySqlTag> {
    return new SelectQueryBuilderImpl<Schema, EmptySqlTag>(
        EMPTY_RUNTIME_STATE,
    ) as unknown as SelectQueryBuilder<Schema, EmptySqlTag>;
}
