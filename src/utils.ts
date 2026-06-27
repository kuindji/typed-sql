// Shared boolean and type utilities.

export type And<
    A extends boolean,
    B extends boolean,
    C extends boolean,
    D extends boolean,
    E extends boolean = true
> = A extends true
    ? (B extends true
        ? (C extends true
            ? (D extends true
                ? (E extends true ? true : false)
                : false)
            : false)
        : false)
    : false;

export type AllTrue<U> = Exclude<U, true> extends never ? true : false;

export type AnyTrue<U> = Extract<U, true> extends never ? false : true;

export type IsNever<T> = [T] extends [never] ? true : false;

// True when `T` is exactly `unknown` (or `any`). `unknown extends T` holds only
// for `unknown`/`any`, so this is a cheap top-type test. Used to detect a cast
// whose target type carries no useful information (e.g. `::json` -> `unknown`),
// so a modeled function's declared return can take precedence over it.
export type IsUnknown<T> = unknown extends T ? true : false;

// True when `T` is a union of two or more members. A single member (or `never`)
// is not a union. Used to test that a JOIN ... USING column exists on more than
// one of the query's tables (it must hold on both sides of the join).
export type IsUnion<T, U = T> =
    [T] extends [never]
        ? false
        : T extends any
            ? [U] extends [T]
                ? false
                : true
            : false;

export type StartsWith<S extends string, Prefix extends string> =
    string extends S ? false : S extends `${Prefix}${string}` ? true : false;

export type UnionToIntersection<U> =
    (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

// Merge a "later" column object into an "earlier" one, last write wins: a
// duplicate output alias keeps the later column's type instead of intersecting
// (which would collapse two differing same-named outputs to never). Either side
// may be `never` (an expression that projects nothing) — guard both.
//
// Used for JOIN/derived OVERLAYS, where a later contribution (e.g. an outer-join
// re-projection that adds `| null`) is meant to override an earlier same-named
// column — there, last-write-wins is correct. Lives here, not in a validation
// module, so overlay builders (`return-types`, `return-derived`, `cte-join`)
// can all reuse it without forming an import cycle.
export type MergeRow<Acc, Next> =
    [Next] extends [never] ? Acc
    : [Acc] extends [never] ? Next
    : Omit<Acc, keyof Next> & Next;
