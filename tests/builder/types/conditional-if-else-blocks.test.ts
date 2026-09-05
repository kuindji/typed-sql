// tests/builder/types/conditional-if-else-blocks.test.ts
//
// An `/*if:x*/…/*endif*//*if:!x*/…/*endif*/` pair is the template language's
// if/else. Every runtime rendering of this template is valid SQL, so the
// conditional validator must not reject it and `u.id` must resolve.
//
// RED on the "include every block" view: both branches are concatenated into
// `from users uorders u`, alias `u` no longer resolves, ValidateConditionalSQL
// flips to `false` and the row type collapses to `{}`. The pre-change
// all-conditions-true view validated this template as `true`.
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ConditionalQueryResult, ValidateConditionalSQL } from "../../../src/builder/conditional-sql.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// The shared fixture has users/posts/comments but no orders. Both runtime
// alternatives must exist in the schema when every real rendering is checked.
type BranchSchema = TestSchema & {
    schemas: { public: { orders: { id: number; name: string | null } } };
};

type IfElseFrom =
    "select u.id from /*if:a*/users u/*endif*//*if:!a*/orders u/*endif*/ where u.id = :id";

type _Valid = RequireTrue<AssertEqual<
    ValidateConditionalSQL<IfElseFrom, { a: boolean }, BranchSchema>, true
>>;

type Row = ConditionalQueryResult<IfElseFrom, { a: boolean }, BranchSchema>;
type _IdPresent = RequireTrue<AssertEqual<Row["id"], number>>;

type IfElseJoin = "select u.id, r.name from users u /*if:a*/join users r on r.id = u.id/*endif*//*if:!a*/join orders r on r.id = u.id/*endif*/";
type _JoinValid = RequireTrue<AssertEqual<ValidateConditionalSQL<IfElseJoin, { a: boolean }, BranchSchema>, true>>;
type JoinRow = ConditionalQueryResult<IfElseJoin, { a: boolean }, BranchSchema>;
type _JoinId = RequireTrue<AssertEqual<JoinRow["id"], number>>;
type _JoinName = RequireTrue<AssertEqual<JoinRow["name"], string | null>>;

// Branch-local output names stay accessible but may be absent at runtime.
type IfElseProjection = "select id /*if:a*/, name/*endif*//*if:!a*/, email/*endif*/ from users";
type ProjectionRow = ConditionalQueryResult<IfElseProjection, { a: boolean }, BranchSchema>;
type _ProjectionId = RequireTrue<AssertEqual<ProjectionRow["id"], number>>;
type _ProjectionName = RequireTrue<AssertEqual<ProjectionRow["name"], string | undefined>>;
type _ProjectionEmail = RequireTrue<AssertEqual<ProjectionRow["email"], string | undefined>>;

// Checking only the all-true and all-false assignments misses this branch.
type MixedInvalid = "select id /*if:enabled*//*if:!user.hideEmail*/, nonexistent/*endif*//*endif*/ from users";
type _MixedInvalid = RequireTrue<AssertEqual<ValidateConditionalSQL<
    MixedInvalid, { enabled: boolean; user: { hideEmail: boolean } }, BranchSchema
>, false>>;

// Mutually exclusive nested conditions never create a synthetic bad projection.
type Unreachable = "select id /*if:a*//*if:!a*/, nonexistent/*endif*//*endif*/ from users";
type _UnreachableValid = RequireTrue<AssertEqual<ValidateConditionalSQL<Unreachable, { a: boolean }, BranchSchema>, true>>;
type _UnreachableRow = RequireTrue<AssertEqual<ConditionalQueryResult<Unreachable, { a: boolean }, BranchSchema>, { id: number }>>;

// Missing conditions stay false instead of inventing an active runtime branch.
type MissingFlag = "select id /*if:missing*/, nonexistent/*endif*/ from users";
type _MissingValid = RequireTrue<AssertEqual<ValidateConditionalSQL<MissingFlag, {}, BranchSchema>, true>>;
type _MissingRow = RequireTrue<AssertEqual<ConditionalQueryResult<MissingFlag, {}, BranchSchema>, { id: number }>>;

// Object-valued conditions stay truthy even when their child flags are false.
type ObjectFlag = "select id from /*if:user*/users/*endif*//*if:!user*/nonexistent/*endif*/";
type _ObjectValid = RequireTrue<AssertEqual<ValidateConditionalSQL<
    ObjectFlag, { user: { hideEmail: boolean } }, BranchSchema
>, true>>;

// Over-budget templates widen without false rejection or exponential work.
type ManyFlags = "select id from users /*if:a*/where id > 0/*endif*//*if:b*/ /*endif*//*if:c*/ /*endif*//*if:d*/ /*endif*//*if:e*/ /*endif*/";
type Flags = { a: boolean; b: boolean; c: boolean; d: boolean; e: boolean };
type _BudgetValid = RequireTrue<AssertEqual<ValidateConditionalSQL<ManyFlags, Flags, BranchSchema>, true>>;
type _BudgetRow = RequireTrue<AssertEqual<ConditionalQueryResult<ManyFlags, Flags, BranchSchema>["id"], unknown>>;
