// tests/builder/types/sql-tag.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type {
    BuildSQL,
    EmptySqlTag,
    WithSelect,
    WithFrom,
    WithWhere,
    WithJoin,
    WithoutSelect,
    SqlTag,
} from "../../../src/builder/sql-tag.js";

// from("users u").select("u.id", "s0").where("u.active = true", "w0")
type T1 = WithWhere<
    WithSelect<WithFrom<EmptySqlTag, "users u">, "u.id", "s0", false>,
    "u.active = true",
    "w0"
>;
type _Max1 = RequireTrue<
    AssertEqual<BuildSQL<T1, "max">, "SELECT u.id FROM users u WHERE u.active = true">
>;

// No select fragments → SELECT *
type T2 = WithFrom<EmptySqlTag, "users">;
type _Scope = RequireTrue<AssertEqual<BuildSQL<T2, "scope">, "SELECT * FROM users">>;
type _Max2 = RequireTrue<AssertEqual<BuildSQL<T2, "max">, "SELECT * FROM users">>;

// Conditional select excluded from "req"
type T3 = WithSelect<
    WithSelect<WithFrom<EmptySqlTag, "users u">, "u.id", "s0", false>,
    "u.name",
    "s1",
    true /* conditional */
>;
type _ReqOnlyUncond = RequireTrue<
    AssertEqual<BuildSQL<T3, "req">, "SELECT u.id FROM users u">
>;
type _MaxBoth = RequireTrue<
    AssertEqual<BuildSQL<T3, "max">, "SELECT u.id, u.name FROM users u">
>;

// removeSelect rewrites the tag
type T4 = WithoutSelect<T3, "s0">;
type _RemovedReqEmpty = RequireTrue<
    AssertEqual<BuildSQL<T4, "max">, "SELECT u.name FROM users u">
>;

// non-literal from text widens to string
type T5 = WithFrom<EmptySqlTag, string>;
type _Wide = RequireTrue<AssertEqual<BuildSQL<T5, "max">, string>>;

// Unused-import guard (keep WithJoin / SqlTag referenced).
type _Unused = [WithJoin<EmptySqlTag, "JOIN x", "j0">, SqlTag];
