// tests/builder/types/conditional-sql.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import { createConditionalQuery } from "../../../src/builder/conditional-sql.js";
import type { ConditionalQueryResult, ValidateConditionalSQL } from "../../../src/builder/conditional-sql.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// Conditional column → optional.
type R = ConditionalQueryResult<
    "SELECT id, name /*if:withEmail*/, email/*endif*/ FROM users",
    { withEmail: boolean },
    TestSchema
>;
type _Id = RequireTrue<AssertEqual<R["id"], number>>;
type _Email = RequireTrue<AssertEqual<R["email"], string | undefined>>;

type Negated = ConditionalQueryResult<
    "SELECT id /*if:!hideEmail*/, email/*endif*/ FROM users",
    { hideEmail: boolean }, TestSchema
>;
type _NegativeId = RequireTrue<AssertEqual<Negated["id"], number>>;
type _NegativeEmail = RequireTrue<AssertEqual<Negated["email"], string | undefined>>;

type Mixed = ConditionalQueryResult<
    "SELECT id /*if:showName*/, name/*endif*//*if:!hideEmail*/, email/*endif*/ FROM users",
    { showName: boolean; hideEmail: boolean }, TestSchema
>;
type _MixedKeys = RequireTrue<AssertEqual<keyof Mixed, "id" | "name" | "email">>;
type _MixedName = RequireTrue<AssertEqual<Mixed["name"], R["name"] | undefined>>;
type _MixedEmail = RequireTrue<AssertEqual<Mixed["email"], string | undefined>>;

type Nested = ConditionalQueryResult<
    "SELECT id /*if:enabled*//*if:!user.hideEmail*/, email/*endif*//*endif*/ FROM users",
    { enabled: boolean; user: { hideEmail: boolean } }, TestSchema
>;
type _NestedId = RequireTrue<AssertEqual<Nested["id"], number>>;
type _NestedEmail = RequireTrue<AssertEqual<Nested["email"], string | undefined>>;
type _NegativeValidation = RequireTrue<AssertEqual<ValidateConditionalSQL<
    "SELECT id /*if:!hideEmail*/, nonexistent/*endif*/ FROM users",
    { hideEmail: boolean }, TestSchema
>, false>>;

// Scalar-only parity: passing an array as a param value is a type error.
const query = createConditionalQuery<TestSchema>();
// @ts-expect-error - array param value is rejected (scalar-only, builder-only arrays)
query("SELECT id FROM users WHERE id = :ids", {}, { ids: [1, 2, 3] });
