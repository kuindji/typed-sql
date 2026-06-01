// tests/builder/acceptance/reporting-my-invoices.test.ts
// Real chain from reporting-v2/src/controller/my/invoices.ts (lines 60-86).
// Near-identical to team/invoices but filters i."userId" = :userId (instead of
// i."teamId" = :teamId). Exercises: :name params, applyIf(setPeriod), whereIf,
// limit/offset, and the row-type preservation through setPeriod.
import { describe, it, expect } from "bun:test";
import { createSelectQuery, normalizeWhitespace } from "../../../src/builder/index.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

const offset = 0;
const limit = 20; // DEFAULT_LIMIT in the source controller
const userId = "u1";
const period = "month" as const;
const start = "2026-01-01";
const end = "2026-01-31";

// --- Translated from reporting-v2/src/controller/my/invoices.ts:60-86 ---
const q = createSelectQuery<ReportingV2Schema>()
    .withParams({ userId, start: start!, end: end! })
    .from(`"Revolut_PaymentInvoice" i`)
    .select([
        `i.id`,
        `i.amount`,
        `i.vat`,
        `i.currency`,
        `i."createdAt"`,
    ])
    .where(`i."userId" = :userId`)
    .where(`i."status" = 'active'`)
    .orderBy(`i."createdAt" desc`)
    .limit(limit)
    .offset(offset)
    .applyIf(!!period, (b) => setPeriod(b, period!, `i."createdAt"`))
    .whereIf(!period && !!start, `i."createdAt" >= :start`)
    .whereIf(!period && !!end, `i."createdAt" <= :end`);
// -----------------------------------------------------------------------

describe("reporting my/invoices chain", () => {
    it("assembles to the production SQL", () => {
        const expected =
            `SELECT i.id, i.amount, i.vat, i.currency, i."createdAt" ` +
            `FROM "Revolut_PaymentInvoice" i ` +
            `WHERE i."userId" = $1 AND i."status" = 'active' ` +
            `AND i."createdAt" between '2026-01-01' and '2026-01-31' ` +
            `ORDER BY i."createdAt" desc LIMIT 20 OFFSET 0`;
        expect(normalizeWhitespace(q.toString())).toBe(normalizeWhitespace(expected));
    });

    it("orders params by first appearance", () => {
        // start/end only appear inside the (period-gated, skipped) whereIf clauses
        // and setPeriod emits its range as literals, so only :userId binds.
        expect([...q.getParams()]).toEqual(["u1"]);
    });
});

// Type-level: the inferred row carries the selected columns — preserved through
// applyIf(setPeriod) (the old library degraded this to `any`).
type Row = SelectBuilderResult<typeof q>;
type _Row = RequireTrue<
    AssertExtends<
        Row,
        { id: string; amount: number; vat: number; currency: string; createdAt: string }
    >
>;
