/**
 * Commerce reporting-v2 (misc controllers) — plain type-level mirrors.
 * COLLECTION pass; reds => engine fix-list. Setup-only: assertions encode the
 * INTENDED row type / validity; failures are an engine fix-list, not test bugs.
 *
 * Area: reporting-v2 misc controllers (everything not under lib/pse/order/team/my):
 *   - controller/invoices.ts            (admin invoices list, builder chain)
 *   - controller/partnerize/download-invoice.ts
 *   - controller/revolut/delete-payment.ts
 *   - controller/pses.ts                (top-level PSE search)
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
type S = ReportingV2Schema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
// Flatten collapses an intersection table type (Base & { extras }) into a flat
// object so the strict Equal helper matches a structurally identical select-* row.
type Flatten<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/invoices.ts action()
// Materialized from the createSelectQuery chain (both whereIf branches present):
//   i.* + left-joined c.id as "creditNoteId"; positional params for userId/status.
// ---------------------------------------------------------------------------
type Q_Invoices = `select i.*, c.id as "creditNoteId" from "Revolut_PaymentInvoice" i left join "Revolut_PaymentCreditNote" c on c."invoiceId" = i.id where i."userId" = $1 and i."status" = $2 order by i."createdAt" desc`;
type _V_Invoices = Expect<Equal<ValidateSQL<Q_Invoices, S>, true>>;
// i.* expands to the full Revolut_PaymentInvoice row (with the reporting-v2 teamId
// extension); c.id is left-joined => string | null.
type _R_Invoices = Expect<
    Equal<
        GetReturnType<Q_Invoices, S>,
        Flatten<S["schemas"]["public"]["Revolut_PaymentInvoice"] & { creditNoteId: string | null }>
    >
>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/partnerize/download-invoice.ts handler()
// ---------------------------------------------------------------------------
type Q_PartnerizeSelfbill = `
        select * from "Network_Partnerize_Selfbill"
        where id = $1
    `;
type _V_PartnerizeSelfbill = Expect<Equal<ValidateSQL<Q_PartnerizeSelfbill, S>, true>>;
type _R_PartnerizeSelfbill = Expect<
    Equal<
        GetReturnType<Q_PartnerizeSelfbill, S>,
        S["schemas"]["public"]["Network_Partnerize_Selfbill"]
    >
>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/revolut/delete-payment.ts main()
// Two queries: a select-by-id guard, then a delete-by-id.
// ---------------------------------------------------------------------------
type Q_RevolutDraftSelect = `
            select * from "Revolut_PaymentDraft"
            where id = $1
        `;
type _V_RevolutDraftSelect = Expect<Equal<ValidateSQL<Q_RevolutDraftSelect, S>, true>>;
type _R_RevolutDraftSelect = Expect<
    Equal<
        GetReturnType<Q_RevolutDraftSelect, S>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type Q_RevolutDraftDelete = `
            delete from "Revolut_PaymentDraft"
            where id = $1
        `;
type _V_RevolutDraftDelete = Expect<Equal<ValidateSQL<Q_RevolutDraftDelete, S>, true>>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pses.ts action()
// Materialized from the createSelectQuery chain (ilike whereIf branch present):
//   id/email/givenName/familyName from "User" filtered to GPS/FRI groups + search.
// ---------------------------------------------------------------------------
type Q_Pses = `
        select "id", "email", "givenName", "familyName" from "User"
        where ("groups" like '%GPS%' or "groups" like '%FRI%')
        and (
            "givenName" ilike $1
            or "familyName" ilike $1
            or "email" ilike $1
        )
        limit 20 offset 0
    `;
type _V_Pses = Expect<Equal<ValidateSQL<Q_Pses, S>, true>>;
type _R_Pses = Expect<
    Equal<
        GetReturnType<Q_Pses, S>,
        { id: string; email: string | null; givenName: string | null; familyName: string | null }
    >
>;

export type CommerceReportingV2MiscPlainTestsPass = true;
