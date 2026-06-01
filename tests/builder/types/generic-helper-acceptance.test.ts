// tests/builder/types/generic-helper-acceptance.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderReturnType } from "../../../src/builder/return-type.js";
import { setPeriod } from "../../../src/builder/testing/setPeriod.js";
import type { ReportingSchema } from "../../fixtures/reporting-schema.js";

// NB: this type-test file is ALSO executed by bun test, so `period` must be a
// real runtime binding (not `declare const`). The explicit `: boolean` keeps it
// non-literal for tsc, exercising the conditional path.
const period: boolean = false;

// Build a real, accumulated builder, then push it through the generic helper
// directly AND via applyIf — both must preserve the full row type.
const baseBuilder = createSelectQuery<ReportingSchema>()
    .from(`"Revolut_PaymentInvoice" i`)
    .select(`i.id`, "s_id")
    .select(`i.amount`, "s_amt")
    .where(`i."status" = 'active'`);

const viaDirect = setPeriod(baseBuilder, "month", `i."createdAt"`);
const viaApplyIf = baseBuilder.applyIf(period, (b) =>
    setPeriod(b, "month", `i."createdAt"`),
);

type RowBase = BuilderReturnType<typeof baseBuilder>;
type RowDirect = BuilderReturnType<typeof viaDirect>;
type RowApplyIf = BuilderReturnType<typeof viaApplyIf>;

// THE ACCEPTANCE: the helper does NOT collapse the row type to {} or any.
// (Old library: this required untypedSetPeriod because the typed path lost it.)
type _Direct = RequireTrue<AssertEqual<RowDirect, RowBase>>;
type _ApplyIf = RequireTrue<AssertEqual<RowApplyIf, RowBase>>;

// And the row is the real shape, not `any`/`{}`.
type _Shape = RequireTrue<AssertEqual<RowBase["id"], string>>;
type _Shape2 = RequireTrue<AssertEqual<RowBase["amount"], number>>;
