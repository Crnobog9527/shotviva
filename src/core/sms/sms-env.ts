import { z } from 'zod'

// Phone sign-in (T63), merged into core/env.ts. All optional at parse time, so the site builds
// and runs without them; only the Send SMS hook needs them, and it answers 503 (and logs which
// name is missing) instead of failing the whole site when one is absent (sender.ts).

const blankAsUnset = (value: unknown) => (value === '' ? undefined : value)
const optionalSecret = z.preprocess(blankAsUnset, z.string().min(1).optional())

export const SMS_PROVIDERS = ['fake', 'aliyun'] as const
export type SmsProvider = (typeof SMS_PROVIDERS)[number]

export const smsEnvShape = {
  // Which adapter sends the code: fake (previews, local, tests; refused in production) or aliyun
  // (Phone Number Verification Service, SendSmsVerifyCode).
  SMS_PROVIDER: z.preprocess(blankAsUnset, z.enum(SMS_PROVIDERS).optional()),
  // The Send SMS hook secret Supabase shows (v1,whsec_…); one per Supabase project.
  SEND_SMS_HOOK_SECRET: z.preprocess(blankAsUnset, z.string().regex(/^(v1,)?whsec_[A-Za-z0-9+/=]+$/).optional()),
  // Alibaba Cloud SMS verification (SMS_PROVIDER=aliyun, Dypnsapi SendSmsVerifyCode): a RAM user's
  // AccessKey allowed only to send SMS verification codes, the gifted signature name and its
  // paired template code (variables `code` and `min`).
  ALIYUN_SMS_ACCESS_KEY_ID: optionalSecret,
  ALIYUN_SMS_ACCESS_KEY_SECRET: optionalSecret,
  ALIYUN_SMS_SIGN_NAME: optionalSecret,
  ALIYUN_SMS_TEMPLATE_CODE: optionalSecret,
}

export type SmsEnv = {
  VERCEL_ENV?: 'production' | 'preview' | 'development'
  SMS_PROVIDER?: SmsProvider
  ALIYUN_SMS_ACCESS_KEY_ID?: string
  ALIYUN_SMS_ACCESS_KEY_SECRET?: string
  ALIYUN_SMS_SIGN_NAME?: string
  ALIYUN_SMS_TEMPLATE_CODE?: string
}
