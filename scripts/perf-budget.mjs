// Perf-regression guard for the type-level parser.
//
// Runs `tsc --noEmit --extendedDiagnostics` over the whole project (tests
// included) and compares the DETERMINISTIC compiler counters against the
// recorded baseline in scripts/perf-baseline.json:
//
//   gated (fail when exceeding baseline + headroom):
//     Instantiations, Types, Symbols
//   informational only (noisy across runs/machines — never gated):
//     Memory used, Check time
//
// Usage:
//   npm run perf             check against the baseline
//   npm run perf -- --update re-record the baseline (do this deliberately,
//                            after intentional growth: new tests, new corpus
//                            files, or new engine features)
//
// The counters are deterministic for a fixed file set, so any breach means a
// real change in type-level work — either intentional (re-record) or an
// accidental instantiation blowup (fix it; see CONTRIBUTING.md "TS recursion
// depth" for the chunked-driver pattern).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "scripts", "perf-baseline.json");
const update = process.argv.includes("--update");

const GATED = ["instantiations", "types", "symbols"];
const HEADROOM_PCT = 10;

function runTsc() {
    try {
        return execFileSync(
            process.execPath,
            [
                "--max-old-space-size=8192",
                join(root, "node_modules", "typescript", "bin", "tsc"),
                "--noEmit",
                "--extendedDiagnostics",
            ],
            { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
    } catch (err) {
        // tsc exits non-zero on type errors; perf numbers are meaningless then.
        process.stderr.write(String(err.stdout ?? ""));
        process.stderr.write(String(err.stderr ?? ""));
        console.error("\nperf-budget: tsc reported errors — fix the type errors first.");
        process.exit(1);
    }
}

function parseDiagnostics(out) {
    const pick = (label) => {
        const m = out.match(new RegExp(`^${label}:\\s+([\\d.]+)K?`, "m"));
        return m ? Number(m[1]) : null;
    };
    return {
        instantiations: pick("Instantiations"),
        types: pick("Types"),
        symbols: pick("Symbols"),
        memoryUsedK: pick("Memory used"),
        checkTimeS: pick("Check time"),
    };
}

const out = runTsc();
const current = parseDiagnostics(out);

for (const key of GATED) {
    if (current[key] === null) {
        console.error(`perf-budget: could not parse "${key}" from tsc output.`);
        process.exit(1);
    }
}

if (update || !existsSync(baselinePath)) {
    const tsVersion = JSON.parse(
        readFileSync(join(root, "node_modules", "typescript", "package.json"), "utf8"),
    ).version;
    const baseline = {
        recordedAt: new Date().toISOString().slice(0, 10),
        typescript: tsVersion,
        headroomPct: HEADROOM_PCT,
        instantiations: current.instantiations,
        types: current.types,
        symbols: current.symbols,
        // informational only — never gated
        memoryUsedK: current.memoryUsedK,
        checkTimeS: current.checkTimeS,
    };
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 4) + "\n");
    console.log(`perf-budget: baseline ${update ? "updated" : "recorded"} at scripts/perf-baseline.json`);
    console.log(JSON.stringify(baseline, null, 4));
    process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const headroom = baseline.headroomPct ?? HEADROOM_PCT;

const rows = [];
let breached = false;
for (const key of GATED) {
    const base = baseline[key];
    const cur = current[key];
    const limit = Math.floor(base * (1 + headroom / 100));
    const deltaPct = ((cur - base) / base) * 100;
    const ok = cur <= limit;
    if (!ok) breached = true;
    rows.push({ metric: key, baseline: base, current: cur, "delta %": deltaPct.toFixed(2), limit, status: ok ? "ok" : "BREACH" });
}
for (const [key, label] of [["memoryUsedK", "memory (K)"], ["checkTimeS", "check time (s)"]]) {
    if (current[key] === null || baseline[key] == null) continue;
    const deltaPct = ((current[key] - baseline[key]) / baseline[key]) * 100;
    rows.push({ metric: label, baseline: baseline[key], current: current[key], "delta %": deltaPct.toFixed(2), limit: "-", status: "info" });
}

console.table(rows);

if (breached) {
    console.error(
        `perf-budget: BREACH — a gated counter exceeds baseline +${headroom}%.\n` +
        "If this growth is intentional (new tests/features), re-record with:\n" +
        "    npm run perf -- --update\n" +
        "Otherwise, find the instantiation blowup before merging " +
        "(CONTRIBUTING.md → \"TS recursion depth\").",
    );
    process.exit(1);
}
console.log(`perf-budget: ok — all gated counters within baseline +${headroom}%.`);
