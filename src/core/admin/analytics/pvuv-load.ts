import 'server-only'

import { cacheLife } from 'next/cache'

import { logger } from '../../logger'
import { pvuvReadAccess } from './access'
import { pvuvBreakdown, pvuvFunnel, pvuvFunnels, pvuvOverview, type PvuvBreakdown, type PvuvFunnel, type PvuvOverview, type PvuvPeriod } from './pvuv-read'
import type { Range } from './range'

// PVUV.ai's half of 「总览」 and 「漏斗」 while PostHog is off (ARCHITECTURE §5.1g). Each read is
// cached on its own like the page's other blocks (10 minutes); a failure throws inside the cache,
// so it is not kept, and becomes 'failed' for that read only. Unset PVUV_SITE / PVUV_READ_TOKEN
// is 'unconfigured'. PVUV counts days in its site's timezone, not the database's Beijing days.

export type PvuvState<T> = { status: 'unconfigured' } | { status: 'failed' } | { status: 'ok'; data: T }
export type PvuvFunnelReport = { id: string; name: string; funnel: PvuvState<PvuvFunnel> }

export const PVUV_PERIOD: Record<Range, PvuvPeriod> = { today: 'today', '7d': '7d', '30d': '30d' }
export const PVUV_TOP_ROWS = 8

function profile() {
  cacheLife({ stale: 300, revalidate: 600, expire: 900 })
}

function access() {
  const read = pvuvReadAccess()
  if (!read) throw new Error('pvuv read access missing')
  return read
}

async function cachedOverview(range: Range): Promise<PvuvOverview> {
  'use cache'
  profile()
  return pvuvOverview(access(), PVUV_PERIOD[range])
}

async function cachedBreakdown(range: Range, dim: string): Promise<PvuvBreakdown> {
  'use cache'
  profile()
  return pvuvBreakdown(access(), { dim, period: PVUV_PERIOD[range], limit: PVUV_TOP_ROWS })
}

async function cachedFunnelList() {
  'use cache'
  profile()
  return pvuvFunnels(access())
}

async function cachedFunnel(id: string, range: Range): Promise<PvuvFunnel> {
  'use cache'
  profile()
  return pvuvFunnel(access(), { id, period: PVUV_PERIOD[range] })
}

async function settle<T>(name: string, read: () => Promise<T>): Promise<PvuvState<T>> {
  if (!pvuvReadAccess()) return { status: 'unconfigured' }
  try {
    return { status: 'ok', data: await read() }
  } catch (error) {
    logger.warn('admin.pvuv.read_failed', { read: name, error })
    return { status: 'failed' }
  }
}

export const pvuvConnected = (): boolean => pvuvReadAccess() !== null

export function readPvuvOverview(range: Range): Promise<PvuvState<PvuvOverview>> {
  return settle('overview', () => cachedOverview(range))
}

// dim = source | page | channel | …; the top PVUV_TOP_ROWS rows.
export function readPvuvBreakdown(range: Range, dim: string): Promise<PvuvState<PvuvBreakdown>> {
  return settle(`breakdown.${dim}`, () => cachedBreakdown(range, dim))
}

// The saved funnels, each read in parallel; one funnel failing leaves the others standing.
export async function readPvuvFunnels(range: Range): Promise<PvuvState<PvuvFunnelReport[]>> {
  const list = await settle('funnels', () => cachedFunnelList())
  if (list.status !== 'ok') return list
  const reports = await Promise.all(
    list.data.map(async (info) => ({ ...info, funnel: await settle(`funnel.${info.id}`, () => cachedFunnel(info.id, range)) })),
  )
  return { status: 'ok', data: reports }
}
