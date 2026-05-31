# Partial Query Validation — Design

Date: 2026-05-31
Status: Approved (brainstorm), pending implementation plan

## Motivation

Preparation for a query builder that concatenates parts of a SQL query based on
runtime conditions. The builder itself is out of scope. What it needs from this
library is the ability to validate **each part of a query separately** — simple
table/field existence checking, the same concern the full-query validator has.

When only a part of a query is in scope it is almost always impossible to fully
validate it. Example:

```
left join table_name t on t.id = b.id
```

This part lets you validate `t.id` (the alias `t` is bound to `table_name`
inside the part) but not `b.id` (alias `b` is defined in some other part not in
scope). Inability to validate `b.id` must **not** be an error — only `t.id` is
validated.

Each query part has its own validation entry point so that detecting which part
it is can be skipped (saving a parsing step and TS instantiation budget).

## Scope

- **In scope (this iteration):** the part entry points listed in §2, validation
  only (boolean result — no return-type inference for parts).
- **Pure isolation:** a part is validated using only the tables/aliases defined
  *within that same part*. No external/accumulated context is passed in.
- **Out of scope (deferred):** the query builder itself; passing accumulated
  tables/aliases context between parts (expected to be expensive in TS depth —
  attempted after the builder works); return-type inference for parts; INSERT/
  UPDATE/DELETE-specific parts (the pattern established here is expanded during
  builder work).

## 1. Core resolution rule (the one behavioral change)

The full-query validator, when a qualified ref like `b.id` has a prefix that is
neither a known alias nor a known table, **falls back to a phantom
`<defaultSchema>.b` table and fails**. For partials this is inverted: an
**unresolvable prefix is skipped (treated valid)**, never failed.

For any column reference in a part:

- **Qualified** (`t.id`, `public.users.id`): resolve the prefix. If it resolves
  to an alias defined *in this part*, a table named *in this part*, or a real
  schema-qualified table present in the schema → validate the column **strictly**
  (fail if the column does not exist). Otherwise → **skip** (valid).
- **Unqualified** (`id`, `name`): if it matches a column of some table defined
  *in this part* → valid; otherwise → **skip** (it may belong to an out-of-part
  table). Unqualified refs **never fail** in a part.
- **Table names** appearing in a FROM/JOIN part are validated **strictly** —
  a typo'd table name fails.

Worked example — `left join table_name t on t.id = b.id`:
- `table_name` must exist (strict).
- `t.id` is validated against `table_name` (strict — catches `t.wrongcol`).
- `b.id` is silently skipped.

This matches the requested behavior exactly.

## 2. Entry points (this iteration)

Distinct named types, no part-detection step. Each takes `<Part extends string,
Schema extends DatabaseSchema>` and returns `boolean`.

| Entry point          | Handles                              | Meaningfully catches in isolation              |
| -------------------- | ------------------------------------ | ---------------------------------------------- |
| `ValidateFromPart`   | `from users u`, `users u`            | table exists; alias-qualified cols if present  |
| `ValidateJoinPart`   | `left join t_n t on t.id = b.id`     | joined table exists; ON cols qualified to alias |
| `ValidateSelectPart` | `select t.id, count(*) as n`         | fully-qualified / real-table cols              |
| `ValidateWherePart`  | `where t.id = 5 and b.x > 0`         | fully-qualified / real-table cols              |
| `ValidateHavingPart` | `having sum(x) > 0`                  | same as WHERE                                  |
| `ValidateGroupByPart`| `group by t.id, name`                | same                                           |
| `ValidateOrderByPart`| `order by t.id desc`                 | same                                           |

In pure isolation the strongest validation comes from FROM/JOIN parts (they
carry tables). The clause parts mainly validate fully-qualified refs and provide
a stable API surface to extend with context later.

## 3. Implementation shape

New file `src/partial.ts`, re-exported from `src/index.ts`. Reuses existing
machinery:

- Each part is first run through `NormalizeQuery` (lowercasing outside quotes,
  block-comment stripping, whitespace collapse) for consistency with full
  queries.
- `TablesInQuery` / `AliasesInQuery` already collect tables+aliases from
  `from`/`join` keywords and work directly on a FROM/JOIN fragment — no change.
- `TokenizeLoose` + `QualifiedColumnRefs` / `UnqualifiedColumnRefs` already
  extract the refs to check from a token list.

Genuinely new types (partial-resolution variants):

- `ColumnRefValidPartialWith<ColRef, Tables, Aliases, S>` — like
  `ColumnRefValidWith` but skip-on-unknown-prefix (returns `true` when the
  prefix resolves to nothing known, instead of phantom-failing).
- `QualifiedColumnRefsValidPartialFor` — a thin wrapper that drives the partial
  validator over a token list.

  Note (implementation): there is no `UnqualifiedColumnRefsValidPartialFor`. The
  "unqualified never fails" rule is realized structurally — `QualifiedColumnRefs`
  only ever yields dotted tokens, so unqualified refs are simply never collected
  or validated. Clause parts additionally pass `Tables = never, Aliases = never`,
  so even a bare column has nothing to resolve against and is skipped. No
  dedicated unqualified validator is needed.

Each entry point is a small composition:
1. Normalize the part.
2. Strip the leading keyword (`from` / `left join` / `select` / `where` / …) to
   isolate the column-bearing segment where needed.
3. Collect part-local tables/aliases (`TablesInQuery` / `AliasesInQuery`).
4. FROM/JOIN only: run strict table-existence (`AllTablesValidFor`).
5. Run partial ref-validation over the relevant segment.

Each entry point is kept small and independent so it can be understood and
tested on its own, and so the per-part TS instantiation cost stays bounded.

## 4. Testing

New `tests/partial/` directory, one file per part type, following the existing
`Expect<Equal<...>>` / `DatabaseSchema` pattern used in `tests/types.test.ts`.

Each file covers at least:
- a valid part → `true`;
- an invalid table or column that *is* resolvable in the part → `false`;
- an unresolvable cross-part ref (e.g. `b.id` with `b` undefined) → stays `true`
  (the defining behavior).

## Open questions

None blocking. Naming convention (`Validate<Clause>Part`) and the
unqualified-never-fails rule are both approved.
