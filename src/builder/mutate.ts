// src/builder/mutate.ts
import type { DatabaseSchema } from "../schema.js";
import type { ExtractParams, ExtractReturning } from "./extract-params.js";
import { prepareScanned, type DriverParamValue } from "./scanner.js";

/** Driver contract: returns the RETURNING rows, or [] for a no-RETURNING mutation. */
export type MutationHandler = (
    sql: string,
    params: DriverParamValue[],
) => Promise<unknown[]>;

/** Row type a bound builder / createSql object yields. */
export type MutationReturnType<B> =
    B extends { readonly __returning?: infer R } ? R : {};

/**
 * Minimal structural shape both `BoundWrite` (builders) and `BoundSql`
 * (`createSql`) satisfy. Used as the object-overload constraint instead of the
 * deep `BoundWrite<S, any> | BoundSql<any, S>` union — matching a value against
 * that union forces TS to compare the phantom `__returning` types of both arms,
 * which recurses without bound. A shallow structural constraint avoids that; the
 * row type is still derived from the value's own `__returning` via
 * `MutationReturnType<B>`.
 */
interface Executable {
    toString(): string;
    getParams(): ReadonlyArray<DriverParamValue>;
}

export function createMutateFn<S extends DatabaseSchema>(handler: MutationHandler) {
    // Builder / createSql object overload.
    function mutate<B extends Executable>(
        query: B,
    ): Promise<MutationReturnType<B>[]>;
    // Raw string + named params overload (brand-checked).
    function mutate<Q extends string>(
        query: Q,
        params: ExtractParams<Q, S>,
    ): Promise<ExtractReturning<Q, S>[]>;

    // async so a prep-time / assembly throw (missing live placeholder, empty
    // INSERT/SET, etc.) surfaces as a rejected promise rather than a synchronous
    // throw — consistent with the promise-returning executor contract.
    async function mutate(query: Executable | string, params?: Record<string, DriverParamValue>) {
        if (typeof query === "string") {
            const { sql, values } = prepareScanned(query, params ?? {});
            return handler(sql, values) as Promise<any>;
        }
        const sql = query.toString();                 // already expanded + live-checked
        const values = [...query.getParams()];
        return handler(sql, values) as Promise<any>;
    }

    return mutate;
}
