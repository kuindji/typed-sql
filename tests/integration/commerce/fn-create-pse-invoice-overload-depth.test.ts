/**
 * Regression guard for the raw-string `ValidQuery` size-gate.
 *
 * Background: the builder path (`ValidQueryBuilder`) gained a char-length
 * size-gate ("size-gated whole-query validation") so heavy builder queries skip
 * the expensive whole-query `ValidateSQL`. The RAW-STRING path (`ValidQuery`,
 * consumed by api.ts's `db.main.typedSelect(rawString)` overload) lacked that
 * gate. As a parameter type (`query: ValidQuery<Q, Schema>`), TS must INFER `Q`
 * from the argument *through* `ValidateSQL<Q, Schema>`; on a heavy query against
 * a large schema (the real `MainDatabase`) that inference exhausts the budget,
 * `Q` collapses to `string`, and a valid query is spuriously rejected
 * (TS2769 at serverless/fn/create-pse-invoice/src/index.ts:138).
 *
 * NOTE ON FAITHFULNESS: the budget blow-up only reproduces against a schema as
 * large as `MainDatabase`; the small test fixtures here cannot trigger it, so
 * the *spurious-rejection* symptom is verified at the real worktree gate
 * (`cd serverless/fn/create-pse-invoice && bun tsc --noEmit` goes from RED to
 * GREEN). What this file CAN guard deterministically (schema-size-independent)
 * is the size-gate's CONTRACT and that pass-through preserves row inference:
 *   1. small + valid   → validated, resolves to `Q`
 *   2. small + invalid → still caught (`[SQL Error] ...`)
 *   3. large + invalid → passed through unvalidated (resolves to `Q`)  ← the gate
 *   4. the real heavy query still infers the correct row through the overload
 */
import { describe, expect, it } from "bun:test";
import type { ValidQuery } from "../../../src/builder/index.js";
import type { GetReturnType } from "../../../src/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";

type S = ReportingV2Schema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;
type IsSqlError<T> = T extends `[SQL Error]${string}` ? true : false;

// --- 1. small + valid → validated, resolves to the query string ------------
type Q_SmallValid = `select "id" from "User" where "id" = $1`;
type _SmallValid = Expect<Equal<ValidQuery<Q_SmallValid, S>, Q_SmallValid>>;

// --- 2. small + invalid (bad table) → still caught -------------------------
type Q_SmallInvalid = `select "id" from "NoSuchTable" where "id" = $1`;
type _SmallInvalid = Expect<Equal<IsSqlError<ValidQuery<Q_SmallInvalid, S>>, true>>;

// --- 3. large + invalid (bad table, padded > gate) → passed through --------
// Same bad table as #2, but padded past the char-length gate with a long inert
// comment. Under the gate it must NOT be validated → resolves to `Q`, not an
// error. This is what distinguishes the gated build from the ungated one.
// ~12 lines of inert comment text → comfortably past the 600-char gate.
type Pad =
    `-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       -- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
type Q_LargeInvalid = `select "id" from "NoSuchTable" where "id" = $1 ${Pad}`;
type _LargeInvalid = Expect<Equal<ValidQuery<Q_LargeInvalid, S>, Q_LargeInvalid>>;

// --- 4. pass-through preserves row inference (real fn-create-pse-invoice
//        query, > gate). Mirrors api.ts's raw-string read overload: `Q` is
//        inferred from the argument through `ValidQuery<Q, S>`. ---------------
// Real (dummy-bodied, not `declare`) so the value-argument call below — which
// is what exercises TS inferring `Q` through `ValidQuery<Q, S>` — runs under
// `bun test` as well as `tsc`.
function rawTypedSelect<Q extends string>(
    query: ValidQuery<Q, S>,
): { data: GetReturnType<Q, S>[]; error: string | null } {
    void query;
    return { data: [], error: null };
}

const result = rawTypedSelect(`
        select uap.id, uap."userId", uap."networkOrderId", uap.type,
            convert_currency(uap.amount::numeric, uap.currency, $2, $3::date)::float8 as "amount",
            convert_currency(uap.vat::numeric, uap.currency, $2, $3::date)::float8 as "vat",
            $2 as "currency",
            uap.comment, uap."createdAt", uap.paid, uap."paymentMonth",
            uap."revolutDraftId", uap."revolutReference", uap.status,
            no."orderId", no."orderDate", no."advertiser" as "retailer",
            (u."givenName" || ' ' || u."familyName")::text as "pseName"
        from "User_ApprovedPayment" uap
        left join "User" u on u."id" = uap."userId"
        left join "Network_Order" no on no."id" = uap."networkOrderId"
        where uap."revolutDraftId" = $1`);

type Row = (typeof result)["data"][number];
type _RowInference = Expect<
    Equal<
        Row,
        {
            id: string;
            userId: string | null;
            networkOrderId: string | null;
            type: number | null;
            amount: number;
            vat: number;
            currency: unknown;
            comment: string | null;
            createdAt: string;
            paid: boolean;
            paymentMonth: string | null;
            revolutDraftId: string | null;
            revolutReference: string | null;
            status: string;
            orderId: string | null;
            orderDate: string | null;
            retailer: string | null;
            pseName: string | null;
        }
    >
>;

// Runtime placeholder so `bun test` has a case; the real gate is `tsc --noEmit`.
describe("raw-string ValidQuery size-gate", () => {
    it("gates large queries past whole-query validation while keeping inference", () => {
        expect(true).toBe(true);
    });
});
