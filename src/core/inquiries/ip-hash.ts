import 'server-only'

import { createHmac } from 'node:crypto'
import { isIPv4, isIPv6 } from 'node:net'

// ARCHITECTURE §10.c: the visitor's IP is never stored, only this keyed digest for the per-IP
// limits. A plain sha256 of an IPv4 address can be reversed by trying all 2^32; an HMAC under a
// server secret cannot. The key is derived from the service-role key (never stored or sent), so
// no new secret has to be set up; rotating that key only resets the limits' memory.
export function inquiryIpHash(ip: string | null, serverSecret: string): string | null {
  const network = ip ? limitKey(ip) : null
  if (!network) return null
  const key = createHmac('sha256', serverSecret).update('shotviva:business-inquiry:ip').digest()
  return createHmac('sha256', key).update(network).digest('hex')
}

// What one "IP" is for the limits: an IPv4 address as is; an IPv6 address by its /64, since one
// connection usually gets a whole /64 and could otherwise send from a fresh address each time.
// An IPv4-mapped IPv6 address (::ffff:a.b.c.d) counts as that IPv4 address.
export function limitKey(ip: string): string | null {
  const address = ip.split('%')[0] ?? ''
  if (isIPv4(address)) return address
  if (!isIPv6(address)) return null
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped?.[1] && isIPv4(mapped[1])) return mapped[1]
  const groups = expandIPv6(address)
  return `${groups.slice(0, 4).join(':')}::/64`
}

// An embedded dotted IPv4 tail (::1.2.3.4) as its two hex groups.
function hexTail(address: string): string {
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address)
  if (!dotted) return address
  const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number]
  return `${address.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
}

// Eight 4-digit lowercase groups.
function expandIPv6(address: string): string[] {
  const [head = '', tail] = hexTail(address.toLowerCase()).split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const middle = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0')
  return [...left, ...middle, ...right].map((group) => group.padStart(4, '0'))
}
