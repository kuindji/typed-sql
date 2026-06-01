// tests/builder/types/return-type.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { GetReturnType } from "../../../src/index.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";
import type {
    BuilderReturnTypeFor,
    BuilderSQLFor,
} from "../../../src/builder/return-type.js";
import type {
    EmptySqlTag,
    WithSelect,
    WithFrom,
} from "../../../src/builder/sql-tag.js";

// from("users").select("id", "s0") [unconditional]
type Tag1 = WithSelect<WithFrom<EmptySqlTag, "users">, "id", "s0", false>;
type _Sql1 = RequireTrue<
    AssertEqual<BuilderSQLFor<Tag1>, "SELECT id FROM users">
>;
// all-required ⇒ equals GetReturnType over MaxSQL
type _Row1 = RequireTrue<
    AssertEqual<
        BuilderReturnTypeFor<TestSchema, Tag1>,
        GetReturnType<"SELECT id FROM users", TestSchema>
    >
>;

// from("users").select("id","s0").selectIf(cond,"name","s1")
type Tag2 = WithSelect<
    WithSelect<WithFrom<EmptySqlTag, "users">, "id", "s0", false>,
    "name",
    "s1",
    true
>;
// id required, name optional
type _Row2Id = RequireTrue<
    AssertEqual<BuilderReturnTypeFor<TestSchema, Tag2>["id"], number>
>;
type _Row2Name = RequireTrue<
    AssertEqual<BuilderReturnTypeFor<TestSchema, Tag2>["name"], string | undefined>
>;
type _Row2NameOptional = RequireTrue<
    AssertEqual<"name" extends keyof Required<BuilderReturnTypeFor<TestSchema, Tag2>> ? true : false, true>
>;
