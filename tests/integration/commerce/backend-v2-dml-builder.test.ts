/**
 * backend-v2 DML builder mirrors — write-builder (INSERT/UPDATE/DELETE) and
 * createSql duplicates of the raw DML SQL in commerce app, area: backend-v2.
 *
 * Companion to backend-v2-builder.test.ts, which is SELECT-only and intentionally
 * SKIPPED every DML query. This file fills that gap: every INSERT/UPDATE/DELETE in
 * backend-v2 gets a createInsertQuery/createUpdateQuery/createDeleteQuery mirror,
 * or a createSql typed-raw fallback (tagged // TODO(builder-api)) when the fluent
 * builder cannot model it.
 *
 * DML mirrored (all UPDATE unless noted):
 *   - controller/catalogue.ts: resetFileImportState / toggleFileImport /
 *     toggleFileDownload / toggleFileSearch                            (UPDATE)
 *   - controller/my/target.ts set()              (INSERT ... ON CONFLICT DO UPDATE)
 *   - controller/my/push-token-remove.ts                              (DELETE)
 *   - controller/moodboard/rearrange.ts                              (UPDATE)
 *   - controller/moodboard/set-positions.ts                       (UPDATE ... FROM)
 *
 * Setup-only: assertions encode the INTENDED emitted SQL/params; failures => engine
 * fix-list. Builder columns in these fixtures are plain `string` (not branded), so
 * plain strings in withParams are fine.
 */
import { describe, it, expect } from "bun:test";
import {
    createInsertQuery,
    createUpdateQuery,
    createDeleteQuery,
    createSql,
} from "../../../src/builder/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";

// ===========================================================================
// controller/catalogue.ts  (db.catalogue.run, DML -> Catalogue)
// ===========================================================================

// --- mirror of commerce backend-v2 controller/catalogue.ts:201-205
//     resetFileImportState() ---
const qCatalogueResetFileImportState = createUpdateQuery<ReportingV2CatalogueSchema>()
    .table(`file`)
    .set(`import_state = null`)
    .where(`id = :id`)
    .withParams({ id: "f1" });

// --- mirror of commerce backend-v2 controller/catalogue.ts:211-215
//     toggleFileImport() ---
const qCatalogueToggleFileImport = createUpdateQuery<ReportingV2CatalogueSchema>()
    .table(`file`)
    .set(`import_enabled = not import_enabled`)
    .where(`id = :id`)
    .withParams({ id: "f1" });

// --- mirror of commerce backend-v2 controller/catalogue.ts:221-225
//     toggleFileDownload() ---
const qCatalogueToggleFileDownload = createUpdateQuery<ReportingV2CatalogueSchema>()
    .table(`file`)
    .set(`download_enabled = not download_enabled`)
    .where(`id = :id`)
    .withParams({ id: "f1" });

// --- mirror of commerce backend-v2 controller/catalogue.ts:231-235
//     toggleFileSearch() ---
const qCatalogueToggleFileSearch = createUpdateQuery<ReportingV2CatalogueSchema>()
    .table(`file`)
    .set(`search_enabled = not search_enabled`)
    .where(`id = :id`)
    .withParams({ id: "f1" });

// ===========================================================================
// controller/my/target.ts  (db.main.run, DML -> Main)
// ===========================================================================

// --- mirror of commerce backend-v2 controller/my/target.ts:68-76  set() ---
// Original SQL re-uses the positional params $2/$3 in the ON CONFLICT DO UPDATE
// SET clause. The builder de-duplicates NAMED params by name, so the second
// :targetCommission / :currency reuse the SAME $2/$3 placeholders — matching the
// hand-written positional SQL exactly (params list stays [userId, target, cur]).
const qMyTargetSet = createInsertQuery<ReportingV2Schema>()
    .into(`"User_CommissionTarget"`)
    .value(`"userId"`, `:userId`)
    .value(`"targetCommission"`, `:targetCommission`)
    .value(`"currency"`, `:currency`)
    .value(`"updatedAt"`, `now()`)
    .onConflict(
        `("userId") do update set ` +
            `"targetCommission" = :targetCommission, ` +
            `"currency" = :currency, ` +
            `"updatedAt" = now()`,
    )
    .withParams({
        userId: "u1",
        targetCommission: 100,
        currency: "GBP",
    });

// ===========================================================================
// controller/my/push-token-remove.ts  (api.main.run, DML -> Main)
// ===========================================================================

// --- mirror of commerce backend-v2 controller/my/push-token-remove.ts:29 ---
const qPushTokenRemove = createDeleteQuery<ReportingV2Schema>()
    .from(`"User_ExpoPushToken"`)
    .where(`"userId" = :userId`)
    .where(`"deviceId" = :deviceId`)
    .withParams({ userId: "u1", deviceId: "d1" });

// ===========================================================================
// controller/moodboard/rearrange.ts  (db.main.run, DML -> Main)
// ===========================================================================

// --- mirror of commerce backend-v2 controller/moodboard/rearrange.ts:87-91
//     rearrange() ---
const qMoodboardRearrange = createUpdateQuery<ReportingV2Schema>()
    .table(`"Moodboard_ProductReference"`)
    .set(`"position" = "position" + 10`)
    .where(`"position" >= :position`)
    .withParams({ position: 5 });

// ===========================================================================
// controller/moodboard/set-positions.ts  (db.main.run, DML -> Main)
// ===========================================================================

// --- mirror of commerce backend-v2 controller/moodboard/set-positions.ts:29-36 ---
// UPDATE ... FROM with an aliased target table (`mpr`). The builder's .table()
// takes raw text, so the alias is carried inline.
const qMoodboardSetPositions = createUpdateQuery<ReportingV2Schema>()
    .table(`"Moodboard_ProductReference" mpr`)
    .set(`"position" = :position`)
    .from(`"Catalogue_ProductReference" cpr`)
    .where(`mpr."moodboardId" = :moodboardId`)
    .where(`mpr."productReferenceId" = cpr.id`)
    .where(`cpr."productId" = :productId`)
    .withParams({ position: 3, moodboardId: "m1", productId: "p1" });

// --- createSql typed-raw fallback for the same set() INSERT, preserving the
//     EXACT original positional ($1..$3) shape including the $2/$3 re-use in the
//     ON CONFLICT clause (which the fluent builder cannot reproduce). ---
const sqlMain = createSql<ReportingV2Schema>();
const qMyTargetSetRaw = sqlMain(
    `insert into "User_CommissionTarget"\n` +
        `            ("userId", "targetCommission", "currency", "updatedAt")\n` +
        `            values ($1, $2, $3, now())\n` +
        `            on conflict ("userId") do update set\n` +
        `                "targetCommission" = $2,\n` +
        `                "currency" = $3,\n` +
        `                "updatedAt" = now()`,
).withParams({});

describe("backend-v2 DML builder mirrors", () => {
    it("qCatalogueResetFileImportState assembles", () => {
        expect(qCatalogueResetFileImportState.toString()).toBe(
            `update file set import_state = null where id = $1`,
        );
        expect([...qCatalogueResetFileImportState.getParams()]).toEqual(["f1"]);
    });

    it("qCatalogueToggleFileImport assembles", () => {
        expect(qCatalogueToggleFileImport.toString()).toBe(
            `update file set import_enabled = not import_enabled where id = $1`,
        );
        expect([...qCatalogueToggleFileImport.getParams()]).toEqual(["f1"]);
    });

    it("qCatalogueToggleFileDownload assembles", () => {
        expect(qCatalogueToggleFileDownload.toString()).toBe(
            `update file set download_enabled = not download_enabled where id = $1`,
        );
        expect([...qCatalogueToggleFileDownload.getParams()]).toEqual(["f1"]);
    });

    it("qCatalogueToggleFileSearch assembles", () => {
        expect(qCatalogueToggleFileSearch.toString()).toBe(
            `update file set search_enabled = not search_enabled where id = $1`,
        );
        expect([...qCatalogueToggleFileSearch.getParams()]).toEqual(["f1"]);
    });

    it("qMyTargetSet assembles (named-param dedup matches positional)", () => {
        expect(qMyTargetSet.toString()).toBe(
            `insert into "User_CommissionTarget" ` +
                `("userId", "targetCommission", "currency", "updatedAt") ` +
                `values ($1, $2, $3, now()) ` +
                `on conflict ("userId") do update set ` +
                `"targetCommission" = $2, "currency" = $3, "updatedAt" = now()`,
        );
        expect([...qMyTargetSet.getParams()]).toEqual(["u1", 100, "GBP"]);
    });

    it("qPushTokenRemove assembles", () => {
        expect(qPushTokenRemove.toString()).toBe(
            `delete from "User_ExpoPushToken" where "userId" = $1 and "deviceId" = $2`,
        );
        expect([...qPushTokenRemove.getParams()]).toEqual(["u1", "d1"]);
    });

    it("qMoodboardRearrange assembles", () => {
        expect(qMoodboardRearrange.toString()).toBe(
            `update "Moodboard_ProductReference" set "position" = "position" + 10 where "position" >= $1`,
        );
        expect([...qMoodboardRearrange.getParams()]).toEqual([5]);
    });

    it("qMoodboardSetPositions assembles (UPDATE ... FROM)", () => {
        expect(qMoodboardSetPositions.toString()).toBe(
            `update "Moodboard_ProductReference" mpr set "position" = $1 ` +
                `from "Catalogue_ProductReference" cpr ` +
                `where mpr."moodboardId" = $2 and mpr."productReferenceId" = cpr.id ` +
                `and cpr."productId" = $3`,
        );
        expect([...qMoodboardSetPositions.getParams()]).toEqual([3, "m1", "p1"]);
    });

    it("qMyTargetSetRaw preserves exact positional SQL", () => {
        expect(qMyTargetSetRaw.toString()).toBe(
            `insert into "User_CommissionTarget"\n` +
                `            ("userId", "targetCommission", "currency", "updatedAt")\n` +
                `            values ($1, $2, $3, now())\n` +
                `            on conflict ("userId") do update set\n` +
                `                "targetCommission" = $2,\n` +
                `                "currency" = $3,\n` +
                `                "updatedAt" = now()`,
        );
        expect([...qMyTargetSetRaw.getParams()]).toEqual([]);
    });
});

export type CommerceBackendV2DmlBuilderTestsPass = true;
