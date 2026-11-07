import { createHash } from 'node:crypto'

import type { MainlandPhone } from './phone-number'

// The rate-limit key (public.sms_sends, 0440): the number itself is never stored there.
export function phoneKey(phone: MainlandPhone): string {
  return createHash('sha256').update(phone.digits).digest('hex')
}
