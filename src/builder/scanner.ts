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
        // double-quoted identifier (with "" escape) — a `:name`-looking run
        // inside a quoted identifier (`"tenant:region"`) is part of the name,
        // not a placeholder.
        if (c === '"') {
            i++;
            while (i < n) {
                if (sql[i] === '"' && sql[i + 1] === '"') { i += 2; continue; }
                if (sql[i] === '"') { i++; break; }
                i++;
            }
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

/** Ordered unique names (first appearance) with their merged expansion flag. */
function uniqueNames(
    occ: readonly PlaceholderOccurrence[],
): { name: string; inExpansion: boolean }[] {
    const order: string[] = [];
    const expand = new Map<string, boolean>();
    const seenNonExpand = new Map<string, boolean>();
    for (const o of occ) {
        if (!order.includes(o.name)) order.push(o.name);
        if (o.inExpansion) expand.set(o.name, true);
        else seenNonExpand.set(o.name, true);
    }
    // Mixed IN / non-IN reuse is unsound (spec §6.5) — one value cannot be both
    // N positional slots and one slot.
    for (const name of order) {
        if (expand.get(name) && seenNonExpand.get(name)) {
            throw new Error(
                `Query parameter ":${name}" is used in mixed IN and non-IN positions; ` +
                `a name cannot be both an expanded IN list and a scalar.`,
            );
        }
    }
    return order.map(name => ({ name, inExpansion: expand.get(name) ?? false }));
}

/**
 * Replace `:name` with `$n` (first-appearance order; repeats reuse the same
 * `$n`). Only IN-list occurrences with an array value expand to multiple slots;
 * every other value (including array-VALUED columns and JSON objects) is a
 * single slot. Driven entirely by the shared scanner (spec §6.5).
 */
export function expandScanned(
    sql: string,
    params: Record<string, DriverParamValue>,
): string {
    const occ = scanPlaceholders(sql);
    const names = uniqueNames(occ).filter(u => u.name in params);
    // Assign starting positions in appearance order.
    const startPos = new Map<string, number>();
    let pos = 1;
    for (const u of names) {
        startPos.set(u.name, pos);
        const v = params[u.name];
        pos += u.inExpansion && Array.isArray(v) ? v.length : 1;
    }
    // Rewrite right-to-left so indices stay valid; skip occurrences whose name
    // isn't supplied (left as a literal — caught by assertAllProvided when live).
    let out = sql;
    for (let k = occ.length - 1; k >= 0; k--) {
        const o = occ[k];
        if (!(o.name in params)) continue;
        const p = startPos.get(o.name)!;
        const v = params[o.name];
        const replacement = o.inExpansion && Array.isArray(v)
            ? v.map((_, idx) => `$${p + idx}`).join(", ")
            : `$${p}`;
        out = out.slice(0, o.start) + replacement + out.slice(o.end);
    }
    return out;
}

/**
 * Flattened param values in placeholder order. IN-list arrays are spread; all
 * other values pass through as one entry. Throws if a used value is undefined.
 */
export function collectScanned(
    sql: string,
    params: Record<string, DriverParamValue>,
): DriverParamValue[] {
    const occ = scanPlaceholders(sql);
    const names = uniqueNames(occ).filter(u => u.name in params);
    const result: DriverParamValue[] = [];
    for (const u of names) {
        const v = params[u.name];
        if (v === undefined) {
            throw new Error(
                `Query parameter ":${u.name}" is used but its value is undefined`,
            );
        }
        if (u.inExpansion && Array.isArray(v)) result.push(...v);
        else result.push(v);
    }
    return result;
}

/**
 * Live-placeholder check (spec §6.3): throw for any real placeholder in the
 * assembled SQL whose name is absent from `params`. Conditional fragments that
 * were excluded contribute no placeholder, so they never trip this.
 */
export function assertAllProvided(
    sql: string,
    params: Record<string, DriverParamValue>,
): void {
    for (const o of scanPlaceholders(sql)) {
        if (!(o.name in params)) {
            throw new Error(`Missing value for query parameter ":${o.name}"`);
        }
    }
}

/** One-shot: live-check then return `{ sql: expanded, values }`. */
export function prepareScanned(
    sql: string,
    params: Record<string, DriverParamValue>,
): { sql: string; values: DriverParamValue[] } {
    assertAllProvided(sql, params);
    return { sql: expandScanned(sql, params), values: collectScanned(sql, params) };
}
