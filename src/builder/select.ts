// src/builder/select.ts
import type { DatabaseSchema } from "../schema.js";
import { assembleSelectSQL } from "./assemble.js";
import { collectParamValues, type QueryParamInput, type QueryParamValue } from "./params.js";
import { EMPTY_RUNTIME_STATE, type RuntimeSelectState } from "./state.js";
import { ConditionTreeBuilder } from "./condition-tree.js";
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
    WithSelect,
    WithWhere,
    WithoutGroupBy,
    WithoutHaving,
    WithoutJoin,
    WithoutOrderBy,
    WithoutSelect,
    WithoutWhere,
} from "./sql-tag.js";
import type { BuilderResultBrand } from "./return-type.js";

// Text a condition contributes to the tag: a tree's Expr literal, or the string.
type CondText<C> = C extends ConditionTreeBuilder<any, infer E extends string> ? E
    : C extends string ? C
    : string;

// Render a columns argument (string | readonly string[]) to its joined text.
type ColsText<Cols> = Cols extends readonly string[] ? JoinArr<Cols>
    : Cols extends string ? Cols
    : string;
type JoinArr<A extends readonly string[], Acc extends string = ""> =
    A extends readonly [infer H extends string, ...infer R extends readonly string[]]
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
            ? [B] extends [never]
                ? MarkCond<After[I]>                  // brand-new id → conditional
                : FragEqual<B, After[I]> extends true
                    ? After[I]                        // untouched → keep its flag
                    : MarkCond<After[I]>              // overwritten by transform → conditional
            : MarkCond<After[I]>
        : After[I];
};
type FindFragById<List extends readonly SelFrag[], Id extends string> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? H["id"] extends Id ? H : FindFragById<R, Id>
        : never;
type FragEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type MarkCond<F extends SelFrag> = { id: F["id"]; text: F["text"]; cond: true };

export interface SelectQueryBuilder<Schema extends DatabaseSchema, Sql extends SqlTag> {
    select<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithSelect<Sql, ColsText<Cols>, ResolveId<Id, "select", Sql["selects"]>, false>>;

    selectIf<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithSelect<Sql, ColsText<Cols>, ResolveId<Id, "select", Sql["selects"]>, true>>;

    from<Src extends string | SelectQueryBuilder<Schema, any>>(
        source: Src,
    ): SelectQueryBuilder<Schema, WithFrom<Sql, Src extends string ? Src : string>>;

    where<Cond extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        condition: Cond,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithWhere<Sql, CondText<Cond>, ResolveId<Id, "where", Sql["wheres"]>>>;

    whereIf<Cond extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        condition: boolean,
        clause: Cond,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithWhere<Sql, CondText<Cond>, ResolveId<Id, "where", Sql["wheres"]>>>;

    join<J extends string, Id extends string | undefined = undefined>(
        joinSql: J,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithJoin<Sql, J, ResolveId<Id, "join", Sql["joins"]>>>;

    joinIf<J extends string, Id extends string | undefined = undefined>(
        condition: boolean,
        joinSql: J,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithJoin<Sql, J, ResolveId<Id, "join", Sql["joins"]>>>;

    groupBy<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithGroupBy<Sql, ColsText<Cols>, ResolveId<Id, "group", Sql["groupBys"]>>>;

    groupByIf<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithGroupBy<Sql, ColsText<Cols>, ResolveId<Id, "group", Sql["groupBys"]>>>;

    having<Cond extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        condition: Cond,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithHaving<Sql, CondText<Cond>, ResolveId<Id, "having", Sql["havings"]>>>;

    havingIf<Cond extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        condition: boolean,
        clause: Cond,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithHaving<Sql, CondText<Cond>, ResolveId<Id, "having", Sql["havings"]>>>;

    orderBy<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithOrderBy<Sql, ColsText<Cols>, ResolveId<Id, "order", Sql["orderBys"]>>>;

    orderByIf<const Cols extends string | readonly string[], Id extends string | undefined = undefined>(
        condition: boolean,
        columns: Cols,
        id?: Id,
    ): SelectQueryBuilder<Schema, WithOrderBy<Sql, ColsText<Cols>, ResolveId<Id, "order", Sql["orderBys"]>>>;

    limit<const L extends number>(limit: L): SelectQueryBuilder<Schema, WithLimit<Sql, L>>;
    limitIf<const L extends number>(condition: boolean, limit: L): SelectQueryBuilder<Schema, WithLimit<Sql, L>>;
    offset<const O extends number>(offset: O): SelectQueryBuilder<Schema, WithOffset<Sql, O>>;
    offsetIf<const O extends number>(condition: boolean, offset: O): SelectQueryBuilder<Schema, WithOffset<Sql, O>>;

    removeSelect<Id extends string>(id: Id): SelectQueryBuilder<Schema, WithoutSelect<Sql, Id>>;
    removeJoin<Id extends string>(id: Id): SelectQueryBuilder<Schema, WithoutJoin<Sql, Id>>;
    removeWhere<Id extends string>(id: Id): SelectQueryBuilder<Schema, WithoutWhere<Sql, Id>>;
    removeGroupBy<Id extends string>(id: Id): SelectQueryBuilder<Schema, WithoutGroupBy<Sql, Id>>;
    removeHaving<Id extends string>(id: Id): SelectQueryBuilder<Schema, WithoutHaving<Sql, Id>>;
    removeOrderBy<Id extends string>(id: Id): SelectQueryBuilder<Schema, WithoutOrderBy<Sql, Id>>;

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
        fn: (b: SelectQueryBuilder<Schema, Sql>) => SelectQueryBuilder<Schema, Sql2>,
    ): SelectQueryBuilder<Schema, Sql2>;

    applyIf<Sql2 extends SqlTag>(
        condition: boolean,
        fn: (b: SelectQueryBuilder<Schema, Sql>) => SelectQueryBuilder<Schema, Sql2>,
    ): SelectQueryBuilder<Schema, FlagNewConditional<Sql, Sql2>>;

    getParams(): ReadonlyArray<QueryParamValue>;
    toString(): string;
    toBrandedString(): string & { __type: BuilderResultBrand<Schema, Sql> };
}

// (No `DefaultId`: idless calls resolve a type-level auto id via `ResolveId`
//  in each method's return type — see below.)

class SelectQueryBuilderImpl<Schema extends DatabaseSchema, Sql extends SqlTag> {
    readonly _state: RuntimeSelectState;

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
        const rawCols = Array.isArray(columns) ? [...columns] : [columns as string];
        const cols = rawCols.length > 0 ? [...rawCols] : [];
        const key = id ?? `select_${Object.keys(this._state.selectSql).length}`;
        return this.next(this.clone({
            selectSql: { ...this._state.selectSql, [key]: cols },
        }));
    }

    selectIf(condition: boolean, columns: string | readonly string[], id?: string): any {
        return condition ? this.select(columns, id) : this.next(this._state);
    }

    from(source: string | { toString(): string; getParams(): ReadonlyArray<QueryParamValue> }): any {
        let fromSql: string;
        if (typeof source === "string") {
            fromSql = source;
        }
        else {
            if (source.getParams().length > 0) {
                throw new Error(
                    "from() does not support a parameterized subquery builder: the inner " +
                    "builder carries params that cannot be merged into the outer query. " +
                    "Inline the subquery as a string or remove its params.",
                );
            }
            fromSql = `(${source.toString()})`;
        }
        return this.next(this.clone({ fromSql }));
    }

    where(condition: string | ConditionTreeBuilder<any, any>, id?: string): any {
        // An empty condition tree contributes nothing — treat it as a no-op
        // (same as a false whereIf) so we never emit an invalid `WHERE ()`.
        // String conditions are always applied verbatim.
        if (condition instanceof ConditionTreeBuilder && condition.isEmpty()) {
            return this.next(this._state);
        }
        const key = id ?? `where_${Object.keys(this._state.whereSql).length}`;
        const sql = typeof condition === "string" ? condition : condition.toString();
        return this.next(this.clone({ whereSql: { ...this._state.whereSql, [key]: sql } }));
    }

    whereIf(condition: boolean, clause: string | ConditionTreeBuilder<any, any>, id?: string): any {
        return condition ? this.where(clause, id) : this.next(this._state);
    }

    join(joinSql: string, id?: string): any {
        const key = id ?? `join_${this._state.joins.length}`;
        // Idempotent by id: re-joining an existing id only replaces its SQL in
        // joinSql below, keeping the ordering array (and thus its FROM-chain
        // position) untouched. A brand-new id is appended at the tail.
        const existing = this._state.joins.some(j => j.id === key);
        const nextJoins = existing ? this._state.joins : [...this._state.joins, { id: key }];
        return this.next(this.clone({
            joinSql: { ...this._state.joinSql, [key]: joinSql },
            joins: nextJoins,
        }));
    }

    joinIf(condition: boolean, joinSql: string, id?: string): any {
        return condition ? this.join(joinSql, id) : this.next(this._state);
    }

    groupBy(columns: string | readonly string[], id?: string): any {
        const rawCols = Array.isArray(columns) ? [...columns] : [columns as string];
        const key = id ?? `group_${Object.keys(this._state.groupBySql).length}`;
        return this.next(this.clone({
            groupBySql: { ...this._state.groupBySql, [key]: rawCols.join(", ") },
        }));
    }

    groupByIf(condition: boolean, columns: string | readonly string[], id?: string): any {
        return condition ? this.groupBy(columns, id) : this.next(this._state);
    }

    having(condition: string | ConditionTreeBuilder<any, any>, id?: string): any {
        // An empty condition tree is a no-op (see where()): never emit
        // `HAVING ()`. String conditions are applied verbatim.
        if (condition instanceof ConditionTreeBuilder && condition.isEmpty()) {
            return this.next(this._state);
        }
        const key = id ?? `having_${Object.keys(this._state.havingSql).length}`;
        const sql = typeof condition === "string" ? condition : condition.toString();
        return this.next(this.clone({ havingSql: { ...this._state.havingSql, [key]: sql } }));
    }

    havingIf(condition: boolean, clause: string | ConditionTreeBuilder<any, any>, id?: string): any {
        return condition ? this.having(clause, id) : this.next(this._state);
    }

    orderBy(columns: string | readonly string[], id?: string): any {
        const rawCols = Array.isArray(columns) ? [...columns] : [columns as string];
        const key = id ?? `order_${Object.keys(this._state.orderBySql).length}`;
        return this.next(this.clone({
            orderBySql: { ...this._state.orderBySql, [key]: rawCols.join(", ") },
        }));
    }

    orderByIf(condition: boolean, columns: string | readonly string[], id?: string): any {
        return condition ? this.orderBy(columns, id) : this.next(this._state);
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
        const nextSelectSql = { ...this._state.selectSql };
        if (!(id in nextSelectSql)) {
            return this.next(this._state);
        }
        delete (nextSelectSql as any)[id];
        return this.next(this.clone({ selectSql: nextSelectSql }));
    }

    removeJoin(id: string): any {
        const nextJoinSql = { ...this._state.joinSql };
        const hadSql = id in nextJoinSql;
        delete (nextJoinSql as any)[id];
        const nextJoins = this._state.joins.filter(j => j.id !== id);
        if (!hadSql && nextJoins.length === this._state.joins.length) {
            return this.next(this._state);
        }
        return this.next(this.clone({ joinSql: nextJoinSql, joins: nextJoins }));
    }

    removeWhere(id: string): any {
        const nextWhereSql = { ...this._state.whereSql };
        if (!(id in nextWhereSql)) {
            return this.next(this._state);
        }
        delete (nextWhereSql as any)[id];
        return this.next(this.clone({ whereSql: nextWhereSql }));
    }

    removeGroupBy(id: string): any {
        const nextGroupBySql = { ...this._state.groupBySql };
        if (!(id in nextGroupBySql)) {
            return this.next(this._state);
        }
        delete (nextGroupBySql as any)[id];
        return this.next(this.clone({ groupBySql: nextGroupBySql }));
    }

    removeHaving(id: string): any {
        const nextHavingSql = { ...this._state.havingSql };
        if (!(id in nextHavingSql)) {
            return this.next(this._state);
        }
        delete (nextHavingSql as any)[id];
        return this.next(this.clone({ havingSql: nextHavingSql }));
    }

    removeOrderBy(id: string): any {
        const nextOrderBySql = { ...this._state.orderBySql };
        if (!(id in nextOrderBySql)) {
            return this.next(this._state);
        }
        delete (nextOrderBySql as any)[id];
        return this.next(this.clone({ orderBySql: nextOrderBySql }));
    }

    // has*: read-only checks against the keyed runtime state.
    hasSelect(id: string): boolean {
        return id in this._state.selectSql;
    }
    hasJoin(id: string): boolean {
        return id in this._state.joinSql;
    }
    hasWhere(id: string): boolean {
        return id in this._state.whereSql;
    }
    hasGroupBy(id: string): boolean {
        return id in this._state.groupBySql;
    }
    hasHaving(id: string): boolean {
        return id in this._state.havingSql;
    }
    hasOrderBy(id: string): boolean {
        return id in this._state.orderBySql;
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
        if (namedParams && Object.keys(namedParams).length > 0) {
            const sql = assembleSelectSQLPreSub(this._state);
            return collectParamValues(sql, namedParams);
        }
        return this._state.params;
    }

    toString(): string {
        return assembleSelectSQL(this._state);
    }

    toBrandedString(): any {
        return assembleSelectSQL(this._state);
    }
}

// Build the un-substituted fragment string for getParams ordering (matches OLD:
// getParams scans fragments joined by " " BEFORE $n substitution).
function assembleSelectSQLPreSub(state: RuntimeSelectState): string {
    return [
        ...Object.values(state.cteSql),
        ...Object.values(state.selectSql).flat(),
        state.fromSql ?? "",
        ...Object.values(state.joinSql),
        ...Object.values(state.whereSql),
        ...Object.values(state.groupBySql),
        ...Object.values(state.havingSql),
        ...Object.values(state.orderBySql),
        state.unionSql ?? "",
    ].join(" ");
}

export function createSelectQuery<Schema extends DatabaseSchema>(): SelectQueryBuilder<Schema, EmptySqlTag> {
    return new SelectQueryBuilderImpl<Schema, EmptySqlTag>(EMPTY_RUNTIME_STATE) as unknown as SelectQueryBuilder<Schema, EmptySqlTag>;
}
