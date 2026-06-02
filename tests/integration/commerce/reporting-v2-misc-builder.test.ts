/**
 * Commerce reporting-v2 (misc controllers) — builder runtime mirrors.
 * Setup-only; failures => engine fix-list. Builder columns in these fixtures are
 * plain `string` (NOT branded) so plain strings in withParams are fine.
 *
 * Area: reporting-v2 misc controllers (everything not under lib/pse/order/team/my):
 *   - controller/invoices.ts            (admin invoices list)
 *   - controller/pses.ts                (top-level PSE search)
 *   - controller/partnerize/download-invoice.ts  (positional-$1 raw select)
 *   - controller/revolut/delete-payment.ts       (positional-$1 select + delete)
 */
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createDeleteQuery,
    createSql,
    normalizeWhitespace,
} from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/invoices.ts action()
// userId/status materialized so both whereIf branches are present.
// ---------------------------------------------------------------------------
const userId = "u1";
const status = "active";

const qInvoices = createSelectQuery<ReportingV2Schema>()
    .withParams({ userId, status })
    .from(`"Revolut_PaymentInvoice" i`)
    .join(`left join "Revolut_PaymentCreditNote" c on c."invoiceId" = i.id`)
    .select(`i.*`)
    .select(`c.id as "creditNoteId"`)
    .whereIf(!!userId, `i."userId" = :userId`)
    .whereIf(!!status, `i."status" = :status`)
    .orderBy(`i."createdAt" desc`)
    .limit(20)
    .offset(0);

describe("reporting-v2 misc controller/invoices chain", () => {
    it("assembles a star-expanded invoice list with a joined credit-note id", () => {
        const expected =
            `SELECT i.*, c.id as "creditNoteId" ` +
            `FROM "Revolut_PaymentInvoice" i ` +
            `left join "Revolut_PaymentCreditNote" c on c."invoiceId" = i.id ` +
            `WHERE i."userId" = $1 AND i."status" = $2 ` +
            `ORDER BY i."createdAt" desc LIMIT 20 OFFSET 0`;
        expect(normalizeWhitespace(qInvoices.toString())).toBe(normalizeWhitespace(expected));
    });

    it("orders params by first appearance", () => {
        expect([...qInvoices.getParams()]).toEqual(["u1", "active"]);
    });
});

type InvoicesRow = SelectBuilderResult<typeof qInvoices>;
type _InvoicesRow = RequireTrue<
    AssertExtends<InvoicesRow, { id: string; creditNoteId: string | null }>
>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pses.ts action()
// query materialized non-empty so the ilike whereIf branch is present.
// ---------------------------------------------------------------------------
const pseQuery = "%ann%";

const qPses = createSelectQuery<ReportingV2Schema>()
    .withParams({ query: pseQuery })
    .from(`"User"`)
    .select(`"id"`)
    .select(`"email"`)
    .select(`"givenName"`)
    .select(`"familyName"`)
    .where(`("groups" like '%GPS%' or "groups" like '%FRI%')`)
    .whereIf(
        !!pseQuery,
        `(
                "givenName" ilike :query
                or "familyName" ilike :query
                or "email" ilike :query
            )`,
    )
    .limit(20)
    .offset(0);

describe("reporting-v2 misc controller/pses chain", () => {
    it("assembles a PSE search with a single reused ilike param", () => {
        const out = normalizeWhitespace(qPses.toString());
        expect(out).toContain(`FROM "User"`);
        expect(out).toContain(`ilike $1`);
        expect(out).toContain(`LIMIT 20 OFFSET 0`);
    });

    it("orders params by first appearance", () => {
        expect([...qPses.getParams()]).toEqual(["%ann%"]);
    });
});

type PsesRow = SelectBuilderResult<typeof qPses>;
type _PsesRow = RequireTrue<
    AssertExtends<
        PsesRow,
        { id: string; email: string | null; givenName: string | null; familyName: string | null }
    >
>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/partnerize/download-invoice.ts handler()
// Source uses a positional `$1` raw select; the fluent select builder models
// named `:p` params, so this routes through the typed-raw createSql path.
// TODO(builder-api): positional-$1 raw select — fluent builder uses named :params.
// ---------------------------------------------------------------------------
const sql = createSql<ReportingV2Schema>();

describe("reporting-v2 misc controller/partnerize/download-invoice raw select", () => {
    it("passes the positional select through unchanged", () => {
        const invoiceId = "inv-1";
        const q = sql(`select * from "Network_Partnerize_Selfbill" where id = :invoiceId`)
            .withParams({ invoiceId });
        expect(normalizeWhitespace(q.toString())).toBe(
            `select * from "Network_Partnerize_Selfbill" where id = $1`,
        );
        expect([...q.getParams()]).toEqual(["inv-1"]);
    });
});

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/revolut/delete-payment.ts main()
// Two statements: a guard select-by-id, then a delete-by-id.
// ---------------------------------------------------------------------------
describe("reporting-v2 misc controller/revolut/delete-payment statements", () => {
    it("builds the guard select-by-id (typed-raw, positional source)", () => {
        // TODO(builder-api): positional-$1 raw select — fluent builder uses named :params.
        const id = "draft-1";
        const q = sql(`select * from "Revolut_PaymentDraft" where id = :id`)
            .withParams({ id });
        expect(normalizeWhitespace(q.toString())).toBe(
            `select * from "Revolut_PaymentDraft" where id = $1`,
        );
        expect([...q.getParams()]).toEqual(["draft-1"]);
    });

    it("builds the delete-by-id via the fluent delete builder", () => {
        const id = "draft-1";
        const q = createDeleteQuery<ReportingV2Schema>()
            .from(`"Revolut_PaymentDraft"`)
            .where(`id = :id`)
            .withParams({ id });
        expect(q.toString()).toBe(`delete from "Revolut_PaymentDraft" where id = $1`);
        expect([...q.getParams()]).toEqual(["draft-1"]);
    });
});

export type CommerceReportingV2MiscBuilderTestsPass = true;
