import 'server-only'
import { timingSafeEqual, createHash } from 'node:crypto'
import { serverEnv } from '@/core/env'

const digest = (value: string) => createHash('sha256').update(value).digest()

export function authorizedCron(request: Request) {
  const secret = serverEnv().CRON_SECRET
  return Boolean(secret && timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest('Bearer ' + secret)))
}
