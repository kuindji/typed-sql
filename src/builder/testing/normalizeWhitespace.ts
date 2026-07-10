// Test-only SQL text comparator. This intentionally is not SQL-aware and must
// never be used to transform executable SQL: it collapses whitespace inside
// literals, comments, and dollar-quoted bodies as well as structural SQL.
// `src/builder/testing` is excluded from the package build and npm tarball.
export function normalizeWhitespace(sql: string): string {
    return sql
        .replace(/\s+/g, " ")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s*\(\s*/g, "(")
        .replace(/\s*\)\s*/g, ")")
        .trim();
}
