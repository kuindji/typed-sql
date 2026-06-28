// SNC-false regression coverage for OBJECT-typed (jsonb-overlay) columns.
//
// Type-checked by `tsconfig.strict-null-false.json` (the `typecheck:snc` pass).
// Under `strictNullChecks: false`, `[unknown] extends [T]` is ALSO true for an
// object type whose properties are ALL optional (it behaves like `{}`). ExprType's
// "did the cascade resolve a type?" guard used that test, so a correctly-resolved
// all-optional object column (e.g. a jsonb column corrected to a fixed shape by a
// consumer's schema overlay) was misread as "unresolved" and thrown to the
// boolean-predicate fallback -> `unknown`. Scalars and objects with a required
// property were unaffected; this pins the all-optional-object case.
import { createSelectQuery } from "../../src/builder/select.js";
import type { BuilderReturnType } from "../../src/builder/return-type.js";
import type { AssertEqual, RequireTrue } from "../fixtures/helpers.js";

type ProbeSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            topic: {
                id: string;
                // every property optional — the collapse trigger under SNC-false
                flags: { processing_enabled?: boolean; visible?: boolean };
                // nested all-optional objects (mirrors silentium.topic.runs)
                runs: { synth?: { stalled?: boolean }; librarian?: { x?: string } };
            };
        };
    };
};

const q = createSelectQuery<ProbeSchema>()
    .from("topic self")
    .select([ "self.id", "self.flags", "self.runs" ]);

type Row = BuilderReturnType<typeof q>;

// Scalar control still resolves.
type _IdOk = RequireTrue<AssertEqual<Row["id"], string>>;
// All-optional object column keeps its full shape (was collapsing to `unknown`).
type _FlagsOk = RequireTrue<
    AssertEqual<Row["flags"], { processing_enabled?: boolean; visible?: boolean }>
>;
// Nested all-optional object keeps its inner keys.
type _RunsInnerKeysOk = RequireTrue<
    AssertEqual<"synth" extends keyof Row["runs"] ? true : false, true>
>;
