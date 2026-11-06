import { describe, expect, it } from 'vitest'

import { PRODUCT_IDS } from './config/define-site'
import { parseServerEnv } from './env'

// ARCHITECTURE §6.3: the nine Waffo product ids live in one JSON variable, and a missing one is
// an error at start-up, not at the first checkout of that product.

const MAP = Object.fromEntries(PRODUCT_IDS.map((id) => [id, `PROD_${id.replace('_', '')}`]))
const WAFFO = {
  PAYMENT_CHANNEL: 'waffo',
  WAFFO_MERCHANT_ID: 'MER_abc123',
  WAFFO_STORE_ID: 'STO_abc123',
  WAFFO_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  WAFFO_WEBHOOK_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----',
  WAFFO_PRODUCT_IDS: JSON.stringify(MAP),
}

const failure = (env: Record<string, string | undefined>) => {
  try {
    parseServerEnv(env)
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe('Waffo environment', () => {
  it('defaults to Stripe and needs no Waffo keys then', () => {
    const env = parseServerEnv({})
    expect(env.PAYMENT_CHANNEL).toBe('stripe')
    expect(env.WAFFO_ENVIRONMENT).toBe('test')
  })

  it('parses a complete Waffo configuration', () => {
    const env = parseServerEnv(WAFFO)
    expect(env.PAYMENT_CHANNEL).toBe('waffo')
    expect(env.WAFFO_PRODUCT_IDS).toEqual(MAP)
  })

  it('refuses a product map missing one of the nine ids, naming it', () => {
    const eight = Object.fromEntries(Object.entries(MAP).filter(([id]) => id !== 'pack_l'))
    expect(failure({ ...WAFFO, WAFFO_PRODUCT_IDS: JSON.stringify(eight) })).toMatch(/WAFFO_PRODUCT_IDS\.pack_l/)
    // Even while the paywall is on Stripe: a half-filled map is never left lying around.
    expect(failure({ WAFFO_PRODUCT_IDS: JSON.stringify(eight) })).toMatch(/WAFFO_PRODUCT_IDS\.pack_l/)
  })

  it('refuses unknown ids, non-PROD values and non-JSON', () => {
    expect(failure({ ...WAFFO, WAFFO_PRODUCT_IDS: JSON.stringify({ ...MAP, wechat: 'PROD_x' }) })).toMatch(/WAFFO_PRODUCT_IDS/)
    expect(failure({ ...WAFFO, WAFFO_PRODUCT_IDS: JSON.stringify({ ...MAP, pack_s: 'price_1' }) })).toMatch(/WAFFO_PRODUCT_IDS\.pack_s/)
    expect(failure({ ...WAFFO, WAFFO_PRODUCT_IDS: 'pack_s=PROD_1' })).toMatch(/WAFFO_PRODUCT_IDS/)
  })

  it('requires every Waffo key once the channel is Waffo, and names only the keys', () => {
    const message = failure({ PAYMENT_CHANNEL: 'waffo', WAFFO_PRIVATE_KEY: 'secret-value' })
    expect(message).toMatch(/WAFFO_MERCHANT_ID/)
    expect(message).toMatch(/WAFFO_STORE_ID/)
    expect(message).toMatch(/WAFFO_WEBHOOK_PUBLIC_KEY/)
    expect(message).toMatch(/WAFFO_PRODUCT_IDS/)
    expect(message).not.toMatch(/secret-value/)
  })

  it('allows the prod environment on the production deployment only', () => {
    expect(failure({ ...WAFFO, WAFFO_ENVIRONMENT: 'prod', VERCEL_ENV: 'preview' })).toMatch(/WAFFO_ENVIRONMENT/)
    expect(parseServerEnv({ ...WAFFO, WAFFO_ENVIRONMENT: 'prod', VERCEL_ENV: 'production' }).WAFFO_ENVIRONMENT).toBe('prod')
  })
})
