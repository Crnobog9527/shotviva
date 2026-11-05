import { describe, expect, it } from 'vitest'

import { parseServerEnv } from './env'

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
