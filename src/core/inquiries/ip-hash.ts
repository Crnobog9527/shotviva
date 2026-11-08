import 'server-only'

import { createHmac } from 'node:crypto'

// ARCHITECTURE §10.c: the visitor's IP is never stored, only this keyed digest for the per-IP
// limits. A plain sha256 of an IPv4 address can be reversed by trying all 2^32; an HMAC under a
// server secret cannot. The key is derived from the service-role key (never stored or sent), so
// no new secret has to be set up; rotating that key only resets the limits' memory.
export function inquiryIpHash(ip: string | null, serverSecret: string): string | null {
  if (!ip) return null
  const key = createHmac('sha256', serverSecret).update('shotviva:business-inquiry:ip').digest()
  return createHmac('sha256', key).update(ip).digest('hex')
}
