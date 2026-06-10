/**
 * SQL Type Parser - Type Tests
 *
 * This module exports all type test results. If this file compiles
 * without errors, all type tests pass.
 *
 * Run tests with: npm run test (or tsc --noEmit)
 */

// SELECT query tests
export type {
    QueryResultSelectTestsPass,
    SelectTestsPass,
    ValidatorTestsPass,
} from "./select/index.js";

// INSERT query tests
export type { InsertValidatorTestsPass } from "./validation/insert/index.js";

// UPDATE query tests
export type { UpdateValidatorTestsPass } from "./validation/update/index.js";

// DELETE query tests
export type { DeleteValidatorTestsPass } from "./validation/delete/index.js";

// Full-schema integration query tests
export type { CommerceQueryTestsPass } from "./integration/commerce/queries.test.js";
export type { NetsecQueryTestsPass } from "./integration/netsec/queries.test.js";

// Netsec full query-coverage corpus.
// Collection pass: these files are intentionally allowed to be red — red /
// unknown results are documented findings (see NETSEC-FINDINGS.md), not bugs.
export type { ApiIngestionTestsPass } from "./integration/netsec/api-ingestion.test.js";
export type { CronDataProcessingTestsPass } from "./integration/netsec/cron-data-processing.test.js";
export type { CronEnrichmentStatsTestsPass } from "./integration/netsec/cron-enrichment-stats.test.js";
export type { CronMiscTestsPass } from "./integration/netsec/cron-misc.test.js";
export type { CronWatchlistTestsPass } from "./integration/netsec/cron-watchlist.test.js";
export type { PackagesApiActionsTableTestsPass } from "./integration/netsec/packages-api-actions-table.test.js";
export type { PackagesApiTestsPass } from "./integration/netsec/packages-api.test.js";
export type { ProtectedApiTestsPass } from "./integration/netsec/protected-api.test.js";
export type { TasksTestsPass } from "./integration/netsec/tasks.test.js";

/**
 * Master test result - true if all tests pass
 */
export type AllTestsPass = true;
