import 'server-only'

import { cacheLife } from 'next/cache'

import { createAdminSupabase } from '../../auth/supabase-admin'
import { logger } from '../../logger'
import { pvuvReadAccess } from './access'
import { loadCollectionStats, type CollectionStats } from './collections'
import { windowFor, type Range, type Window } from './range'

export type CollectionsBlock = { status: 'ok'; window: Window; data: CollectionStats } | { status: 'error' }

// Cached like the page's other blocks (10 minutes per range). A database failure throws inside
// the cache, so it is not kept; a PVUV failure is part of the data (the database half still shows).
async function cachedCollections(range: Range) {
  'use cache'
  cacheLife({ stale: 300, revalidate: 600, expire: 900 })
  const window = windowFor(range, new Date())
  return { window, data: await loadCollectionStats(createAdminSupabase(), pvuvReadAccess(), window) }
}

export async function readCollections(range: Range): Promise<CollectionsBlock> {
  try {
    return { status: 'ok', ...(await cachedCollections(range)) }
  } catch (error) {
    logger.error('admin.collections.read_failed', { error })
    return { status: 'error' }
  }
}
