import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return (await import('./sentry-options')).sentryOptions
}

afterEach(() => vi.unstubAllEnvs())

describe('sentryOptions (ARCHITECTURE §16.3)', () => {
  it('stays off without a DSN', async () => {
    const sentryOptions = await load({ NEXT_PUBLIC_SENTRY_DSN: '' })
    expect(sentryOptions('production')).toMatchObject({ enabled: false, dsn: undefined })
  })

  it('tags the environment from VERCEL_ENV and sends no default PII', async () => {
    const sentryOptions = await load({ NEXT_PUBLIC_SENTRY_DSN: 'https://abc@o1.ingest.us.sentry.io/2' })
    expect(sentryOptions('preview')).toMatchObject({ enabled: true, environment: 'preview', sendDefaultPii: false, tracesSampleRate: 0 })
    expect(sentryOptions(undefined).environment).toBe('development')
  })
})
