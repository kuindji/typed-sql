// tests/builder/types/write-tag.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { BuildInsertSQL, WriteParamsFor } from "../../../src/builder/write-tag.js";
import type { WriteSchema, User_id } from "../fixtures/write-schema.js";

// A tag with an unconditional (userId) and a conditional (note) value pair.
type Tag = {
    kind: "insert";
    table: "orders";
    values: readonly [
        { col: "userId"; text: ":uid"; cond: false },
        { col: "note"; text: ":note"; cond: true },
    ];
    // Empty columns/fromSelect → VALUES form is rendered (not INSERT...SELECT).
    columns: "";
    fromSelect: "";
    conflict: null;
    wheres: readonly [];
    using: readonly [];
    from: readonly [];
    returning: null;
};

type _Max = RequireTrue<AssertEqual<
    BuildInsertSQL<Tag, "max">,
    "insert into orders (userId, note) values (:uid, :note)">>;
type _Req = RequireTrue<AssertEqual<
    BuildInsertSQL<Tag, "req">,
    "insert into orders (userId) values (:uid)">>;

// uid required (unconditional), note optional (conditional)
type P = WriteParamsFor<Tag, WriteSchema>;
type _Puid = RequireTrue<AssertEqual<P["uid"], User_id>>;
// `note` is a nullable column (string | null); conditional → optional adds
// `| undefined`, so the param type is `string | null | undefined`
// (a nullable column conditionally projected is `col?: T | null`).
type _Pnote = RequireTrue<AssertEqual<P["note"], string | null | undefined>>;

// INSERT...SELECT: a non-empty fromSelect switches BuildInsertSQL to the SELECT
// rendering, and the `:oid` in the SELECT body is a REQUIRED param. It is bound
// loosely (DriverParamValue) because `i."orderId"` carries a foreign qualifier
// that does not resolve to the target table.
type SelectTag = {
    kind: "insert";
    table: "orders";
    values: readonly [];
    columns: `"id", "amount"`;
    fromSelect: `select i."id", i."amount" from staging i where i."orderId" = :oid`;
    conflict: "do nothing";
    wheres: readonly [];
    using: readonly [];
    from: readonly [];
    returning: null;
};
type _SelMax = RequireTrue<AssertEqual<
    BuildInsertSQL<SelectTag, "max">,
    `insert into orders ("id", "amount") select i."id", i."amount" from staging i where i."orderId" = :oid on conflict do nothing`>>;
// `oid` is bound loosely (DriverParamValue = unknown) and is a REQUIRED key — a
// foreign-qualified ref doesn't resolve to the target column, so it stays loose,
// but withParams still demands the key be supplied.
type SP = WriteParamsFor<SelectTag, WriteSchema>;
type _SParams = RequireTrue<AssertEqual<SP, { oid: unknown }>>;
// "oid" is a required key of SP (not optional): a Pick over the optional-keys set
// would omit it, so the required-keys projection retains it.
type RequiredKeys<O> = { [K in keyof O]-?: {} extends Pick<O, K> ? never : K }[keyof O];
type _SoidRequired = RequireTrue<AssertEqual<RequiredKeys<SP>, "oid">>;
