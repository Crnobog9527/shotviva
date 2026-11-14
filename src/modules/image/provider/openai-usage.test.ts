import { describe, expect, it } from 'vitest'

import { parseOpenAIUsage } from './openai-usage'

describe('parseOpenAIUsage', () => {
  it('maps the Images API usage object to provider_usage', () => {
    const body = {
      data: [],
      usage: { input_tokens: 1600, input_tokens_details: { text_tokens: 100, image_tokens: 1500 }, output_tokens: 4160, total_tokens: 5760 },
    }
    expect(parseOpenAIUsage(body)).toEqual({ input_text_tokens: 100, input_image_tokens: 1500, output_tokens: 4160 })
  })

  it('keeps the parts that are there and drops malformed ones', () => {
    expect(parseOpenAIUsage({ usage: { input_tokens: 50, output_tokens: 10 } })).toEqual({ output_tokens: 10 })
    expect(parseOpenAIUsage({ usage: { input_tokens_details: { text_tokens: 7 }, output_tokens: -1 } })).toEqual({ input_text_tokens: 7 })
  })

  it('is null when the response has no usage', () => {
    expect(parseOpenAIUsage({ data: [] })).toBeNull()
    expect(parseOpenAIUsage(null)).toBeNull()
    expect(parseOpenAIUsage({ usage: 'n/a' })).toBeNull()
    expect(parseOpenAIUsage({ usage: {} })).toBeNull()
  })
})
