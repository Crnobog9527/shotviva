import 'server-only'
import { z } from 'zod'

import { alertsEnvShape } from './alerts/alerts-env'
import { sentryBuildEnvSchema } from './build-env'
import { previewHostsShape } from './preview-hosts'
import { indexingEnvSchema } from './seo/indexing-env'
import { smsEnvShape } from './sms/sms-env'
import { assetsEnvShape, checkAssetsEnv } from './storage/assets-env'
import { checkWaffoEnv, waffoEnvShape } from './waffo-env'

// `KEY=` lines in .env files arrive as '' — treat them as unset rather than invalid.
const blankAsUnset = (value: unknown) => (value === '' ? undefined : value)
const optionalSecret = z.preprocess(blankAsUnset, z.string().min(1).optional())

// Server-side variables. Later task cards add their keys here; nothing else
// in the codebase may read process.env directly (enforced by ESLint).
const serverEnvSchema = z.object({
  CRON_SECRET: optionalSecret,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Optional at parse time so `next build` runs without secrets; createAdminSupabase() requires it.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // Set by Vercel; dev-only pages (e.g. /generate/upload-test) 404 when it is 'production'.
  VERCEL_ENV: z.preprocess(blankAsUnset, z.enum(['production', 'preview', 'development']).optional()),
  // Test-site aliases answered on their own host (core/request-origin); preview only.
  ...previewHostsShape,
  // Cloudflare R2 (S3 API). One private bucket per environment (ARCHITECTURE §8.3);
  // optional at parse time, required by core/storage's r2Store().
  R2_ACCOUNT_ID: optionalSecret,
  R2_ACCESS_KEY_ID: optionalSecret,
  R2_SECRET_ACCESS_KEY: optionalSecret,
  R2_BUCKET: optionalSecret,
  // Public assets bucket for template covers only (ARCHITECTURE §8.3: shotviva-assets, preview
  // shotviva-assets-preview), same account and keys. Required by the admin cover upload.
  R2_PUBLIC_BUCKET: optionalSecret,
  // R2_PUBLIC_ORIGIN (the bucket's r2.dev origin, behind the site's /assets rewrite) and the cover
  // base URL; the origin is required when the base is the site's own /assets (T51).
  ...assetsEnvShape,
  // OpenAI image provider (modules/image/provider); the key is required on first use.
  OPENAI_API_KEY: optionalSecret,
  OPENAI_IMAGE_MODEL: z.preprocess(blankAsUnset, z.string().min(1).default('gpt-image-2.5-sunburst')),
  // OpenAI Moderation API for public works (ARCHITECTURE §9 第 5 条, T108). Unset → OPENAI_API_KEY;
  // neither set → no automatic screen, so every public work waits for a person.
  OPENAI_MODERATION_API_KEY: optionalSecret,
  // Partner key Graylum sends as `Authorization: Bearer …` (ARCHITECTURE §14.3). A different
  // value per Vercel environment: `sv_live_…` in production, `sv_test_…` everywhere else
  // (core/partner/partner-auth.ts rejects the wrong kind). Unset → every partner call is 401.
  GRAYLUM_PARTNER_KEY: optionalSecret,
  // Stripe (T9, ARCHITECTURE §6.3). Test-mode keys everywhere but production; core/billing/stripe
  // refuses a live key outside production. Optional at parse time, required on first use.
  // Prices are found by lookup_key, so there are no Price id variables.
  STRIPE_SECRET_KEY: z.preprocess(blankAsUnset, z.string().regex(/^(sk|rk)_(test|live)_/).optional()),
  // Signing secret of the webhook endpoint registered for this environment (whsec_…).
  STRIPE_WEBHOOK_SECRET: z.preprocess(blankAsUnset, z.string().startsWith('whsec_').optional()),
  // Cards go through Managed Payments (Link is merchant of record). 'off' is the fallback until
  // Stripe approves Managed Payments on the live account: cards then use a plain Checkout.
  STRIPE_MANAGED_PAYMENTS: z.preprocess(blankAsUnset, z.enum(['on', 'off']).default('on')),
  // WeChat Pay beside Alipay on the wallet checkout (T73): Checkout params, the paywall / pricing
  // labels, the zh pricing FAQ and the legal copy all follow it. Off (unset) is the pre-T73 site,
  // Alipay alone; turn it on per environment once Stripe has approved WeChat Pay there.
  STRIPE_WECHAT_PAY: z.preprocess(blankAsUnset, z.enum(['on', 'off']).default('off')),
  // T82: Checkout's required Terms of Service box. Off until the Owner has set the Terms URL in
  // Stripe's public business details for that mode: without it Stripe refuses the session (400).
  STRIPE_TERMS_CONSENT: z.preprocess(blankAsUnset, z.enum(['on', 'off']).default('off')),
  // Switches the wishlist on for validation outside production (core/wishlist isWishlistEnabled).
  // Ignored when VERCEL_ENV is 'production', so it can never turn the feature on for real users.
  FEATURE_WISHLIST_PREVIEW: z.preprocess(blankAsUnset, z.enum(['on', 'off']).default('off')),
  ...waffoEnvShape,
  // Phone sign-in (T63): the SMS adapter and the Send SMS hook secret (core/sms).
  ...smsEnvShape,
  // Owner business alerts to a Feishu group bot (T72, ARCHITECTURE §16.4); unset → none sent.
  ...alertsEnvShape,
  // /admin/analytics (T74, ARCHITECTURE §16.2a): a read-only PostHog personal API key with the
  // Query Read permission, and the project it reads. Both unset → the page asks to configure them.
  POSTHOG_PERSONAL_API_KEY: optionalSecret,
  POSTHOG_PROJECT_ID: z.preprocess(blankAsUnset, z.string().regex(/^\d+$/).optional()),
  // Optional server-only Observability query access. The offline snapshot contains aggregates only.
  VERCEL_OBSERVABILITY_TOKEN: optionalSecret,
  VERCEL_OBSERVABILITY_PROJECT_ID: optionalSecret,
  VERCEL_OBSERVABILITY_TEAM_ID: optionalSecret,
  VERCEL_OBSERVABILITY_SNAPSHOT: optionalSecret,
  // hCaptcha's secret, the same one Supabase Auth holds (T86): the business inquiry form checks
  // its invisible token on our server when NEXT_PUBLIC_HCAPTCHA_SITEKEY is set too. Production with
  // the site key but no secret refuses every inquiry (core/inquiries/captcha captchaMode).
  HCAPTCHA_SECRET: optionalSecret,
})
  .extend(sentryBuildEnvSchema.shape)
  // SITE_INDEXING: the pre-launch indexing switch (ARCHITECTURE §12.0), default off.
  .extend(indexingEnvSchema.shape)
  .superRefine(checkWaffoEnv)
  .superRefine(checkAssetsEnv)

export type ServerEnv = z.infer<typeof serverEnvSchema>

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source)
  if (!result.success) {
    // Report key names only; values may be secrets.
    const keys = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid server environment: ${keys}`)
  }
  return result.data
}

let cached: ServerEnv | undefined

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}

// Only the dispatch runner invokes this reader. A normal web deployment has no sync keys.
// The template sync's dry run (2026-11-12): the preview project as both source and target, every
// write rolled back, so only the preview's service key is needed and no cover is copied.
export function templateSyncDryRunEnv() {
  return {
    ids: z.string().min(1).parse(process.env.SYNC_IDS),
    // Any number not used by a real run: the write's receipt check keys on it, and nothing is kept.
    runId: z.string().regex(/^\d+$/).parse(process.env.GITHUB_RUN_ID ?? String(Date.now())),
    serviceKey: z.string().min(1).parse(process.env.SYNC_PREVIEW_SERVICE_KEY),
  }
}

export function templateSyncEnv() {
  const endpoint = z.object({
    serviceKey: z.string().min(1), accountId: z.string().regex(/^[0-9a-f]{32}$/),
    accessKeyId: z.string().min(1), secretAccessKey: z.string().min(1),
    base: z.url({ protocol: /^https$/ }).transform(url => url.replace(/\/+$/, '')),
  })
  function read(prefix: 'SYNC_PREVIEW_' | 'SYNC_PRODUCTION_', base: string | undefined) {
    return endpoint.parse({
      serviceKey: process.env[prefix + 'SERVICE_KEY'], accountId: process.env[prefix + 'R2_ACCOUNT_ID'],
      accessKeyId: process.env[prefix + 'R2_ACCESS_KEY_ID'], secretAccessKey: process.env[prefix + 'R2_SECRET_ACCESS_KEY'],
      base,
    })
  }
  return {
    ids: z.string().min(1).parse(process.env.SYNC_IDS),
    runId: z.string().regex(/^\d+$/).parse(process.env.GITHUB_RUN_ID),
    preview: read('SYNC_PREVIEW_', process.env.SYNC_PREVIEW_ASSETS_BASE),
    production: read('SYNC_PRODUCTION_', 'https://shotviva.com/assets'),
  }
}
