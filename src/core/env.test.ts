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

describe('storage and provider keys', () => {
  it('treat blank values as unset and default the image model', () => {
    const env = parseServerEnv({ R2_BUCKET: '', OPENAI_API_KEY: '', OPENAI_IMAGE_MODEL: '', VERCEL_ENV: '' })
    expect(env.R2_BUCKET).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.VERCEL_ENV).toBeUndefined()
    expect(env.OPENAI_IMAGE_MODEL).toBe('gpt-image-2.5-sunburst')
  })
})
