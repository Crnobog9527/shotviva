// The SMS sending side of phone sign-in (ARCHITECTURE §7, T63). Supabase makes the code and checks
// it; the Send SMS hook hands it to one of these adapters. Which one is SMS_PROVIDER's call, so
// the rest of the code never names a provider. Adding one = a file with a `SmsSender` factory
// plus a line in sender.ts and the env enum.
//
// An adapter must never log, store or report the code; only its own status codes leave it.

export type SmsRecipient = {
  // '+8614000005678'
  e164: string
  // '14000005678', the form mainland providers take
  national: string
}

// `validMinutes`: how long the code works, for templates that say so.
export type SmsMessage = { to: SmsRecipient; code: string; validMinutes: number }

export type SmsResult =
  | { ok: true }
  // rejected: the provider refused this one (its own frequency cap, a number it will not
  // serve); failed: anything else (network, credentials, balance). `providerCode` is the
  // provider's status word for the log, never its message text.
  | { ok: false; reason: 'rejected' | 'failed'; providerCode?: string }

export interface SmsSender {
  readonly name: string
  send(message: SmsMessage): Promise<SmsResult>
}
