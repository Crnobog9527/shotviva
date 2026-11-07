import { describe, expect, it, vi } from 'vitest'

import { feishuBody, feishuSign, sendFeishu } from './feishu'

const config = { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook', secret: 'demo-secret' }

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('feishuSign', () => {
  it('matches the reference algorithm: HmacSHA256 keyed by "timestamp\\nsecret" over an empty message, base64', () => {
    // Computed with the Python sample from the Feishu custom bot guide.
    expect(feishuSign(1599360473, 'demo-secret')).toBe('3/MaVZ8JLIy4TUG+7KSFJqvUkTKd+HWY8g+56DZWq8s=')
  })

  it('puts the timestamp in seconds, as a string, next to the sign and a text message', () => {
    expect(feishuBody('你好', 'demo-secret', 1599360473_999)).toEqual({
      timestamp: '1599360473',
      sign: '3/MaVZ8JLIy4TUG+7KSFJqvUkTKd+HWY8g+56DZWq8s=',
      msg_type: 'text',
      content: { text: '你好' },
    })
  })
})

describe('sendFeishu', () => {
  const now = () => 1599360473_000

  it('posts JSON to the webhook and accepts code 0', async () => {
    const fetch = vi.fn(async () => answer({ code: 0, msg: 'success', data: {} }))
    await sendFeishu(config, '你好', { fetch: fetch as never, now })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(config.webhookUrl)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ msg_type: 'text', content: { text: '你好' }, timestamp: '1599360473' })
  })

  it('treats a non-zero code (HTTP 200) as a failure, and never names the URL', async () => {
    const fetch = vi.fn(async () => answer({ code: 19021, msg: 'sign match fail or timestamp is not within one hour from current time' }))
    const failure = sendFeishu(config, 'x', { fetch: fetch as never, now })
    await expect(failure).rejects.toThrow('code 19021')
    await expect(failure).rejects.not.toThrow('test-hook')
  })

  it('fails on HTTP errors, odd bodies and network errors', async () => {
    await expect(sendFeishu(config, 'x', { fetch: (async () => answer({}, 502)) as never, now })).rejects.toThrow('HTTP 502')
    await expect(sendFeishu(config, 'x', { fetch: (async () => new Response('<html>')) as never, now })).rejects.toThrow('unexpected body')
    const down = async () => {
      throw new TypeError(`fetch failed ${config.webhookUrl}`)
    }
    await expect(sendFeishu(config, 'x', { fetch: down as never, now })).rejects.toThrow('feishu request failed: TypeError')
  })
})
