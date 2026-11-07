import { describe, expect, it } from 'vitest'

import { feishuConfig } from './alerts-env'

const url = 'https://open.feishu.cn/open-apis/bot/v2/hook/0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d'

describe('feishuConfig', () => {
  it('is off, silently, when neither is set', () => {
    expect(feishuConfig({})).toEqual({ config: null, problem: null })
  })

  it('needs both, and only a Feishu or Lark bot address', () => {
    expect(feishuConfig({ FEISHU_ALERT_WEBHOOK_URL: url, FEISHU_ALERT_SECRET: 's' })).toEqual({ config: { webhookUrl: url, secret: 's' }, problem: null })
    expect(feishuConfig({ FEISHU_ALERT_WEBHOOK_URL: url }).problem).toMatch(/both/)
    expect(feishuConfig({ FEISHU_ALERT_SECRET: 's' }).problem).toMatch(/both/)
    expect(feishuConfig({ FEISHU_ALERT_WEBHOOK_URL: 'https://example.com/hook', FEISHU_ALERT_SECRET: 's' }).config).toBeNull()
    const lark = 'https://open.larksuite.com/open-apis/bot/v2/hook/abc'
    expect(feishuConfig({ FEISHU_ALERT_WEBHOOK_URL: lark, FEISHU_ALERT_SECRET: 's' }).config?.webhookUrl).toBe(lark)
  })
})
