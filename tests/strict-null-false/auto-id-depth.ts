// SNC-false SMOKE GUARD for auto-id resolution.
//
// Type-checked by `tsconfig.strict-null-false.json` (the `typecheck:snc` pass,
// also run by `npm test`). The main typecheck + perf budget run under
// `strict: true`, so a regression that only inflates depth under
// `strictNullChecks: false` is invisible to them — exactly how the auto-id
// MkTuple/HasId regression shipped. Consumers (e.g. Next.js apps) routinely
// compile with `strictNullChecks: false`, so that code path must stay shallow,
// and the lib's corpus must exercise it.
//
// SCOPE — read before trusting this as a full guard. These chains use AUTO ids
// only (no explicit id args), the `AutoId`/`ResolveId` path. They catch a SEVERE
// auto-id depth regression. They do NOT, on their own, reproduce the original
// regression's exact failure: that one only crossed TS's depth cap once the
// lib's per-clause auto-id cost was stacked on a CONSUMER's own type wrapper
// (e.g. a `db.select()`/`SelectResult` layer) plus a large generated schema.
// Empirically, a lib-only chain that's long enough to make the REGRESSED code
// trip is also long enough to trip the FIXED code — there is no lib-only window
// that separates them. The decisive guard therefore lives in the CONSUMER's
// app type-check (which compiles real query files under SNC-false); this pass is
// the lib-side early-warning smoke test. Keep the chains comfortably below the
// fixed-code depth ceiling so normal TS-version drift can't cause false fails.
import { createSelectQuery } from "../../src/builder/select.js";
import type { BuilderReturnType } from "../../src/builder/return-type.js";
import type { NetsecSchema as S } from "../fixtures/netsec-schema.js";

declare const dyn: boolean;

// Long single-clause-heavy auto-id chain (many `.where()`/`.select()` with no
// id → each resolves `where_N`/`select_N` via AutoId over a growing list).
const wide = createSelectQuery<S>()
    .from("api_key self")
    .select("self.id")
    .select("self.key")
    .select("self.company_id")
    .select("self.user_id")
    .select("self.description")
    .select("self.enabled")
    .where("self.enabled = :enabled")
    .where("self.company_id = :companyId")
    .whereIf(dyn, "self.user_id = :userId")
    .whereIf(dyn, "self.description is not null")
    .where("self.key = :key")
    .orderBy("self.created_at desc")
    .orderBy("self.id")
    .limit(10)
    .offset(0)
    .withParams({ enabled: true, companyId: "c", userId: "u", key: "k" });

type _Wide = BuilderReturnType<typeof wide>;
const _w: _Wide = null as any;
void _w;

// Auto-id chain interleaved with joins/group/having — mirrors aggregate report
// queries (topCountry/topEntity) that first surfaced the regression.
const agg = createSelectQuery<S>()
    .select("self.company_id")
    .select("count(self.id) as cnt")
    .from("api_key self")
    .join("join company c on c.id = self.company_id")
    .joinIf(dyn, "left join api_key_usage_plan p on p.id = self.usage_plan_id")
    .where("self.enabled = :enabled")
    .whereIf(dyn, "self.company_id = :companyId")
    .groupBy("self.company_id")
    .having("count(self.id) > :min")
    .orderBy("cnt desc")
    .limit(25)
    .withParams({ enabled: true, companyId: "c", min: 1 });

type _Agg = BuilderReturnType<typeof agg>;
const _a: _Agg = null as any;
void _a;

// Auto-ids after a removal still skip surviving ids (no collision) under
// SNC-false — locks the bf55b03 skip behavior on the cheap union path.
const removed = createSelectQuery<S>()
    .from("api_key self")
    .where("self.enabled = :enabled")
    .where("self.company_id = :companyId")
    .removeWhere("where_0")
    .where("self.user_id = :userId")
    .withParams({ enabled: true, companyId: "c", userId: "u" });

type _Removed = BuilderReturnType<typeof removed>;
const _r: _Removed = null as any;
void _r;
