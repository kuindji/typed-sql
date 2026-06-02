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
