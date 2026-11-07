import { createHmac } from 'node:crypto'

import { z } from 'zod'

import type { FeishuConfig } from './alerts-env'

// Feishu group custom bot (open.feishu.cn「自定义机器人使用指南」): POST JSON to the webhook. With
// 签名校验 on, the body carries `timestamp` (Unix seconds, within an hour of Feishu's clock) and
// `sign` = Base64(HmacSHA256(key = `${timestamp}\n${secret}`, message = empty)). Feishu answers
// HTTP 200 even when it refuses; the body's `code` is 0 only on success (19021: bad signature,
// 11232: rate limited, 9499: bad request). Limits: 100 a minute, 5 a second per bot.

export const FEISHU_TIMEOUT_MS = 3000

export function feishuSign(timestampSeconds: number, secret: string): string {
  return createHmac('sha256', `${timestampSeconds}\n${secret}`).update('').digest('base64')
}

export function feishuBody(text: string, secret: string, nowMs: number) {
  const timestamp = Math.floor(nowMs / 1000)
  return { timestamp: String(timestamp), sign: feishuSign(timestamp, secret), msg_type: 'text', content: { text } }
}

const answerSchema = z.object({ code: z.number(), msg: z.string().optional() })

// Feishu's "too many requests" codes (system pressure / per-bot frequency).
const RATE_LIMITED = new Set([11232])

// The message never names the URL: it carries the bot's token. `definite`: Feishu answered, so
// the message was certainly not posted. A timeout or a dropped connection is not definite: the
// message may have arrived, and the caller must not assume it did not.
export class FeishuError extends Error {
  override readonly name = 'FeishuError'
  constructor(
    message: string,
    readonly definite: boolean,
    readonly rateLimited = false,
  ) {
    super(message)
  }
}

export type FeishuDeps = { fetch: typeof fetch; now: () => number }

async function post(config: FeishuConfig, text: string, deps: FeishuDeps): Promise<Response> {
  try {
    return await deps.fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feishuBody(text, config.secret, deps.now())),
      signal: AbortSignal.timeout(FEISHU_TIMEOUT_MS),
    })
  } catch (error) {
    throw new FeishuError(`feishu request failed: ${error instanceof Error ? error.name : 'unknown'}`, false)
  }
}

export async function sendFeishu(config: FeishuConfig, text: string, deps: FeishuDeps): Promise<void> {
  const response = await post(config, text, deps)
  if (!response.ok) throw new FeishuError(`feishu answered HTTP ${response.status}`, true, response.status === 429)
  const answer = answerSchema.safeParse(await response.json().catch(() => null))
  // A 2xx we cannot read: it may well have been posted.
  if (!answer.success) throw new FeishuError('feishu answered an unexpected body', false)
  const { code, msg } = answer.data
  if (code !== 0) throw new FeishuError(`feishu refused the message: code ${code} ${msg ?? ''}`.trim(), true, RATE_LIMITED.has(code))
}
