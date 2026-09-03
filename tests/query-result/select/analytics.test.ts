/**
 * Analytics-Scale Result Inference Tests
 *
 * Medium-wide projections plus long analytics predicates.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";
import type { AnalyticsWarehouseSchema } from "../../fixtures/analytics-schema.js";

// ============================================================================
// Wide Analytics Projection Inference
// ============================================================================

type M_AnalyticsWideProjection = QueryResult<
    `
SELECT
  u.id AS user_id,
  u.name AS user_name,
  u.email AS user_email,
  u.currency AS currency_code,
  p.id AS post_id,
  p.status AS post_status,
  p.views AS post_views,
  count ( p.id ) AS posts_count,
  count ( c.id ) AS comments_count,
  sum ( p.views ) AS total_views,
  avg ( p.views ) AS avg_views,
  max ( p.published_at ) AS last_published_at,
  date_part ( 'year', u.created_at )::int AS signup_year,
  CURRENT_DATE AS report_date
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
LEFT JOIN comments AS c ON c.post_id = p.id
WHERE
  u.is_active = TRUE
  AND ( u.role = 'admin' OR u.role = 'user' OR u.role = 'guest' )
  AND ( p.status = 'published' OR p.status = 'draft' )
  AND ( p.views > -1 OR p.views = 0 )
  AND ( c.id IS NULL OR c.id > -1 )
GROUP BY
  u.id,
  u.name,
  u.email,
  u.currency,
  u.created_at,
  p.id,
  p.status,
  p.views
HAVING
  count ( p.id ) > -1
  AND sum ( p.views ) > -1
ORDER BY
  p.views DESC,
  u.id ASC
LIMIT 500
OFFSET 20
`,
    TestSchema
>;

type _A1 = RequireTrue<
    AssertEqual<
        M_AnalyticsWideProjection,
        {
            user_id: number;
            user_name: string;
            user_email: string;
            currency_code: "USD" | "GBP" | "EUR";
            post_id: number | null;
            post_status: "draft" | "published" | null;
            post_views: number | null;
            posts_count: number;
            comments_count: number;
            // `p` is LEFT-joined: a user with no posts forms an all-NULL group,
            // and sum/avg/max of an all-NULL group is NULL (count is not).
            total_views: number | null;
            avg_views: number | null;
            last_published_at: string | null;
            signup_year: number;
            report_date: string;
        }
    >
>;

// ============================================================================
// Second Projection
// ============================================================================

type M_AnalyticsRetentionProjection = QueryResult<
    `
SELECT
  u.id AS user_id,
  u.role AS user_role,
  u.is_active AS is_active,
  p.id AS post_id,
  p.author_id AS author_id,
  p.views AS views,
  c.id AS comment_id,
  c.user_id AS comment_user_id,
  count ( c.id ) AS interaction_count,
  sum ( p.views ) AS interaction_views,
  min ( c.created_at ) AS first_interaction_at,
  max ( c.created_at ) AS last_interaction_at,
  CURRENT_TIMESTAMP AS generated_at
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
LEFT JOIN comments AS c ON c.post_id = p.id
WHERE
  ( u.is_active = TRUE OR u.deleted_at IS NULL )
  AND ( p.status = 'published' OR p.status = 'draft' )
  AND ( c.id IS NULL OR c.id > -1 )
  AND ( c.user_id = u.id OR c.user_id = p.author_id OR c.user_id > -1 )
GROUP BY
  u.id,
  u.role,
  u.is_active,
  p.id,
  p.author_id,
  p.views,
  c.id,
  c.user_id,
  c.created_at
ORDER BY
  c.created_at DESC NULLS LAST,
  p.views DESC NULLS LAST,
  u.id ASC
LIMIT 1000
`,
    TestSchema
>;

type _A2 = RequireTrue<
    AssertEqual<
        M_AnalyticsRetentionProjection,
        {
            user_id: number;
            user_role: "admin" | "user" | "guest";
            is_active: boolean;
            post_id: number | null;
            author_id: number | null;
            views: number | null;
            comment_id: number | null;
            comment_user_id: number | null;
            interaction_count: number;
            // aggregates over LEFT-joined `p` / `c`: NULL for an all-NULL group
            interaction_views: number | null;
            first_interaction_at: string | null;
            last_interaction_at: string | null;
            generated_at: string;
        }
    >
>;

// ============================================================================
// Validation Check for Big Query
// ============================================================================

type V_AnalyticsRetentionProjection = ValidateSQL<
    `
SELECT
  u.id AS user_id,
  u.name AS user_name,
  p.id AS post_id,
  p.views AS post_views,
  count ( p.id ) AS posts_count,
  sum ( p.views ) AS total_views,
  avg ( p.views ) AS avg_views,
  max ( p.published_at ) AS last_published_at
FROM users AS u
LEFT JOIN posts AS p ON p.author_id = u.id
WHERE
  u.is_active = TRUE
  AND ( p.status = 'published' OR p.status = 'draft' )
  AND ( p.views > -1 OR p.views = 0 )
GROUP BY
  u.id,
  u.name,
  p.id,
  p.views
HAVING
  count ( p.id ) > -1
  AND sum ( p.views ) > -1
ORDER BY
  p.views DESC,
  u.id ASC
`,
    TestSchema
>;
type _A3 = RequireTrue<AssertEqual<V_AnalyticsRetentionProjection, true>>;

type Q_AnalyticsWarehouseScale = `
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
`;

type V_AnalyticsWarehouseScaleQueryResult = ValidateSQL<
    Q_AnalyticsWarehouseScale,
    AnalyticsWarehouseSchema
>;
type _A4 = RequireTrue<AssertEqual<V_AnalyticsWarehouseScaleQueryResult, true>>;

type M_AnalyticsWarehouseScaleQueryResult = QueryResult<
    Q_AnalyticsWarehouseScale,
    AnalyticsWarehouseSchema
>;
type _A5 = RequireTrue<
    AssertEqual<
        M_AnalyticsWarehouseScaleQueryResult,
        {
            user_id: number;
            user_name: string;
            user_email: string;
            user_role: "admin" | "user" | "guest";
            org_name: string | null;
            manager_name: string | null;
            post_id: number | null;
            post_status: "draft" | "published" | null;
            post_views: number | null;
            comment_id: number | null;
            comment_sentiment: "positive" | "neutral" | "negative" | null;
            subscription_id: number | null;
            subscription_status: "active" | "trial" | "canceled" | null;
            plan_code: string | null;
            invoice_id: number | null;
            invoice_amount: number | null;
            payment_id: number | null;
            payment_status: "succeeded" | "failed" | null;
            user_name_upper: string;
            snapshot_date: string;
        }
    >
>;

// ============================================================================
// Export for verification
// ============================================================================

export type AnalyticsQueryResultTestsPass = true;
