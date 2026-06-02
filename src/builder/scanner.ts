// src/builder/scanner.ts

/**
 * Value domain at the typed boundary (spec §6.5). Default `unknown` accepts
 * scalars, branded scalars, arrays, dates, and JSON/object columns. The driver
 * adapter is responsible for serialization.
 */
export type DriverParamValue = unknown;

/** One real `:name` occurrence found by the scanner. */
export interface PlaceholderOccurrence {
    /** Param name without leading ":" and without any `::cast` suffix. */
    readonly name: string;
    /** True iff this occurrence sits directly inside an `IN (...)` / `NOT IN (...)` group. */
    readonly inExpansion: boolean;
    /** Index of the ":" in the source SQL. */
    readonly start: number;
    /** Index just past the last char of the name. */
    readonly end: number;
}

const isIdentStart = (c: string) => /[a-zA-Z_]/.test(c);
const isIdentChar = (c: string) => /[a-zA-Z0-9_]/.test(c);

/**
 * Scan `sql` and return every real placeholder occurrence, skipping string
 * literals (single-quote + dollar-quote), `--` line comments, and block
 * comments, and treating `::type` casts as non-placeholders. Tracks, per paren
 * group, whether the group opened immediately after `in` / `not in`, so each
 * occurrence carries an accurate `inExpansion` flag (spec §6.3/§6.5).
 */
export function scanPlaceholders(sql: string): PlaceholderOccurrence[] {
    const out: PlaceholderOccurrence[] = [];
    // Stack of paren contexts: true = this "(" opened right after IN / NOT IN.
    const parenStack: boolean[] = [];
    let i = 0;
    const n = sql.length;

    // Returns true if the run of word chars ending just before `idx` (skipping
    // trailing whitespace) is `in`, optionally preceded by `not`.
    const opensInList = (idx: number): boolean => {
        let j = idx - 1;
        while (j >= 0 && /\s/.test(sql[j])) j--;
        let end = j + 1;
        while (j >= 0 && isIdentChar(sql[j])) j--;
        const w1 = sql.slice(j + 1, end).toLowerCase();
        return w1 === "in";
    };

    while (i < n) {
        const c = sql[i];

        // -- line comment
        if (c === "-" && sql[i + 1] === "-") {
            i += 2;
            while (i < n && sql[i] !== "\n") i++;
            continue;
        }
        // /* block comment */
        if (c === "/" && sql[i + 1] === "*") {
            i += 2;
            while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
            i += 2;
            continue;
        }
        // single-quoted string (with '' escape)
        if (c === "'") {
            i++;
            while (i < n) {
                if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
                if (sql[i] === "'") { i++; break; }
                i++;
            }
            continue;
        }
        // dollar-quoted string: $tag$ ... $tag$
        if (c === "$") {
            const m = /^\$([a-zA-Z_]\w*)?\$/.exec(sql.slice(i));
            if (m) {
                const tag = m[0];
                const close = sql.indexOf(tag, i + tag.length);
                i = close === -1 ? n : close + tag.length;
                continue;
            }
        }
        // parens — track IN-list context
        if (c === "(") {
            parenStack.push(opensInList(i));
            i++;
            continue;
        }
        if (c === ")") {
            parenStack.pop();
            i++;
            continue;
        }
        // cast `::` — skip both colons, never a placeholder
        if (c === ":" && sql[i + 1] === ":") {
            i += 2;
            continue;
        }
        // placeholder `:name`
        if (c === ":" && isIdentStart(sql[i + 1] ?? "")) {
            const start = i;
            i++;
            const from = i;
            while (i < n && isIdentChar(sql[i])) i++;
            const name = sql.slice(from, i);
            const inExpansion = parenStack.length > 0 && parenStack[parenStack.length - 1];
            out.push({ name, inExpansion, start, end: i });
            continue;
        }
        i++;
    }
    return out;
}
