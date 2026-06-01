// src/builder/testing/setPeriod.ts
// Reference port of monorepo packages/common/src/lib/sql/setQueryBuilderPeriod.ts,
// migrated to the new two-generic builder. NOTE: drops the third `State` generic
// and the AnyBuilderStateTag/AnyBuilderSqlTag imports; uses the new AnySqlTag.
import type { DatabaseSchema } from "../../schema.js";
import type { SelectQueryBuilder } from "../select.js";
import type { AnySqlTag } from "../sql-tag.js";

// Minimal stand-in for the monorepo's getPeriodRange (range computed by caller in tests).
export function setPeriod<S extends DatabaseSchema, Sql extends AnySqlTag>(
    b: SelectQueryBuilder<S, Sql>,
    period: string,
    field: string,
    _format: string = "YYYY-MM-DD",
) {
    // In production, [start, end] = getPeriodRange(period, format). For the
    // reference port the range is encoded as literals to keep output stable.
    const start = "2026-01-01";
    const end = "2026-01-31";
    return b
        .whereIf(!!start && !!end, `${field} between '${start}' and '${end}'`)
        .whereIf(!!start && !end, `${field} >= '${start}'`)
        .whereIf(!start && !!end, `${field} <= '${end}'`);
}
