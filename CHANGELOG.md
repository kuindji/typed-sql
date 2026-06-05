# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-06-05

Initial public release.

### Added

- **Type-level SQL validation** — `ValidateSQL<Query, Schema>` checks tables,
  columns, aliases, and references against a `DatabaseSchema` type entirely at
  compile time (PostgreSQL dialect).
- **Result-type inference** — `GetReturnType<Query, Schema>` infers the row
  shape of `SELECT`/`RETURNING` queries, including join nullability, `::` casts,
  and `coalesce` semantics.
- **DML helpers** — `GetInsertTableColumns`, `GetUpdateTableColumns`,
  `GetDeleteTableColumns`, statement-specific validators
  (`ValidateSelectSQL`, `ValidateInsertSQL`, `ValidateUpdateSQL`,
  `ValidateDeleteSQL`), and fragment-level validators
  (`ValidateFromPart`, `ValidateWherePart`, …).
- **Runtime select builder** — `createSelectQuery()` with conditional `*If`
  methods (`selectIf`, `whereIf`, `joinIf`, …), named-param expansion to
  `$1, $2…`, and `BuilderReturnType` inference; `createSelectFn(driver)` wires
  your own database client.
- **Runtime write builders** — `createInsertQuery()`, `createUpdateQuery()`,
  `createDeleteQuery()`, the `createSql()` raw-SQL tag, and
  `createMutateFn(driver)` with typed `RETURNING` rows.
- **Condition trees & conditional SQL** — `createConditionTree()`,
  `conditionalSQL()`, and friends for assembling dynamic `WHERE`/`HAVING`
  logic.
