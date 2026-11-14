import 'server-only'

import { aliyunSmsSender } from './aliyun'
import { fakeSmsSender } from './fake'
import type { SmsEnv } from './sms-env'
import type { SmsSender } from './types'

export type SenderChoice = { sender: SmsSender } | { problem: string }

const ALIYUN_KEYS = ['ALIYUN_SMS_ACCESS_KEY_ID', 'ALIYUN_SMS_ACCESS_KEY_SECRET', 'ALIYUN_SMS_SIGN_NAME', 'ALIYUN_SMS_TEMPLATE_CODE'] as const

// The adapter SMS_PROVIDER names. `problem` is for the log: names only, never values.
export function smsSenderFor(env: SmsEnv): SenderChoice {
  switch (env.SMS_PROVIDER) {
    case undefined:
      return { problem: 'SMS_PROVIDER is not set' }
    case 'fake':
      // Real visitors would wait for a code that never comes.
      if (env.VERCEL_ENV === 'production') return { problem: 'SMS_PROVIDER=fake is refused in production' }
      return { sender: fakeSmsSender() }
    case 'aliyun': {
      const accessKeyId = env.ALIYUN_SMS_ACCESS_KEY_ID
      const accessKeySecret = env.ALIYUN_SMS_ACCESS_KEY_SECRET
      const signName = env.ALIYUN_SMS_SIGN_NAME
      const templateCode = env.ALIYUN_SMS_TEMPLATE_CODE
      if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
        return { problem: `missing ${ALIYUN_KEYS.filter((key) => !env[key]).join(', ')}` }
      }
      return { sender: aliyunSmsSender({ accessKeyId, accessKeySecret, signName, templateCode }) }
    }
  }
}
