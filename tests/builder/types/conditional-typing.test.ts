// tests/builder/types/conditional-typing.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { GetReturnType } from "../../../src/index.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderReturnType, BuilderSQL } from "../../../src/builder/return-type.js";

declare const dyn: boolean; // non-literal condition (proves no runtime branching)

// --- selectIf optionalizes; sibling select stays required ---
const b1 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "s_id")
    .selectIf(dyn, "name", "s_name");
type R1 = BuilderReturnType<typeof b1>;
type _R1_id = RequireTrue<AssertEqual<R1["id"], number>>;
type _R1_name = RequireTrue<AssertEqual<R1["name"], string | undefined>>;
type _R1_nameOpt = RequireTrue<
    AssertEqual<{} extends Pick<R1, "name"> ? true : false, true>
>;

// --- order-independence: selectIf("...") before select("id") → id still required ---
const b2 = createSelectQuery<TestSchema>()
    .from("users")
    .selectIf(dyn, "name", "s_name")
    .select("id", "s_id");
type R2 = BuilderReturnType<typeof b2>;
type _R2_id = RequireTrue<AssertEqual<R2["id"], number>>;
type _R2_name = RequireTrue<AssertEqual<R2["name"], string | undefined>>;

// --- partition equals the GetReturnType-derived split (uses core resolver) ---
type Max = BuilderSQL<typeof b1>; // "SELECT id, name FROM users"
type _Max = RequireTrue<AssertEqual<Max, "SELECT id, name FROM users">>;
type ReqRow = GetReturnType<"SELECT id FROM users", TestSchema>;
type MaxRow = GetReturnType<"SELECT id, name FROM users", TestSchema>;
type Expected1 =
    & { [K in keyof MaxRow as K extends keyof ReqRow ? K : never]: MaxRow[K] }
    & { [K in keyof MaxRow as K extends keyof ReqRow ? never : K]?: MaxRow[K] };
type _R1_eq = RequireTrue<AssertEqual<R1, Expected1>>;

// --- expression key stays required (F-B naming consistency) ---
const b3 = createSelectQuery<TestSchema>().from("users").select("count(*)", "s_c");
type R3 = BuilderReturnType<typeof b3>;
type _R3 = RequireTrue<
    AssertEqual<R3, GetReturnType<"SELECT count(*) FROM users", TestSchema>>
>;

// --- apply: a select inside is required; applyIf: a new column is optional ---
const b4 = createSelectQuery<TestSchema>()
    .from("users")
    .apply(b => b.select("id", "s_id"));
type R4 = BuilderReturnType<typeof b4>;
type _R4 = RequireTrue<AssertEqual<R4["id"], number>>;

const b5 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "s_id")
    .applyIf(dyn, b => b.select("name", "s_name"));
type R5 = BuilderReturnType<typeof b5>;
type _R5_id = RequireTrue<AssertEqual<R5["id"], number>>;        // guaranteed elsewhere
type _R5_name = RequireTrue<AssertEqual<R5["name"], string | undefined>>; // applyIf-introduced

// --- default-* fallback (F-A): no unconditional select → Partial(scope & cond key) ---
const b6 = createSelectQuery<TestSchema>().from("users").selectIf(dyn, "id", "s_id");
type R6 = BuilderReturnType<typeof b6>;
// every scope column present but optional:
type _R6_idOpt = RequireTrue<AssertEqual<R6["id"], number | undefined>>;
type _R6_nameOpt = RequireTrue<AssertEqual<R6["name"], string | undefined>>;

// --- removeSelect + conditional (F-G): after removal only conditional producer ---
const b7 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "s_id")
    .removeSelect("s_id")
    .selectIf(dyn, "id", "s_id2");
type R7 = BuilderReturnType<typeof b7>;
type _R7_idOpt = RequireTrue<AssertEqual<R7["id"], number | undefined>>;

// --- fragment-id reuse (F-G2): conditional overwrite of slot removes the
//     unconditional guarantee. After the overwrite, slot "x" holds the
//     conditional "name", so there is NO unconditional select left → the row
//     falls to Partial<MaxRow & ScopeRow> (the all-false runtime path is
//     SELECT *). Per spec, "id types optional" — it is still present (via the
//     SELECT * scope row) but no longer required, and "name" is optional.
const b8 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "x")
    .applyIf(dyn, b => b.select("name", "x")); // overwrites slot "x" conditionally
type R8 = BuilderReturnType<typeof b8>;
type _R8_idOptional = RequireTrue<AssertEqual<R8["id"], number | undefined>>;
type _R8_name = RequireTrue<AssertEqual<R8["name"], string | undefined>>;

// distinct ids keep the unconditional guarantee:
const b9 = createSelectQuery<TestSchema>()
    .from("users")
    .select("id", "x")
    .applyIf(dyn, b => b.select("name", "y"));
type R9 = BuilderReturnType<typeof b9>;
type _R9_id = RequireTrue<AssertEqual<R9["id"], number>>;
type _R9_name = RequireTrue<AssertEqual<R9["name"], string | undefined>>;
