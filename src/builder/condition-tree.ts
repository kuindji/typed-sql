// src/builder/condition-tree.ts

export type ConditionTreePart = string | ConditionTreeState;

export interface ConditionTreeState {
    readonly operator: "and" | "or";
    readonly parts: ReadonlyArray<{
        readonly id: string;
        readonly condition: string | ConditionTreeState;
    }>;
}

type UppercaseOperator<Op extends "and" | "or"> = Op extends "and" ? "AND" : "OR";

type AppendCondition<
    Current extends string,
    Part extends string,
    Op extends "and" | "or",
> = string extends Current | Part ? string
    // An empty child tree renders "()" and is skipped at runtime (add() returns
    // `this`), so it must NOT change the literal — leave Current untouched.
    : Part extends "()" ? Current
    : Current extends "()" ? `(${Part})`
    : Current extends `(${infer Body})`
        ? `(${Body} ${UppercaseOperator<Op>} ${Part})`
    : string;

export class ConditionTreeBuilder<
    Op extends "and" | "or" = "and" | "or",
    Expr extends string = string,
> {
    private readonly state: ConditionTreeState;

    private constructor(state: ConditionTreeState) {
        this.state = state;
    }

    static create<Op extends "and" | "or">(
        operator: Op,
    ): ConditionTreeBuilder<Op, "()"> {
        return new ConditionTreeBuilder<Op, "()">({ operator, parts: [] });
    }

    getState(): ConditionTreeState {
        return this.state;
    }

    // True when this tree contributes no SQL: it holds no parts (so toString()
    // would render the bare "()"). Consumers and the SELECT builder use this to
    // skip empty trees entirely — legacy parity, where an empty condition tree
    // (e.g. an empty status[] filter built as an empty OR-tree) was a no-op
    // rather than an invalid `WHERE ()`.
    isEmpty(): boolean {
        return this.state.parts.length === 0;
    }

    add<Part extends string | ConditionTreeBuilder<any, any>, Id extends string | undefined = undefined>(
        part: Part,
        id?: Id,
    ): ConditionTreeBuilder<
        Op,
        // An explicit `id` may target an existing part (runtime REPLACES it),
        // which AppendCondition cannot model — so widen the rendered literal to
        // `string`. The auto-id path (no id) is always a fresh append → precise.
        Id extends string
            ? string
            : AppendCondition<
                Expr,
                Part extends ConditionTreeBuilder<any, infer P extends string> ? P
                    : Part extends string ? Part
                    : string,
                Op
            >
    > {
        // Skip an empty child tree: adding it would otherwise render a bare
        // "()" inside this expression (e.g. "(a = 1 AND ())"), an invalid
        // fragment. Legacy Query.ts trees skipped empty children too. Returning
        // `this` keeps the builder unchanged (no part, no id slot consumed).
        if (part instanceof ConditionTreeBuilder && part.isEmpty()) {
            return this as ConditionTreeBuilder<any, any>;
        }
        const partId = id ?? ConditionTreeBuilder.generateId();
        const condition: string | ConditionTreeState =
            part instanceof ConditionTreeBuilder ? part.getState() : (part as string);
        const existingIndex = this.state.parts.findIndex(p => p.id === partId);
        const nextParts = existingIndex === -1
            ? [...this.state.parts, { id: partId, condition }]
            : this.state.parts.map((p, idx) =>
                idx === existingIndex ? { id: partId, condition } : p);
        return new ConditionTreeBuilder({
            operator: this.state.operator,
            parts: nextParts,
        }) as any;
    }

    // remove() drops a part; the rendered literal can no longer be reconstructed
    // from `Expr` alone (the type doesn't track parts as a tuple), so widen to
    // `string`. A `string`-typed tree fragment is accepted-but-untyped by
    // ValidQueryBuilder's allow-unknown path (spec Open Questions) — no
    // rejection, only reduced BuilderSQL precision for that one query.
    remove(id: string): ConditionTreeBuilder<Op, string> {
        const nextParts = this.state.parts.filter(p => p.id !== id);
        if (nextParts.length === this.state.parts.length) {
            return this as ConditionTreeBuilder<Op, string>;
        }
        return new ConditionTreeBuilder({
            operator: this.state.operator,
            parts: nextParts,
        }) as ConditionTreeBuilder<Op, string>;
    }

    when<Next extends ConditionTreeBuilder<any, any>>(
        condition: boolean,
        ifTrue: (b: ConditionTreeBuilder<Op, Expr>) => Next,
        ifFalse?: (b: ConditionTreeBuilder<Op, Expr>) => Next,
    ): ConditionTreeBuilder<Op, Expr> | Next {
        if (condition) {
            return ifTrue(this);
        }
        return ifFalse ? ifFalse(this) : this;
    }

    toString(): Expr {
        if (this.state.parts.length === 0) {
            return "()" as Expr;
        }
        const op = this.state.operator.toUpperCase();
        const rendered = this.state.parts
            .map(part => ConditionTreeBuilder.renderPart(part.condition))
            .filter(s => s.length > 0)
            .join(` ${op} `);
        return `(${rendered})` as Expr;
    }

    private static renderPart(condition: string | ConditionTreeState): string {
        if (ConditionTreeBuilder.isConditionTreeState(condition)) {
            return new ConditionTreeBuilder(condition).toString();
        }
        return String(condition ?? "").trim();
    }

    private static isConditionTreeState(
        value: string | ConditionTreeState,
    ): value is ConditionTreeState {
        return (
            typeof value === "object"
            && value !== null
            && (value as any).operator !== undefined
            && Array.isArray((value as any).parts)
        );
    }

    private static generateId(): string {
        return `cond_${Math.random().toString(36).slice(2, 10)}`;
    }
}

export function createConditionTree<Op extends "and" | "or">(
    operator: Op,
): ConditionTreeBuilder<Op, "()"> {
    return ConditionTreeBuilder.create(operator);
}
