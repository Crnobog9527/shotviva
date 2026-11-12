import { describe, expect, it } from 'vitest'

import { parseServerEnv, syncPrivateBucket } from './env'

describe('parseServerEnv', () => {
  it('applies defaults', () => {
    expect(parseServerEnv({}).NODE_ENV).toBe('development')
  })

  it('names the bad key without echoing its value', () => {
    expect(() => parseServerEnv({ NODE_ENV: 'staging-secret' })).toThrow(/NODE_ENV/)
    expect(() => parseServerEnv({ NODE_ENV: 'staging-secret' })).not.toThrow(/staging-secret/)
  })
})

describe('service keys', () => {
  it('are optional at parse time', () => {
    expect(parseServerEnv({}).SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
  })
})

describe('storage and provider keys', () => {
  it('treat blank values as unset and default the image model', () => {
    const env = parseServerEnv({ R2_BUCKET: '', OPENAI_API_KEY: '', OPENAI_IMAGE_MODEL: '', VERCEL_ENV: '' })
    expect(env.R2_BUCKET).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.VERCEL_ENV).toBeUndefined()
    expect(env.OPENAI_IMAGE_MODEL).toBe('gpt-image-2.5-sunburst')
  })
})

describe('Sentry build keys', () => {
  it('are optional and treat blanks as unset', () => {
    const env = parseServerEnv({ SENTRY_AUTH_TOKEN: '', SENTRY_ORG: 'graylum', SENTRY_PROJECT: 'shotviva-preview' })
    expect(env.SENTRY_AUTH_TOKEN).toBeUndefined()
    expect(env).toMatchObject({ SENTRY_ORG: 'graylum', SENTRY_PROJECT: 'shotviva-preview' })
  })
})

describe('Stripe keys', () => {
  it('are optional, treat blanks as unset and default Managed Payments on', () => {
    const env = parseServerEnv({ STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_MANAGED_PAYMENTS: '' })
    expect(env.STRIPE_SECRET_KEY).toBeUndefined()
    expect(env.STRIPE_WEBHOOK_SECRET).toBeUndefined()
    expect(env.STRIPE_MANAGED_PAYMENTS).toBe('on')
  })

  it('default WeChat Pay off (T73): unset or blank is off, only on / off are taken', () => {
    expect(parseServerEnv({}).STRIPE_WECHAT_PAY).toBe('off')
    expect(parseServerEnv({ STRIPE_WECHAT_PAY: '' }).STRIPE_WECHAT_PAY).toBe('off')
    expect(parseServerEnv({ STRIPE_WECHAT_PAY: 'on' }).STRIPE_WECHAT_PAY).toBe('on')
    expect(() => parseServerEnv({ STRIPE_WECHAT_PAY: 'yes' })).toThrow(/STRIPE_WECHAT_PAY/)
  })

  it('refuse a value that is not a Stripe key, naming only the key', () => {
    expect(() => parseServerEnv({ STRIPE_SECRET_KEY: 'pk_test_123' })).toThrow(/STRIPE_SECRET_KEY/)
    expect(() => parseServerEnv({ STRIPE_SECRET_KEY: 'pk_test_123' })).not.toThrow(/pk_test_123/)
    expect(() => parseServerEnv({ STRIPE_WEBHOOK_SECRET: 'secret' })).toThrow(/STRIPE_WEBHOOK_SECRET/)
  })
})

describe('template sync private bucket', () => {
  it('accepts only production\'s own private bucket, and reads unset or empty as none', () => {
    expect(syncPrivateBucket('shotviva-production')).toBe('shotviva-production')
    expect(syncPrivateBucket(undefined)).toBeUndefined()
    expect(syncPrivateBucket('')).toBeUndefined()
  })

  it.each(['shotviva-assets', 'shotviva-assets-preview', 'shotviva-preview', 'shotviva-production-old', ' shotviva-production'])(
    'rejects %j', (bucket) => {
      expect(() => syncPrivateBucket(bucket)).toThrow()
    })
})
