/**
 * reporting-v2 builder mirrors — static mirrors of the createSelectQuery chains
 * in /Users/kuindji/Projects/TheFloorr/monorepo/serverless/api/reporting-v2.
 * SELECT chains only; the huge pseRaw correlated-subquery select is mirrored as
 * a reduced representative (it is impractical as a single builder chain).
 */
import { describe, it, expect } from "bun:test";
import { createSelectQuery, normalizeWhitespace } from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertExtends, RequireTrue } from "../../fixtures/helpers.js";

// ---------------------------------------------------------------------------
// controller/invoices.ts:41-53 — admin invoices list (i.* + creditNoteId)
// userId/status materialized to set both whereIf branches.
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

describe("reporting controller/invoices chain", () => {
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
// controller/pses.ts:41-58 — PSE search (id/email/givenName/familyName)
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

describe("reporting controller/pses chain", () => {
    it("assembles a PSE search with a single reused ilike param", () => {
        const out = normalizeWhitespace(qPses.toString());
        expect(typeof out).toBe("string");
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
// controller/pse/awaiting-by-team.ts:78 — REDUCED mirror.
// The production query is a raw string (see reporting-v2-plain.test.ts); here
// we build a representative reduced aggregate: the coalesced team-attribution
// key, count(*)::int, and one GBP-converted sum, scoped to a single team.
// ---------------------------------------------------------------------------
const teamId = "t1";

const qAwaiting = createSelectQuery<ReportingV2Schema>()
    .withParams({ teamId })
    .from(`"User_ApprovedPayment" uap`)
    .join(`left join "Network_Order" o on o.id = uap."networkOrderId"`)
    .join(`left join "LogProductClick" click on click.sid = o."clickId"`)
    .join(`join "Team" t on t."id" = coalesce(uap."teamId", click."teamId")`)
    .select(`coalesce(uap."teamId", click."teamId") as "teamId"`)
    .select(`t."name" as "teamName"`)
    .select(`count(uap.id)::int as "uapCount"`)
    .select(
        `sum(convert_currency(uap."amount"::numeric, uap."currency", 'GBP'::text, current_date))::float8 as "amount"`,
    )
    .where(`uap."paid" = false`)
    .where(`uap."revolutDraftId" is null`)
    .where(`coalesce(uap."teamId", click."teamId") = :teamId`);

describe("reporting awaiting-by-team reduced mirror", () => {
    it("assembles the coalesced team key + count + GBP sum aggregate", () => {
        const out = normalizeWhitespace(qAwaiting.toString());
        expect(typeof out).toBe("string");
        expect(out).toContain(`count(uap.id)::int as "uapCount"`);
        expect(out).toContain(`)::float8 as "amount"`);
        expect(out).toContain(`coalesce(uap."teamId", click."teamId")= $1`);
    });

    it("orders params by first appearance", () => {
        expect([...qAwaiting.getParams()]).toEqual(["t1"]);
    });
});

type AwaitingRow = SelectBuilderResult<typeof qAwaiting>;
type _AwaitingRow = RequireTrue<
    AssertExtends<AwaitingRow, { teamName: string; uapCount: number; amount: number }>
>;
