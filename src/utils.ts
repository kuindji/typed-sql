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

export type StartsWith<S extends string, Prefix extends string> =
    string extends S ? false : S extends `${Prefix}${string}` ? true : false;

export type UnionToIntersection<U> =
    (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

export type Simplify<T> = { [K in keyof T]: T[K] } & {};
