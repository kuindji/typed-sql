/**
 * Analytics-Scale Query Validation Tests
 *
 * Larger report-style queries with dense predicates and aggregate clauses.
 */

import type { ValidateSQL } from "../../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../helpers.js";
import type { TestSchema } from "./schemas.js";
import type { AnalyticsWarehouseSchema } from "../analytics-schema.js";

// ============================================================================
// Large Analytics Queries - Valid Cases
// ============================================================================

type V_AnalyticsSessionRollup = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  u.name AS user_name,
  p.id AS post_id,
  p.status AS post_status,
  p.views AS post_views,
  count ( c.id ) AS comments_count,
  count ( p.id ) AS posts_count,
  sum ( p.views ) AS total_views,
  avg ( p.views ) AS avg_views
FROM users AS u
INNER JOIN posts AS p ON p.author_id = u.id
LEFT JOIN comments AS c ON c.post_id = p.id
WHERE
  u.is_active = TRUE
  AND u.deleted_at IS NULL
  AND ( u.role = 'admin' OR u.role = 'user' OR u.role = 'guest' )
  AND ( p.status = 'published' OR p.status = 'draft' )
  AND ( p.views > -1 OR p.views = 0 )
  AND ( c.id IS NULL OR c.id > -1 )
GROUP BY
  u.id,
  u.name,
  p.id,
  p.status,
  p.views
HAVING
  count ( p.id ) > -1
  AND sum ( p.views ) > -1
  AND avg ( p.views ) > -1
ORDER BY
  p.views DESC,
  u.id ASC,
  p.id ASC
LIMIT 400
OFFSET 40
`,
    TestSchema
>;
type _A1 = RequireTrue<AssertEqual<V_AnalyticsSessionRollup, true>>;

type V_AnalyticsContentHealth = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  u.name AS user_name,
  p.id AS post_id,
  p.title AS post_title,
  c.id AS comment_id,
  c.created_at AS comment_created_at,
  count ( c.id ) AS comment_events,
  sum ( p.views ) AS views_sum,
  max ( c.created_at ) AS last_comment_at,
  min ( c.created_at ) AS first_comment_at
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
LEFT JOIN comments AS c ON c.post_id = p.id
WHERE
  ( u.is_active = TRUE OR u.deleted_at IS NULL )
  AND ( p.status = 'published' OR p.status = 'draft' )
  AND ( p.views > -1 OR p.views = 0 )
  AND ( c.id IS NULL OR c.id > -1 )
  AND ( c.user_id = u.id OR c.user_id = p.author_id OR c.user_id > -1 )
GROUP BY
  u.id,
  u.name,
  p.id,
  p.title,
  p.views,
  c.id,
  c.created_at
HAVING
  count ( c.id ) > -1
  AND sum ( p.views ) > -1
ORDER BY
  c.created_at DESC NULLS LAST,
  p.views DESC NULLS LAST,
  u.id ASC
LIMIT 600
`,
    TestSchema
>;
type _A2 = RequireTrue<AssertEqual<V_AnalyticsContentHealth, true>>;

type V_AnalyticsUnionRollup = ValidateSQL<
    `
SELECT
  u.id AS entity_id,
  u.name AS entity_name,
  count ( p.id ) AS metric_count,
  sum ( p.views ) AS metric_total,
  'users' AS entity_type
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
GROUP BY u.id, u.name
UNION ALL
SELECT
  p.id AS entity_id,
  p.title AS entity_name,
  count ( c.id ) AS metric_count,
  sum ( p.views ) AS metric_total,
  'posts' AS entity_type
FROM posts AS p
LEFT JOIN comments AS c ON c.post_id = p.id
GROUP BY p.id, p.title
LIMIT 1200
`,
    TestSchema
>;
type _A3 = RequireTrue<AssertEqual<V_AnalyticsUnionRollup, true>>;

type V_AnalyticsLongPredicate = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  p.id AS post_id,
  p.views AS post_views,
  c.id AS comment_id,
  count ( c.id ) AS comment_events,
  sum ( p.views ) AS views_sum
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
LEFT JOIN comments AS c ON c.post_id = p.id
WHERE
  ( u.role = 'admin' OR u.role = 'user' OR u.role = 'guest' )
  AND ( p.status = 'published' OR p.status = 'draft' )
  AND ( u.is_active = TRUE OR u.deleted_at IS NULL )
  AND ( p.views > 0 OR p.views = 0 OR p.views > -1 )
  AND ( c.id IS NULL OR c.id > 0 OR c.id > -1 )
  AND ( c.user_id = u.id OR c.user_id = p.author_id OR c.user_id > -1 )
  AND ( c.post_id = p.id OR c.post_id > -1 )
GROUP BY
  u.id,
  p.id,
  p.views,
  c.id
HAVING
  count ( c.id ) > -1
  AND sum ( p.views ) > -1
ORDER BY
  p.views DESC,
  c.id ASC
LIMIT 700
`,
    TestSchema
>;
type _A4 = RequireTrue<AssertEqual<V_AnalyticsLongPredicate, true>>;

type V_AnalyticsMegaTwice = ValidateSQL<
    "SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email, u.role AS user_role, p.id AS post_id, p.author_id AS post_author_id, p.status AS post_status, p.views AS post_views, c.id AS comment_id, c.user_id AS comment_user_id, count ( c.id ) AS comments_count, count ( p.id ) AS posts_count, sum ( p.views ) AS total_views, avg ( p.views ) AS avg_views, max ( p.views ) AS max_views, min ( p.views ) AS min_views, upper ( u.name ) AS upper_name, lower ( u.email ) AS lower_email, concat ( u.name, u.email ) AS identity_label, ( p.views + 1 )::int AS views_plus_one, CURRENT_DATE AS report_date, CURRENT_TIMESTAMP AS generated_at, 'analytics_segment_alpha' AS segment_alpha, 'analytics_segment_beta' AS segment_beta FROM users AS u LEFT JOIN posts AS p ON p.author_id = u.id LEFT JOIN comments AS c ON c.post_id = p.id WHERE u.is_active = TRUE AND u.deleted_at IS NULL AND ( p.status = 'published' OR p.status = 'draft' ) AND p.views > -1 AND c.id > -1 GROUP BY u.id, u.name, u.email, u.role, p.id, p.author_id, p.status, p.views, c.id, c.user_id HAVING count ( c.id ) > -1 AND count ( p.id ) > -1 AND sum ( p.views ) > -1 AND avg ( p.views ) > -1 ORDER BY p.views DESC, c.id ASC, u.id ASC, p.id ASC LIMIT 2000 OFFSET 100",
    TestSchema
>;
type _A4_1 = RequireTrue<AssertEqual<V_AnalyticsMegaTwice, true>>;

// ============================================================================
// Large Analytics Queries - Invalid Cases
// ============================================================================

type V_AnalyticsInvalidColumnDeepInExpression = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  p.id AS post_id,
  sum ( p.views ) AS total_views,
  count ( c.id ) AS comments_count
FROM users AS u
INNER JOIN posts AS p ON p.author_id = u.id
LEFT JOIN comments AS c ON c.post_id = p.id
WHERE
  u.is_active = TRUE
  AND ( p.status = 'published' OR p.unknown_status = 'draft' )
GROUP BY
  u.id,
  p.id,
  p.views
`,
    TestSchema
>;
type _A5 = RequireTrue<
    AssertEqual<V_AnalyticsInvalidColumnDeepInExpression, false>
>;

type V_AnalyticsInvalidQualifierInSelect = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  z.name AS invalid_alias_name,
  p.title AS post_title,
  count ( p.id ) AS posts_count
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
GROUP BY
  u.id,
  z.name,
  p.title
`,
    TestSchema
>;
type _A6 = RequireTrue<AssertEqual<V_AnalyticsInvalidQualifierInSelect, false>>;

type V_AnalyticsInvalidColumnInHaving = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  u.name AS user_name,
  count ( p.id ) AS posts_count,
  sum ( p.views ) AS total_views
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
GROUP BY u.id, u.name
HAVING
  count ( p.id ) > 0
  AND sum ( p.missing_metric ) > 100
`,
    TestSchema
>;
type _A7 = RequireTrue<AssertEqual<V_AnalyticsInvalidColumnInHaving, false>>;

// ============================================================================
// Warehouse-Scale Validation
// ============================================================================

type V_AnalyticsWarehouseScale = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  u.name AS user_name,
  u.email AS user_email,
  u.role AS user_role,
  o.name AS org_name,
  m.name AS manager_name,
  p.id AS post_id,
  p.status AS post_status,
  p.views AS post_views,
  c.id AS comment_id,
  c.sentiment AS comment_sentiment,
  sub.id AS subscription_id,
  sub.status AS subscription_status,
  pl.code AS plan_code,
  i.id AS invoice_id,
  i.amount AS invoice_amount,
  pay.id AS payment_id,
  pay.status AS payment_status,
  upper ( u.name ) AS user_name_upper,
  CURRENT_DATE AS snapshot_date
FROM users AS u
LEFT JOIN organizations AS o ON o.id = u.org_id
LEFT JOIN users AS m ON m.id = u.manager_id
LEFT JOIN posts AS p ON p.author_id = u.id
LEFT JOIN comments AS c ON c.post_id = p.id
LEFT JOIN subscriptions AS sub ON sub.user_id = u.id
LEFT JOIN plans AS pl ON pl.id = sub.plan_id
LEFT JOIN billing.invoices AS i ON i.subscription_id = sub.id
LEFT JOIN billing.payments AS pay ON pay.invoice_id = i.id
WHERE
  u.is_active = TRUE
  AND u.deleted_at IS NULL
  AND ( p.status = 'published' OR p.status = 'draft' )
  AND ( sub.status = 'active' OR sub.status = 'trial' OR sub.status = 'canceled' )
  AND ( i.status = 'paid' OR i.status = 'open' OR i.status = 'void' )
  AND ( pay.status = 'succeeded' OR pay.status = 'failed' )
ORDER BY
  u.id ASC,
  p.id ASC,
  c.id ASC
LIMIT 1500
`,
    AnalyticsWarehouseSchema
>;
type _A8 = RequireTrue<AssertEqual<V_AnalyticsWarehouseScale, true>>;

type V_AnalyticsWarehouseScale_Invalid = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  p.id AS post_id,
  pay.id AS payment_id,
  pay.missing_status AS invalid_payment_status
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
LEFT JOIN subscriptions AS sub ON sub.user_id = u.id
LEFT JOIN billing.invoices AS i ON i.subscription_id = sub.id
LEFT JOIN billing.payments AS pay ON pay.invoice_id = i.id
`,
    AnalyticsWarehouseSchema
>;
type _A9 = RequireTrue<AssertEqual<V_AnalyticsWarehouseScale_Invalid, false>>;

// ============================================================================
// Export for verification
// ============================================================================

export type AnalyticsValidatorTestsPass = true;
