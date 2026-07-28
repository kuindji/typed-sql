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

    // `IN (` followed by `select` / `with` / `values` / `table` opens a SUBQUERY
    // or table constructor, not a value list. Its placeholders are ordinary
    // scalar params: `id in (select user_id from o where tags = :tags)` binds
    // `:tags` once. Treating them as list members fanned an array value out into
    // `= $1, $2` (malformed SQL), and made an empty array look like the invalid
    // `in ()` case and get rejected — a false reject of a legal query.
    const opensSubquery = (idx: number): boolean => {
        let j = idx + 1;
        while (j < n && /\s/.test(sql[j])) j++;
        let end = j;
        while (end < n && isIdentChar(sql[end])) end++;
        const w = sql.slice(j, end).toLowerCase();
        return w === "select" || w === "with" || w === "values" || w === "table";
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
            let depth = 1;
            // PostgreSQL block comments nest. Keep scanning until the matching
            // outer close so placeholder-looking text after an inner `*/`
            // remains inside the comment.
            while (i < n && depth > 0) {
                if (sql[i] === "/" && sql[i + 1] === "*") {
                    depth++;
                    i += 2;
                }
                else if (sql[i] === "*" && sql[i + 1] === "/") {
                    depth--;
                    i += 2;
                }
                else {
                    i++;
                }
            }
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
        // PostgreSQL escape string E'...' — backslash escapes are active, so a
        // `\'` (and the usual `''`) escapes a quote rather than closing the
        // literal. A bare `'` scan would mis-read `\'` as the terminator and leak
        // any `:name` that follows back into the placeholder stream. The `E` must
        // be a standalone string prefix, not the tail of an identifier.
        if ((c === "E" || c === "e") && sql[i + 1] === "'" &&
            !(i > 0 && isIdentChar(sql[i - 1]))) {
            i += 2; // skip the `E` and the opening quote
            while (i < n) {
                if (sql[i] === "\\") { i += 2; continue; } // backslash escapes next char
                if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
                if (sql[i] === "'") { i++; break; }
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
            parenStack.push(opensInList(i) && !opensSubquery(i));
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
    // Membership goes through a Set, never `order.includes()`. The array is kept
    // only for appearance ORDER. With P distinct names an array-as-set makes this
    // O(P^2) — 16,804 synthetic `__tsqlrow_` names (a 4201-row .rows() insert)
    // cost ~700ms of pure CPU here, and the shared name prefix denies the string
    // compare any early exit. Do not "simplify" the Set away.
    const seen = new Set<string>();
    const expand = new Map<string, boolean>();
    const seenNonExpand = new Map<string, boolean>();
    for (const o of occ) {
        if (!seen.has(o.name)) {
            seen.add(o.name);
            order.push(o.name);
        }
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
 * The supplied unique names, in appearance order.
 *
 * An IN-list placeholder bound to an EMPTY array is rejected here: it would
 * expand to zero slots and emit `id in ()`, which PostgreSQL rejects as a syntax
 * error — a failure that otherwise only surfaces at the driver, with no hint of
 * which parameter caused it. There is no safe silent rewrite (`in (null)` is
 * NULL rather than false, and it inverts `not in`), so the caller has to decide:
 * skip the clause (`whereIf`) or bind a non-empty list. An empty array OUTSIDE
 * an IN list is untouched — `= any(:ids)` with `[]` is one well-formed array
 * parameter and stays legal.
 */
function suppliedNames(
    occ: readonly PlaceholderOccurrence[],
    params: Record<string, DriverParamValue>,
): { name: string; inExpansion: boolean }[] {
    const names = uniqueNames(occ).filter(u => Object.hasOwn(params, u.name));
    for (const u of names) {
        const v = params[u.name];
        if (u.inExpansion && Array.isArray(v) && v.length === 0) {
            throw new Error(
                `Query parameter ":${u.name}" is an empty array inside an IN (...) list, `
                + `which would emit the invalid SQL "in ()". Skip the clause when the `
                + `list is empty (e.g. whereIf), or bind a non-empty array.`,
            );
        }
    }
    return names;
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
    const names = suppliedNames(occ, params);
    // Assign starting positions in appearance order.
    const startPos = new Map<string, number>();
    let pos = 1;
    for (const u of names) {
        startPos.set(u.name, pos);
        const v = params[u.name];
        pos += u.inExpansion && Array.isArray(v) ? v.length : 1;
    }
    // Build the result FORWARD into a parts array, then join once. Occurrences
    // arrive in ascending `start` order, so a single pass suffices. Splicing into
    // a growing string instead (`out.slice(0, start) + repl + out.slice(end)`) is
    // O(P x L): each rewrite recopies the whole statement, and the second slice
    // forces the rope to flatten. That was ~2.2 billion char copies on a
    // 131k-char, 16,804-placeholder insert. The old right-to-left iteration
    // existed ONLY to keep indices valid under in-place splicing; a parts array
    // removes the need for it.
    const parts: string[] = [];
    let last = 0;
    for (const o of occ) {
        // Not supplied → leave the literal `:name` in place (caught by
        // assertAllProvided when live). Leaving `last` untouched keeps the
        // original text: it is copied by the next slice.
        if (!Object.hasOwn(params, o.name)) continue;
        const p = startPos.get(o.name)!;
        const v = params[o.name];
        const replacement = o.inExpansion && Array.isArray(v)
            ? v.map((_, idx) => `$${p + idx}`).join(", ")
            : `$${p}`;
        parts.push(sql.slice(last, o.start), replacement);
        last = o.end;
    }
    parts.push(sql.slice(last));
    return parts.join("");
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
    const names = suppliedNames(occ, params);
    const result: DriverParamValue[] = [];
    for (const u of names) {
        const v = params[u.name];
        if (v === undefined) {
            throw new Error(
                `Query parameter ":${u.name}" is used but its value is undefined`,
            );
        }
        // Append element-by-element, NOT `result.push(...v)`. A spread passes
        // every element as a separate argument, and V8 blows the call stack
        // somewhere above ~100k of them ("Maximum call stack size exceeded") —
        // JavaScriptCore/Bun does not, so this only ever failed on Node, which
        // is what consumers deploy on. A large `in (:ids)` is the documented
        // way to bind a big list, so it has to survive an arbitrarily long one.
        if (u.inExpansion && Array.isArray(v)) for (const item of v) result.push(item);
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
        if (!Object.hasOwn(params, o.name)) {
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
