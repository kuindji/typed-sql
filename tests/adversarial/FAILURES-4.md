# Adversarial round 4 — demonstrated failures of `@kuindji/typed-sql`

Rounds 1–3 (`FAILURES.md`, `FAILURES-2.md`, `FAILURES-3.md`) drove the type
checker from 60 → 0, 16 → 0, and 16 → 0 errors. This fourth round targets the
**comma-separated (ANSI) cross join** — `from a, b` — and the new **partial
clause validators** (`src/partial.ts`). Running:

```
npx tsc --noEmit
```

produces **7 new errors** (`TS2344: Type 'false' does not satisfy the constraint
'true'`) — 7 assertions where the library validates or types a comma join
incorrectly. Every actual value was confirmed by probing the compiler (assigning
each `ValidateSQL` / `GetReturnType` / `ValidateFromPart` result to an
incompatible sentinel and reading the printed type), not assumed.

The new file also carries **7 green control assertions** that pass, so the suite
stays honest rather than cherry-picked.

| Category file | Failing | Green controls |
|---|---|---|
| `comma-joins.test.ts` | 7 | 7 |

## Root cause — only the first table after a keyword is collected

`from a, b` (and `update a, b`, `delete from a using b, c`) is standard,
portable SQL: the old-style cross join, supported by both Postgres and MySQL.
But the table/alias collectors only ever consume the **single token immediately
after** a `from` / `join` / `into` / `update` keyword:

- `CollectTables` (`src/tables.ts:47`) matches `T extends "from" | "join" | …`
  and reads `Next`, then recurses on the *rest* with no keyword in front of the
  comma-separated tables that follow.
- `CollectAliases` (`src/tables.ts:66`) has the same shape.

In `from users, orders` the comma is stripped during tokenization and `orders`
lands in a non-keyword position, so it is never visited as a table source. The
query is **not** bailed out as unparseable (which would be a defensible
limitation) — it is actively given a wrong answer in three ways:

### 1. Validation false-accept — a nonexistent comma table escapes (`V1–V3`)

A 2nd+ comma table is never existence-checked, so a query referencing a
nonexistent table is reported **valid**.

| Test | Query | Expected | Actual |
|------|-------|----------|--------|
| V1 | `ValidateFromPart<"users u, bogus b">` | `false` | **`true`** |
| V2 | `ValidateFromPart<"users u, products p, bogus b">` | `false` | **`true`** |
| V3 | `ValidateSQL<"select * from users, bogus">` | `false` | **`true`** |

### 2. Return type drops the 2nd+ table's columns (`R1–R2`)

| Test | Query | Expected | Actual |
|------|-------|----------|--------|
| R1 | `GetReturnType<"select u.email, o.total from users u, orders o">` | `{ email: string; total: number }` | **`{ email: string }`** |
| R2 | `GetReturnType<"select * from users u, orders o">` | merge of both rows (8 keys) | **`users` columns only** |

### 3. Compound false-reject — a valid query is rejected (`F1–F2`)

A *valid* qualified column on the dropped table can no longer resolve its alias,
so a correct query is reported **invalid** and its row collapses.

| Test | Query | Expected | Actual |
|------|-------|----------|--------|
| F1 | `ValidateSQL<"select o.total from users u, orders o">` | `true` | **`false`** |
| F2 | `GetReturnType<"select o.total from users u, orders o">` | `{ total: number }` | **`{}`** |

## The defect is comma-specific — green controls scope it

The explicit `CROSS JOIN` / `JOIN` keyword forms collect and validate **every**
table, and the FIRST comma table IS checked. These controls pass today:

- `ValidateFromPart<"users u, products p">` → `true`;
  `ValidateFromPart<"orders o, payments pmt">` → `true` (valid pairs accepted).
- `ValidateFromPart<"users u cross join bogus b">` → `false`;
  `ValidateSQL<"select * from users cross join bogus">` → `false`
  (the keyword form catches the bogus table — only commas don't).
- `ValidateSQL<"select * from bogus, users">` → `false`
  (the FIRST comma table *is* validated; the hole is the 2nd+ position only).
- Proper-JOIN twins of R1 and F1 → `{ email: string; total: number }` and
  `true` (the keyword path types and accepts both tables correctly).

## Suggested fix direction (out of scope this round)

1. **Collect comma-separated table sources.** In `CollectTables` /
   `CollectAliases`, after reading the table that follows a `from` / `join`
   keyword, continue treating subsequent comma-separated tokens (until the next
   clause keyword) as additional table sources in the same FROM list — each with
   its own optional alias — rather than only the single token after the keyword.
2. Once the tables and aliases are collected, the existing existence check,
   row-merge (`MergeRowUnion`), and alias resolution all apply unchanged, so all
   three failure modes above resolve together.
