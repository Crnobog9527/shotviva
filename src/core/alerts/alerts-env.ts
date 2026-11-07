import { z } from 'zod'

// Owner business alerts (ARCHITECTURE §16.4, T72), merged into core/env.ts. Both optional: unset
// means no alert is sent (previews by default). The URL is checked where it is used (feishuConfig)
// rather than here, so a mistyped value turns alerts off instead of failing every server request.

const blankAsUnset = (value: unknown) => (value === '' ? undefined : value)
const optionalSecret = z.preprocess(blankAsUnset, z.string().min(1).optional())

export const alertsEnvShape = {
  // The Feishu group custom bot's webhook address (it carries the bot's token: a secret).
  FEISHU_ALERT_WEBHOOK_URL: optionalSecret,
  // The bot's signing secret (安全设置 → 签名校验).
  FEISHU_ALERT_SECRET: optionalSecret,
}

export type FeishuConfig = { webhookUrl: string; secret: string }

export type AlertsEnv = { FEISHU_ALERT_WEBHOOK_URL?: string; FEISHU_ALERT_SECRET?: string }

const WEBHOOK = /^https:\/\/open\.(feishu\.cn|larksuite\.com)\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]+$/

export type ConfigCheck = { config: FeishuConfig | null; problem: string | null }

// problem: why a half-set environment sends nothing (logged once by the notifier; never the values).
export function feishuConfig(env: AlertsEnv): ConfigCheck {
  const url = env.FEISHU_ALERT_WEBHOOK_URL
  const secret = env.FEISHU_ALERT_SECRET
  if (!url && !secret) return { config: null, problem: null }
  if (!url || !secret) return { config: null, problem: 'FEISHU_ALERT_WEBHOOK_URL and FEISHU_ALERT_SECRET must both be set' }
  if (!WEBHOOK.test(url)) return { config: null, problem: 'FEISHU_ALERT_WEBHOOK_URL is not a Feishu custom bot webhook address' }
  return { config: { webhookUrl: url, secret }, problem: null }
}
