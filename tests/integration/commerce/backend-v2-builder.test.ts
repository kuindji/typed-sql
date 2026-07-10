/**
 * backend-v2 builder duplicates — SELECT-only static mirrors of the raw SQL in
 * commerce app, area: backend-v2.
 *
 * The builder is SELECT-only, so the following DML queries from backend-v2 are
 * SKIPPED here (covered in backend-v2-plain.test.ts instead):
 *   - controller/catalogue.ts: resetFileImportState / toggleFileImport /
 *     toggleFileDownload / toggleFileSearch  (UPDATE)
 *   - controller/my/target.ts set()                                  (INSERT)
 *   - controller/my/push-token-remove.ts                             (DELETE)
 *   - controller/moodboard/rearrange.ts                              (UPDATE)
 *   - controller/moodboard/set-positions.ts                          (UPDATE)
 *
 * Setup-only: assertions encode the INTENDED row type; failures => engine fix-list.
 */
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

// --- mirror of controller/catalogue.ts:133-138  tasks() ---
const qCatalogueTasks = createSelectQuery<ReportingV2CatalogueSchema>()
    .from(`task`)
    .select(`*`)
    .orderBy(`created_at desc`)
    .limit(100);

// --- mirror of controller/catalogue.ts:147-152  queries() ---
const qCatalogueQueries = createSelectQuery<ReportingV2CatalogueSchema>()
    .from(`query_stats`)
    .select(`*`)
    .orderBy(`use_count desc`)
    .limit(100);

// --- mirror of controller/catalogue.ts:182-186  files() ---
const qCatalogueFiles = createSelectQuery<ReportingV2CatalogueSchema>()
    .from(`file`)
    .select(`*`)
    .orderBy(`file_group_id asc, region asc`);

// --- mirror of controller/catalogue.ts:241-247  fileLastImport() ---
const qCatalogueFileLastImport = createSelectQuery<ReportingV2CatalogueSchema>()
    .from(`file_history`)
    .select(`*`)
    .where(`file_id = :fileId`)
    .withParams({ fileId: "f1" })
    .orderBy(`created_at desc`)
    .limit(1);

// --- mirror of controller/catalogue.ts:256-262  queryByDate() ---
const qCatalogueQueryByDate = createSelectQuery<ReportingV2CatalogueSchema>()
    .from(`query_stats_date`)
    .select(`*`)
    .where(`query_stats_id = :queryId`)
    .withParams({ queryId: "q1" })
    .orderBy(`"date" desc`)
    .limit(30);

// --- mirror of controller/catalogue.ts:271-278  queryLog() ---
// materialized from dynamic source: original parameterized limit/offset ($2/$3);
// the builder only accepts numeric limit/offset, so materialized to 50/0.
const qCatalogueQueryLog = createSelectQuery<ReportingV2CatalogueSchema>()
    .from(`query_stats_log`)
    .select(`*`)
    .where(`query_stats_id = :queryId`)
    .withParams({ queryId: "q1" })
    .orderBy(`used_at desc`)
    .limit(50)
    .offset(0);

// --- mirror of controller/my/target.ts:37-46  get()  (db.main, converted=true) ---
// materialized from dynamic source: conditional-string resolved with converted=true.
const qMyTargetGetConverted = createSelectQuery<ReportingV2Schema>()
    .from(`"User_CommissionTarget"`)
    .select([
        `convert_currency("targetCommission"::numeric, "currency", :currency)::float8 as "targetCommission"`,
        `:currency::text as "currency"`,
    ])
    .where(`"userId" = :userId`)
    .withParams({ currency: "GBP", userId: "u1" });

describe("backend-v2 builder duplicates", () => {
    it("qCatalogueTasks assembles", () => {
        expect(normalizeWhitespace(qCatalogueTasks.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM task ORDER BY created_at desc LIMIT 100`),
        );
    });

    it("qCatalogueQueries assembles", () => {
        expect(normalizeWhitespace(qCatalogueQueries.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM query_stats ORDER BY use_count desc LIMIT 100`,
            ),
        );
    });

    it("qCatalogueFiles assembles", () => {
        expect(normalizeWhitespace(qCatalogueFiles.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM file ORDER BY file_group_id asc, region asc`,
            ),
        );
    });

    it("qCatalogueFileLastImport assembles", () => {
        expect(normalizeWhitespace(qCatalogueFileLastImport.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM file_history WHERE file_id = $1 ` +
                    `ORDER BY created_at desc LIMIT 1`,
            ),
        );
    });

    it("qCatalogueQueryByDate assembles", () => {
        expect(normalizeWhitespace(qCatalogueQueryByDate.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM query_stats_date WHERE query_stats_id = $1 ` +
                    `ORDER BY "date" desc LIMIT 30`,
            ),
        );
    });

    it("qCatalogueQueryLog assembles", () => {
        expect(normalizeWhitespace(qCatalogueQueryLog.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM query_stats_log WHERE query_stats_id = $1 ` +
                    `ORDER BY used_at desc LIMIT 50 OFFSET 0`,
            ),
        );
    });

    it("qMyTargetGetConverted assembles", () => {
        expect(normalizeWhitespace(qMyTargetGetConverted.toString())).toBe(
            normalizeWhitespace(
                `SELECT convert_currency("targetCommission"::numeric, "currency", $1)::float8 as "targetCommission", ` +
                    `$1::text as "currency" ` +
                    `FROM "User_CommissionTarget" WHERE "userId" = $2`,
            ),
        );
    });
});

// --- type-level row assertions ---

type Row_CatalogueTasks = SelectBuilderResult<typeof qCatalogueTasks>;
type _Row_CatalogueTasks = RequireTrue<
    AssertEqual<
        Row_CatalogueTasks,
        ReportingV2CatalogueSchema["schemas"]["catalogue"]["task"]
    >
>;

type Row_CatalogueQueries = SelectBuilderResult<typeof qCatalogueQueries>;
type _Row_CatalogueQueries = RequireTrue<
    AssertEqual<
        Row_CatalogueQueries,
        ReportingV2CatalogueSchema["schemas"]["catalogue"]["query_stats"]
    >
>;

type Row_CatalogueFiles = SelectBuilderResult<typeof qCatalogueFiles>;
type _Row_CatalogueFiles = RequireTrue<
    AssertEqual<
        Row_CatalogueFiles,
        ReportingV2CatalogueSchema["schemas"]["catalogue"]["file"]
    >
>;

type Row_CatalogueFileLastImport = SelectBuilderResult<typeof qCatalogueFileLastImport>;
type _Row_CatalogueFileLastImport = RequireTrue<
    AssertEqual<
        Row_CatalogueFileLastImport,
        ReportingV2CatalogueSchema["schemas"]["catalogue"]["file_history"]
    >
>;

type Row_CatalogueQueryByDate = SelectBuilderResult<typeof qCatalogueQueryByDate>;
type _Row_CatalogueQueryByDate = RequireTrue<
    AssertEqual<
        Row_CatalogueQueryByDate,
        ReportingV2CatalogueSchema["schemas"]["catalogue"]["query_stats_date"]
    >
>;

type Row_CatalogueQueryLog = SelectBuilderResult<typeof qCatalogueQueryLog>;
type _Row_CatalogueQueryLog = RequireTrue<
    AssertEqual<
        Row_CatalogueQueryLog,
        ReportingV2CatalogueSchema["schemas"]["catalogue"]["query_stats_log"]
    >
>;

type Row_MyTargetGetConverted = SelectBuilderResult<typeof qMyTargetGetConverted>;
type _Row_MyTargetGetConverted = RequireTrue<
    AssertEqual<
        Row_MyTargetGetConverted,
        { targetCommission: number; currency: string }
    >
>;
