/**
 * backend-v2 plain-SQL fixtures — copied verbatim from
 * commerce app, area: backend-v2.
 * Setup-only: assertions encode the INTENDED row type; failures => engine fix-list.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";

type Main = ReportingV2Schema;
type Catalogue = ReportingV2CatalogueSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;

// ===========================================================================
// controller/catalogue.ts  (db.catalogue.* -> Catalogue)
// ===========================================================================

// --- controller/catalogue.ts:133-138  tasks() (db.catalogue.select) ---
type Q_CatalogueTasks = `
            select *
            from task
            order by created_at desc
            limit 100
        `;
type _V_CatalogueTasks = Expect<Equal<ValidateSQL<Q_CatalogueTasks, Catalogue>, true>>;
type _R_CatalogueTasks = Expect<
    Equal<
        GetReturnType<Q_CatalogueTasks, Catalogue>,
        Catalogue["schemas"]["catalogue"]["task"]
    >
>;

// --- controller/catalogue.ts:147-152  queries() (db.catalogue.select) ---
type Q_CatalogueQueries = `
        select *
        from query_stats
        order by use_count desc
        limit 100
    `;
type _V_CatalogueQueries = Expect<Equal<ValidateSQL<Q_CatalogueQueries, Catalogue>, true>>;
type _R_CatalogueQueries = Expect<
    Equal<
        GetReturnType<Q_CatalogueQueries, Catalogue>,
        Catalogue["schemas"]["catalogue"]["query_stats"]
    >
>;

// --- controller/catalogue.ts:182-186  files() (db.catalogue.select) ---
type Q_CatalogueFiles = `
        select *
        from file
        order by file_group_id asc, region asc
    `;
type _V_CatalogueFiles = Expect<Equal<ValidateSQL<Q_CatalogueFiles, Catalogue>, true>>;
type _R_CatalogueFiles = Expect<
    Equal<
        GetReturnType<Q_CatalogueFiles, Catalogue>,
        Catalogue["schemas"]["catalogue"]["file"]
    >
>;

// --- controller/catalogue.ts:201-205  resetFileImportState() (db.catalogue.run, DML) ---
type Q_CatalogueResetFileImportState = `
        update file
        set import_state = null
        where id = $1
    `;
type _V_CatalogueResetFileImportState = Expect<
    Equal<ValidateSQL<Q_CatalogueResetFileImportState, Catalogue>, true>
>;

// --- controller/catalogue.ts:211-215  toggleFileImport() (db.catalogue.run, DML) ---
type Q_CatalogueToggleFileImport = `
        update file
        set import_enabled = not import_enabled
        where id = $1
    `;
type _V_CatalogueToggleFileImport = Expect<
    Equal<ValidateSQL<Q_CatalogueToggleFileImport, Catalogue>, true>
>;

// --- controller/catalogue.ts:221-225  toggleFileDownload() (db.catalogue.run, DML) ---
type Q_CatalogueToggleFileDownload = `
        update file
        set download_enabled = not download_enabled
        where id = $1
    `;
type _V_CatalogueToggleFileDownload = Expect<
    Equal<ValidateSQL<Q_CatalogueToggleFileDownload, Catalogue>, true>
>;

// --- controller/catalogue.ts:231-235  toggleFileSearch() (db.catalogue.run, DML) ---
type Q_CatalogueToggleFileSearch = `
        update file
        set search_enabled = not search_enabled
        where id = $1
    `;
type _V_CatalogueToggleFileSearch = Expect<
    Equal<ValidateSQL<Q_CatalogueToggleFileSearch, Catalogue>, true>
>;

// --- controller/catalogue.ts:241-247  fileLastImport() (db.catalogue.select) ---
type Q_CatalogueFileLastImport = `
            select *
            from file_history
            where file_id = $1
            order by created_at desc
            limit 1
        `;
type _V_CatalogueFileLastImport = Expect<
    Equal<ValidateSQL<Q_CatalogueFileLastImport, Catalogue>, true>
>;
type _R_CatalogueFileLastImport = Expect<
    Equal<
        GetReturnType<Q_CatalogueFileLastImport, Catalogue>,
        Catalogue["schemas"]["catalogue"]["file_history"]
    >
>;

// --- controller/catalogue.ts:256-262  queryByDate() (db.catalogue.select) ---
type Q_CatalogueQueryByDate = `
        select *
        from query_stats_date
        where query_stats_id = $1
        order by "date" desc
        limit 30
    `;
type _V_CatalogueQueryByDate = Expect<
    Equal<ValidateSQL<Q_CatalogueQueryByDate, Catalogue>, true>
>;
type _R_CatalogueQueryByDate = Expect<
    Equal<
        GetReturnType<Q_CatalogueQueryByDate, Catalogue>,
        Catalogue["schemas"]["catalogue"]["query_stats_date"]
    >
>;

// --- controller/catalogue.ts:271-278  queryLog() (db.catalogue.select) ---
type Q_CatalogueQueryLog = `
        select *
        from query_stats_log
        where query_stats_id = $1
        order by used_at desc
        limit $2
        offset $3
    `;
type _V_CatalogueQueryLog = Expect<
    Equal<ValidateSQL<Q_CatalogueQueryLog, Catalogue>, true>
>;
type _R_CatalogueQueryLog = Expect<
    Equal<
        GetReturnType<Q_CatalogueQueryLog, Catalogue>,
        Catalogue["schemas"]["catalogue"]["query_stats_log"]
    >
>;

// ===========================================================================
// controller/my/target.ts  (db.main.* -> Main)
// ===========================================================================

// --- controller/my/target.ts:37-46  get() (db.main.typedSelect) ---
// materialized from dynamic source: conditional-string resolved with converted=true
// (keeps /*if:converted*/ blocks, drops /*if:!converted*/ blocks).
type Q_MyTargetGetConverted = `
            select

            convert_currency("targetCommission"::numeric, "currency", $2)::float8 as "targetCommission",

            $2::text as "currency"
            from "User_CommissionTarget"
            where "userId" = $1`;
type _V_MyTargetGetConverted = Expect<
    Equal<ValidateSQL<Q_MyTargetGetConverted, Main>, true>
>;
type _R_MyTargetGetConverted = Expect<
    Equal<
        GetReturnType<Q_MyTargetGetConverted, Main>,
        { targetCommission: number; currency: string }
    >
>;

// --- controller/my/target.ts:68-76  set() (db.main.run, DML) ---
type Q_MyTargetSet = `
            insert into "User_CommissionTarget"
            ("userId", "targetCommission", "currency", "updatedAt")
            values ($1, $2, $3, now())
            on conflict ("userId") do update set
                "targetCommission" = $2,
                "currency" = $3,
                "updatedAt" = now()
        `;
type _V_MyTargetSet = Expect<Equal<ValidateSQL<Q_MyTargetSet, Main>, true>>;

// ===========================================================================
// controller/my/push-token-remove.ts  (api.main.* -> Main)
// ===========================================================================

// --- controller/my/push-token-remove.ts:29  (api.main.run, DML) ---
// SCHEMA-GAP: User_ExpoPushToken (table absent from all fixtures)
type Q_PushTokenRemove =
    `DELETE FROM "User_ExpoPushToken" WHERE "userId" = $1 AND "deviceId" = $2`;
type _V_PushTokenRemove = Expect<Equal<ValidateSQL<Q_PushTokenRemove, Main>, true>>;

// ===========================================================================
// controller/moodboard/rearrange.ts  (db.main.* -> Main)
// ===========================================================================

// --- controller/moodboard/rearrange.ts:87-91  rearrange() (db.main.run, DML) ---
// SCHEMA-GAP: Moodboard_ProductReference (table absent from all fixtures)
type Q_MoodboardRearrange = `
            update "Moodboard_ProductReference"
            set "position" = "position" + 10
            where "position" >= $1
        `;
type _V_MoodboardRearrange = Expect<Equal<ValidateSQL<Q_MoodboardRearrange, Main>, true>>;

// ===========================================================================
// controller/moodboard/set-positions.ts  (db.main.* -> Main)
// ===========================================================================

// --- controller/moodboard/set-positions.ts:29-36  (db.main.run, DML) ---
// SCHEMA-GAP: Moodboard_ProductReference (table absent from all fixtures)
type Q_MoodboardSetPositions = `
        update "Moodboard_ProductReference" mpr
        set "position" = $3
        from "Catalogue_ProductReference" cpr
        where mpr."moodboardId" = $1
        and mpr."productReferenceId" = cpr.id
        and cpr."productId" = $2
    `;
type _V_MoodboardSetPositions = Expect<
    Equal<ValidateSQL<Q_MoodboardSetPositions, Main>, true>
>;
