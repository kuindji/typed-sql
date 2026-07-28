// scripts/dist-smoke.mjs
//
// Post-build smoke test of the published artifact. Imports from ./dist exactly
// as a consumer would (through package.json "exports"/"main") and asserts the
// public runtime surface is intact, plus that the type-declaration entry exists
// and is non-empty. Catches build-output regressions — a broken exports map,
// a dropped export, or missing .d.ts — that the src-based test suite cannot.
//
// Run AFTER `npm run build` (see the "test:dist" / "prepublishOnly" scripts).
// Kept as a plain .mjs (not a *.test.ts) so the default `bun test` run, which
// does not build, never tries to import an unbuilt dist/.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const failures = [];
const fail = (msg) => failures.push(msg);

// 1. The package resolves and exposes the documented runtime exports.
const EXPECTED_FUNCTIONS = [
    "createSelectQuery",
    "createSelectFn",
    "createConditionTree",
    "ConditionTreeBuilder",
    "createConditionalQuery",
    "withConditions",
    "conditionalSQL",
    "processConditionalSQL",
    "processParams",
    "assembleSelectSQL",
    "createInsertQuery",
    "createUpdateQuery",
    "createDeleteQuery",
    "createSql",
    "createMutateFn",
    "scanPlaceholders",
    "expandScanned",
    "collectScanned",
    "assertAllProvided",
    "prepareScanned",
];

let api;
try {
    api = await import(resolve(root, "dist/index.js"));
}
catch (err) {
    console.error("FAIL: could not import dist/index.js — did you run `npm run build`?");
    console.error(err);
    process.exit(1);
}

for (const name of EXPECTED_FUNCTIONS) {
    if (typeof api[name] !== "function") {
        fail(`missing or non-function export: ${name} (got ${typeof api[name]})`);
    }
}

// Test comparators belong under src/builder/testing and must not leak into the
// published runtime surface.
if ("normalizeWhitespace" in api) {
    fail("test-only export leaked into dist: normalizeWhitespace");
}

// 2. A built query actually assembles — exercises the real dist code path,
//    including the param expander and the new distinct() method.
try {
    const q = api
        .createSelectQuery()
        .from("users u")
        .select("u.id")
        .where("u.id = :id")
        .distinct()
        .withParams({ id: 1 });
    const sql = q.toString();
    const expected = "SELECT DISTINCT u.id FROM users u WHERE u.id = $1";
    if (sql !== expected) fail(`assembled SQL mismatch: ${JSON.stringify(sql)} !== ${JSON.stringify(expected)}`);
    const params = [...q.getParams()];
    if (params.length !== 1 || params[0] !== 1) fail(`getParams() mismatch: ${JSON.stringify(params)}`);
}
catch (err) {
    fail(`building a query from dist threw: ${err?.message ?? err}`);
}

// 3. A LARGE IN-list flattens without blowing the call stack.
//
//    Lives here, not in the bun suite, because it is engine-specific: the old
//    `result.push(...arrayOfN)` spread passes every argument on the stack, which
//    V8 refuses somewhere above ~100k elements ("RangeError: Maximum call stack
//    size exceeded") while JavaScriptCore/Bun happily accepts millions. A bun
//    test therefore cannot catch this regression at all — only a Node run can,
//    and Node is what consumers deploy on (this bug surfaced in an AWS Lambda).
//    The README points users at a large `in (:ids)` as the pattern that scales,
//    so it has to actually survive one.
for (const n of [200_000, 500_000]) {
    try {
        const ids = Array.from({ length: n }, (_, i) => i);
        const values = api.collectScanned("select id from t where id in (:ids)", { ids });
        if (values.length !== n) {
            fail(`collectScanned flattened ${values.length} of ${n} IN-list values`);
        }
        else if (values[0] !== 0 || values[n - 1] !== n - 1) {
            fail(`collectScanned reordered a ${n}-element IN list`);
        }
    }
    catch (err) {
        fail(`collectScanned threw on a ${n}-element IN list: ${err?.message ?? err}`);
    }
}

// 4. The type-declaration entry point exists and is non-empty (consumers rely
//    on package.json "types").
const dts = resolve(root, "dist/index.d.ts");
if (!existsSync(dts)) {
    fail("dist/index.d.ts is missing");
}
else if (readFileSync(dts, "utf8").trim().length === 0) {
    fail("dist/index.d.ts is empty");
}

if (failures.length > 0) {
    console.error(`dist smoke test FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}

console.log(`dist smoke test passed: ${EXPECTED_FUNCTIONS.length} exports + assembly + .d.ts OK`);
