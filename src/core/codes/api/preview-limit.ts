import 'server-only'

import { AppError } from '../../errors'

// One warm instance also throttles lookups when running locally. The Vercel WAF rule uses
// the same budget across instances. Keys live only in memory, for at most the current minute.
const counts = new Map<string, number>()
const maximumKeys = 4096
let window = -1

export function checkPreviewLimit(ip: string | null, now = Date.now()) {
  const minute = Math.floor(now / 60_000)
  if (window !== minute) {
    counts.clear()
    window = minute
  }
  const key = ip ?? 'unknown'
  const count = counts.get(key) ?? 0
  if (count >= 30) throw new AppError('RATE_LIMITED', 'Too many code previews')
  if (!count && counts.size >= maximumKeys) {
    const oldest = counts.keys().next()
    if (!oldest.done) counts.delete(oldest.value)
  }
  counts.set(key, count + 1)
}
