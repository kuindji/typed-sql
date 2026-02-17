/**
 * Type Test Helpers
 *
 * Utility types for compile-time assertions. If the file compiles, tests pass.
 * If any assertion fails, TypeScript will produce a compile error.
 */

// ============================================================================
// Equality Assertions
// ============================================================================

/**
 * Assert two types are exactly equal
 */
export type AssertEqual<T, U> = [T] extends [U]
    ? [U] extends [T]
        ? true
        : false
    : false

/**
 * Assert two types are NOT equal
 */
export type AssertNotEqual<T, U> = [T] extends [U]
    ? [U] extends [T]
        ? false
        : true
    : true

// ============================================================================
// Extension Assertions
// ============================================================================

/**
 * Assert T extends U
 */
export type AssertExtends<T, U> = T extends U ? true : false

/**
 * Assert T does NOT extend U
 */
export type AssertNotExtends<T, U> = T extends U ? false : true

// ============================================================================
// Error Assertions
// ============================================================================

/**
 * Assert type is a ParseError
 */
export type AssertIsParseError<T> = T extends { error: true; message: string }
    ? true
    : false

/**
 * Assert type is NOT a ParseError
 */
export type AssertNotParseError<T> = T extends { error: true; message: string }
    ? false
    : true

/**
 * Assert type is a MatchError
 */
export type AssertIsMatchError<T> = T extends { __error: true; message: string }
    ? true
    : false

/**
 * Assert type is NOT a MatchError
 */
export type AssertNotMatchError<T> = T extends {
    __error: true
    message: string
}
    ? false
    : true

// ============================================================================
// Compile Enforcement
// ============================================================================

/**
 * This type will cause a compile error if T is not true
 * Usage: type _Test = RequireTrue<AssertEqual<A, B>>
 */
export type RequireTrue<T extends true> = T

/**
 * This type will cause a compile error if T is not false
 * Usage: type _Test = RequireFalse<AssertNotEqual<A, A>>
 */
export type RequireFalse<T extends false> = T

// ============================================================================
// Type Inspection Helpers
// ============================================================================

/**
 * Extract keys from an object type
 */
export type KeysOf<T> = keyof T

/**
 * Check if a type is `never`
 */
export type IsNever<T> = [T] extends [never] ? true : false

/**
 * Check if a type is `unknown`
 */
export type IsUnknown<T> = unknown extends T
    ? [T] extends [null]
        ? false
        : true
    : false

/**
 * Check if a type is `any`
 */
export type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Check if a type has a specific property
 */
export type HasProperty<T, K extends string> = K extends keyof T ? true : false

// ============================================================================
// Array Assertions
// ============================================================================

/**
 * Assert array has specific length
 */
export type AssertArrayLength<T extends unknown[], N extends number> =
    T["length"] extends N ? true : false

/**
 * Assert array is not empty
 */
export type AssertArrayNotEmpty<T extends unknown[]> = T extends []
    ? false
    : true

// ============================================================================
// String Assertions
// ============================================================================

/**
 * Assert string starts with prefix
 */
export type AssertStartsWith<T extends string, Prefix extends string> =
    T extends `${Prefix}${string}` ? true : false

/**
 * Assert string ends with suffix
 */
export type AssertEndsWith<T extends string, Suffix extends string> =
    T extends `${string}${Suffix}` ? true : false

/**
 * Assert string is empty
 */
export type AssertEmptyString<T extends string> = T extends "" ? true : false

// ============================================================================
// Object Type Assertions
// ============================================================================

/**
 * Assert object has exact keys (no more, no less)
 */
export type AssertExactKeys<T, Keys extends string> = [keyof T] extends [Keys]
    ? [Keys] extends [keyof T]
        ? true
        : false
    : false

/**
 * Assert property type
 */
export type AssertPropertyType<T, K extends keyof T, V> =
    T[K] extends V ? (V extends T[K] ? true : false) : false

