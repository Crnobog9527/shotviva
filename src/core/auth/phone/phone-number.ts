// Pure, so the browser's field check uses it too. Mainland China mobile numbers only (ARCHITECTURE §7, T63): +86, then 11 digits starting 1[3-9].
// Supabase stores a phone as E.164 digits without the '+' (8614000005678); the browser sends
// whatever the visitor typed into the field after the fixed +86.

// How long a code works: the Phone OTP expiry set in Supabase (ARCHITECTURE §7). Shown on the code
// step and sent with the SMS (the Aliyun template's `min`).
export const SMS_CODE_MINUTES = 5

export type MainlandPhone = {
  // '+8614000005678', what signInWithOtp / verifyOtp take.
  e164: string
  // '8614000005678', how auth.users.phone and the hook payload carry it.
  digits: string
  // '14000005678', what a mainland SMS provider is given.
  national: string
}

const NATIONAL = /^1[3-9]\d{9}$/

// Accepts the national number with spaces or dashes, or the same with a +86 / 0086 / 86 prefix.
export function parseMainlandPhone(input: string | null | undefined): MainlandPhone | null {
  if (typeof input !== 'string') return null
  let digits = input.trim().replace(/[\s-]/g, '')
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+86')) return null
    digits = digits.slice(3)
  } else if (digits.startsWith('0086')) {
    digits = digits.slice(4)
  } else if (digits.length === 13 && digits.startsWith('86')) {
    digits = digits.slice(2)
  }
  if (!NATIONAL.test(digits)) return null
  return { e164: `+86${digits}`, digits: `86${digits}`, national: digits }
}

// The stored form (auth.users.phone, the hook payload): digits only, with the 86.
export function parseStoredPhone(stored: string | null | undefined): MainlandPhone | null {
  if (typeof stored !== 'string' || !/^86\d{11}$/.test(stored)) return null
  return parseMainlandPhone(`+${stored}`)
}

// 140****5678 for the account page and anywhere a number is shown back; '' when not mainland.
export function maskPhone(stored: string | null | undefined): string {
  const phone = parseStoredPhone(stored?.replace(/^\+/, ''))
  if (!phone) return ''
  return `${phone.national.slice(0, 3)}****${phone.national.slice(7)}`
}
