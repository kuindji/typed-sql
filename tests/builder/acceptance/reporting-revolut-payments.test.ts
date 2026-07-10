// tests/builder/acceptance/reporting-revolut-payments.test.ts
// Translated from reporting-v2/src/lib/revolutPayments.ts:
//   fetchRevolutPayments + applyFilters.
// The OLD untyped `new Select()` chain becomes this repo's typed
// createSelectQuery. Positional .addValue() params become :name placeholders
// (toString renders $1,$2,...). Conditional filter branches become whereIf,
// and the period branch becomes applyIf(setPeriod).
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

// Representative runtime filters chosen so the conditional branches fire.
const status = "paid";
const pseId = "u1";
const teamId: string | undefined = undefined;
const orderId: string | undefined = undefined;
const approvedPaymentId: string | undefined = undefined;
const period = "month" as const;
const start: string | undefined = undefined;
const end: string | undefined = undefined;
const widenLimit = (n: number | false): number | false => n;
const limit = widenLimit(50);
const offset = 0;

// --- fetchRevolutPayments(applyFilters) from revolutPayments.ts:47-184 ---
const q = createSelectQuery<ReportingV2Schema>()
    .withParams({ status, pseId })
    .from(`"Revolut_PaymentDraft" rpd`)
    .select([
        `rpd.*`,
        `rpd."amount" + rpd."vat" as "total"`,
        `pse."givenName" || ' ' || pse."familyName" as "pseName"`,
        `rpi."id" as "invoiceId"`,
    ])
    .join(`left join "User" pse on pse.id = rpd."userId"`)
    .join(`left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id"`)
    .orderBy(`rpd."createdAt" desc`)
    // applyFilters: status (scalar), pseId (scalar)
    .whereIf(!!status, `rpd."status" = :status`)
    .whereIf(!!pseId, `rpd."userId" = :pseId`)
    .whereIf(!!teamId, `rpd."teamId" = :teamId`)
    // period branch -> setPeriod on rpd.createdAt
    .applyIf(!!period, (b) => setPeriod(b, period!, `rpd."createdAt"`, "YYYY-MM-DD"))
    .whereIf(!!start && !!end, `rpd."createdAt" between :start and :end`)
    // limit branch
    .applyIf(limit !== false, (b) => b.limit(limit === false ? 0 : limit).offset(offset));
// -----------------------------------------------------------------------

describe("reporting revolutPayments / fetchRevolutPayments", () => {
    it("assembles the draft list query with star + computed columns", () => {
        const expected =
            `SELECT rpd.*, rpd."amount" + rpd."vat" as "total", ` +
            `pse."givenName" || ' ' || pse."familyName" as "pseName", ` +
            `rpi."id" as "invoiceId" ` +
            `FROM "Revolut_PaymentDraft" rpd ` +
            `left join "User" pse on pse.id = rpd."userId" ` +
            `left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id" ` +
            `WHERE rpd."status" = $1 AND rpd."userId" = $2 ` +
            `AND rpd."createdAt" between '2026-01-01' and '2026-01-31' ` +
            `ORDER BY rpd."createdAt" desc LIMIT 50 OFFSET 0`;
        expect(normalizeWhitespace(q.toString())).toBe(normalizeWhitespace(expected));
    });

    it("orders params by first appearance (status, pseId)", () => {
        expect([...q.getParams()]).toEqual(["paid", "u1"]);
    });
});

// Type-level: rpd.* expands to the Revolut_PaymentDraft row; the joined
// computed columns are added. NOTE the engine conservatively types the
// uncast arithmetic `amount + vat` as `unknown` (not number) and the `||`
// concat over nullable operands as `string | null`, so total/pseName are
// asserted at those (correct) types — the win is the star + scalar columns.
type Row = SelectBuilderResult<typeof q>;
type _Row = RequireTrue<
    AssertExtends<
        Row,
        {
            id: string;
            userId: string | null;
            amount: number;
            currency: string;
            status: string;
            vat: number;
            teamId: string | null;
            total: unknown;
            pseName: string | null;
            invoiceId: string | null;
        }
    >
>;
