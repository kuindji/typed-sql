// tests/builder/types/conditional-sql.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import { createConditionalQuery } from "../../../src/builder/conditional-sql.js";
import type { ConditionalQueryResult } from "../../../src/builder/conditional-sql.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// Conditional column → optional.
type R = ConditionalQueryResult<
    "SELECT id, name /*if:withEmail*/, email/*endif*/ FROM users",
    { withEmail: boolean },
    TestSchema
>;
type _Id = RequireTrue<AssertEqual<R["id"], number>>;
type _Email = RequireTrue<AssertEqual<R["email"], string | undefined>>;

// Scalar-only parity: passing an array as a param value is a type error.
const query = createConditionalQuery<TestSchema>();
// @ts-expect-error - array param value is rejected (scalar-only, builder-only arrays)
query("SELECT id FROM users WHERE id = :ids", {}, { ids: [1, 2, 3] });
