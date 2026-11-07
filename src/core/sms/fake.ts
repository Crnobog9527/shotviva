import type { SmsMessage, SmsResult, SmsSender } from './types'

// SMS_PROVIDER=fake: sends nothing and answers ok, for tests, local runs and QA on previews
// (sender.ts refuses it in production). Tests pass `outbox` to see what would have gone out.
export function fakeSmsSender(outbox?: SmsMessage[]): SmsSender {
  return {
    name: 'fake',
    async send(message): Promise<SmsResult> {
      outbox?.push(message)
      return { ok: true }
    },
  }
}
