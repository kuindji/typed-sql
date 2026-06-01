// tests/builder/acceptance/reporting-payments-summary.test.ts
import { describe, it, expect } from "bun:test";
import { createSelectQuery, createSelectFn, normalizeWhitespace } from "../../../src/builder/index.js";
import type { ReportingSchema } from "../../fixtures/reporting-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";

const convertToCurrency = "EUR";
const userId = "u1";
const startDate = "2026-01-01";
const endDate = "2026-01-31";

const q = createSelectQuery<ReportingSchema>()
    .withParams({ userId, start: startDate || "", end: endDate || "" })
    .from(`"Revolut_PaymentDraft" p`)
    .select(`array_agg(p."id")::text[] as "paymentIds"`)
    .select(`sum(convert_currency(p."amount"::numeric, p."currency", '${convertToCurrency}'::text, p."createdAt"::date))::float8 as "total"`)
    .select(`sum(convert_currency(p."amount"::numeric, p."currency", '${convertToCurrency}'::text, p."createdAt"::date))::float8 as "amount"`)
    .select(`sum(convert_currency(p."vat"::numeric, p."currency", '${convertToCurrency}'::text, p."createdAt"::date))::float8 as "vat"`)
    .selectIf(!!convertToCurrency, `'${convertToCurrency}'::text as "currency"`)
    .selectIf(!convertToCurrency, "p.currency")
    .whereIf(!!startDate && !!endDate, `p."createdAt" between :start and :end`)
    .whereIf(!!startDate && !endDate, `p."createdAt" >= :start`)
    .whereIf(!startDate && !!endDate, `p."createdAt" <= :end`)
    .where(`p."userId" = :userId`)
    .where(`p."status" = 'COMPLETED'`);

describe("reporting my/payments-summary chain", () => {
    it("is accepted by createSelectFn and assembles to recorded SQL", async () => {
        const select = createSelectFn<ReportingSchema>((sql) => {
            expect(normalizeWhitespace(sql)).toContain(`FROM "Revolut_PaymentDraft" p`);
            return Promise.resolve([]);
        });
        // No cast: `select(q)` type-checking IS the acceptance assertion.
        await select(q);
        expect(q.getParams().length).toBeGreaterThan(0);
    });
});

// Type-level: paymentIds + numeric aggregates + currency present.
// `currency` comes from two mutually-exclusive selectIf calls → optional.
// total/amount/vat/paymentIds are unconditional → required.
type Row = SelectBuilderResult<typeof q>;
type _Required = RequireTrue<
    AssertExtends<Row, { paymentIds: string[]; total: number; amount: number; vat: number }>
>;
type _CurrencyOptional = RequireTrue<
    AssertExtends<{ currency?: string }, Pick<Row, "currency">>
>;
