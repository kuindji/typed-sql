// tests/builder/acceptance/reporting-invoices.test.ts
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingSchema } from "../../fixtures/reporting-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

const limit = 50;
const offset = 0;
const period = "month" as const;
const start = "2026-01-01";
const end = "2026-01-31";

// --- Copied verbatim from reporting-v2/src/controller/team/invoices.ts ---
const b = createSelectQuery<ReportingSchema>()
    .withParams({ teamId: "t1", start, end })
    .from(`"Revolut_PaymentInvoice" i`)
    .select([
        `i.id`,
        `i.amount`,
        `i.vat`,
        `i.currency`,
        `i."createdAt"`,
    ])
    .where(`i."status" = 'active'`)
    .where(`i."teamId" = :teamId`)
    .orderBy(`i."createdAt" desc`)
    .limit(limit)
    .offset(offset)
    .applyIf(!!period, (b) => setPeriod(b, period!, `i."createdAt"`, "YYYY-MM-DD"))
    .whereIf(!period && !!start, `i."createdAt" >= :start`)
    .whereIf(!period && !!end, `i."createdAt" <= :end`);
// -------------------------------------------------------------------------

describe("reporting team/invoices chain", () => {
    it("assembles to the recorded production SQL", () => {
        const expected =
            `SELECT i.id, i.amount, i.vat, i.currency, i."createdAt" ` +
            `FROM "Revolut_PaymentInvoice" i ` +
            `WHERE i."status" = 'active' AND i."teamId" = $1 ` +
            `AND i."createdAt" between '2026-01-01' and '2026-01-31' ` +
            `ORDER BY i."createdAt" desc LIMIT 50 OFFSET 0`;
        expect(normalizeWhitespace(b.toString())).toBe(normalizeWhitespace(expected));
    });

    it("orders params by first appearance", () => {
        expect([...b.getParams()]).toEqual(["t1"]); // start/end only used inside setPeriod's literal range here
    });
});

// Type-level: the inferred row carries the selected columns (the win — the old
// library degraded this to `any` once setPeriod was applied).
type Row = SelectBuilderResult<typeof b>;
type _Row = RequireTrue<
    AssertExtends<
        Row,
        { id: string; amount: number; vat: number; currency: string; createdAt: string }
    >
>;
