import 'server-only'
import { timingSafeEqual, createHash } from 'node:crypto'
import { serverEnv } from '@/core/env'

const digest = (value: string) => createHash('sha256').update(value).digest()

// `Authorization: Bearer <secret>`, compared in constant time (equal-length digests). An unset
// secret never matches.
export function bearerAuthorized(request: Request, secret: string | undefined) {
  return Boolean(secret && timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest('Bearer ' + secret)))
}

export function authorizedCron(request: Request) {
  return bearerAuthorized(request, serverEnv().CRON_SECRET)
}
