import 'server-only'
import { cacheLife } from 'next/cache'

import { serverEnv } from '../../env'
import { EdgeQueryError, parseEdgeSnapshot, queryEdge, type EdgeData, type EdgeReason } from './edge-query'
import { windowFor, type Range } from './range'

export type { EdgeData, EdgeReason } from './edge-query'
export type EdgeRead =
  | { source: 'live'; reason: null; data: EdgeData }
  | { source: 'snapshot'; reason: EdgeReason; data: EdgeData }
  | { source: 'unknown'; reason: EdgeReason; data: null }

function fallback(reason: EdgeReason): EdgeRead {
  const data = parseEdgeSnapshot(serverEnv().VERCEL_OBSERVABILITY_SNAPSHOT)
  return data ? { source: 'snapshot', reason, data } : { source: 'unknown', reason, data: null }
}

async function cachedEdge(range: Range): Promise<EdgeRead> {
  'use cache'
  cacheLife({ stale: 300, revalidate: 600, expire: 900 })
  const env = serverEnv()
  const token = env.VERCEL_OBSERVABILITY_TOKEN
  const projectId = env.VERCEL_OBSERVABILITY_PROJECT_ID
  const ownerId = env.VERCEL_OBSERVABILITY_TEAM_ID
  if (!token || !projectId || !ownerId) return fallback('unconfigured')
  const window = windowFor(range, new Date())
  const signal = AbortSignal.timeout(25_000)
  try {
    const data = await queryEdge(async (query) => {
      const response = await fetch('https://api.vercel.com/v2/observability/query', {
        method: 'POST', redirect: 'error', cache: 'no-store', signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      })
      if ([401, 402, 403].includes(response.status)) throw new EdgeQueryError('denied')
      if (!response.ok) throw new EdgeQueryError('unavailable')
      return response.json()
    }, { ownerId, projectId }, window)
    return { source: 'live', reason: null, data }
  } catch (error) {
    return fallback(error instanceof EdgeQueryError ? error.reason : 'unavailable')
  }
}

export async function readEdge(range: Range): Promise<EdgeRead> {
  const result = await cachedEdge(range)
  if (result.source === 'live' && Date.now() - Date.parse(result.data.end) > 900_000) return fallback('expired')
  return result
}
