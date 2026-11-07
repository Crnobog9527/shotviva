import 'server-only'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { acsDate, signRequest } from './aliyun-sign'
import type { SmsResult, SmsSender } from './types'

// SMS_PROVIDER=aliyun: Alibaba Cloud Phone Number Verification Service, "SMS verification"
// (Dypnsapi SendSmsVerifyCode, 2017-05-25; ARCHITECTURE §7, Owner 2026-11-07). Works on a
// personal real-name account, with the signature Aliyun gifts and its paired template (neither
// is Shotviva's or editable). Supabase makes the code: it goes in TemplateParam as `code`, with
// `min` for how long it works, so Aliyun only delivers it. Aliyun cannot check a code it did not
// make, so verification stays with Supabase verifyOtp (never CheckSmsVerifyCode), and the code
// is not asked back in the response. SendSmsVerifyCode is the only action this adapter calls: the
// production RAM user is allowed nothing else. The signature and template come from env only.
// https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode

export const ALIYUN_SMS_HOST = 'dypnsapi.aliyuncs.com'

export type AliyunSmsConfig = {
  accessKeyId: string
  accessKeySecret: string
  // The gifted signature name and its paired template code, from the console.
  signName: string
  templateCode: string
}

type Deps = { fetch?: typeof fetch; now?: () => Date; nonce?: () => string }

const responseSchema = z.object({ Code: z.string() })

// "Not this number, not now" rather than a broken setup (the reference's error table): the
// number's daily cap (BUSINESS_LIMIT_CONTROL), the frequency check (FREQUENCY_FAIL) and a number
// it will not deliver to. Both spellings (with and without isv.) are accepted. Anything else
// (permissions, parameters, FUNCTION_NOT_OPENED, balance) is a setup failure, logged by its code.
// Either way the visitor sees one plain line (AUTH_SMS_FAILED), never Aliyun's text.
const REJECTED = new Set(['BUSINESS_LIMIT_CONTROL', 'FREQUENCY_FAIL', 'MOBILE_NUMBER_ILLEGAL'])
const rejected = (code: string) => REJECTED.has(code.replace(/^isv\./, ''))

// Supabase waits at most 5 seconds for the hook; give up first so the hook still answers with a
// clear failure instead of Supabase timing out on its own.
const TIMEOUT_MS = 3500

export function aliyunSmsSender(config: AliyunSmsConfig, deps: Deps = {}): SmsSender {
  const doFetch = deps.fetch ?? fetch
  return {
    name: 'aliyun',
    async send({ to, code, validMinutes }): Promise<SmsResult> {
      const { query, headers } = signRequest({
        host: ALIYUN_SMS_HOST,
        action: 'SendSmsVerifyCode',
        version: '2017-05-25',
        params: {
          CountryCode: '86',
          PhoneNumber: to.national,
          SignName: config.signName,
          TemplateCode: config.templateCode,
          TemplateParam: JSON.stringify({ code, min: String(validMinutes) }),
          ReturnVerifyCode: 'false',
        },
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        date: acsDate((deps.now ?? (() => new Date()))()),
        nonce: (deps.nonce ?? randomUUID)(),
      })
      try {
        const response = await doFetch(`https://${ALIYUN_SMS_HOST}/?${query}`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        // Refusals come back as HTTP 400 with the same JSON body, so read the body either way.
        const parsed = responseSchema.safeParse(await response.json().catch(() => null))
        if (!parsed.success) return { ok: false, reason: 'failed', providerCode: `http_${response.status}` }
        if (parsed.data.Code === 'OK') return { ok: true }
        return { ok: false, reason: rejected(parsed.data.Code) ? 'rejected' : 'failed', providerCode: parsed.data.Code }
      } catch {
        return { ok: false, reason: 'failed', providerCode: 'network' }
      }
    },
  }
}
