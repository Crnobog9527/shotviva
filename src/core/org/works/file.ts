import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../../errors'
import { logger } from '../../logger'
import { workThumbKeyFor, workTileKeyFor, writeWorkTile, type ObjectStore } from '../../storage'
import { archiveThumbKey } from './archive'
import { findOrgWork, type OrgWorkFile } from './reads'

// Same short life as the member's own file routes (core/jobs/job-file.ts).
const SIGNED_GET_SECONDS = 300

// tile: the smaller copy Photos' grid shows (§8.3 格子图), for the company view.
export type OrgWorkSize = 'thumb' | 'tile' | 'full'
type Request = { user: string; jobId: string; size: OrgWorkSize; download: boolean }

// The 企业作品 file route's logic: where to redirect an active member of the org (the owner or
// staff) for one of its works. Anything that is not a finished work of the org they are an active
// member of is the same 404 as a missing one.
// A list asks for the small copy and falls back to the full file when there is none. The full
// file is the clean original; a free-pool work (none is expected: org credits are paid) only ever
// gets its protected small copy, as everywhere else no clean free work is signed.
export async function resolveOrgWorkFile(deps: { db: SupabaseClient; store: ObjectStore }, req: Request): Promise<string> {
  const found = await findOrgWork(deps.db, req.user, req.jobId)
  if (!found) throw new AppError('NOT_FOUND', 'Not found')
  const work = await servedCopy(deps.store, found)
  // A work of a deleted account (no maker), or one already copied for it, has its small copy in
  // the archive (1971).
  const thumb = work.userId ? workThumbKeyFor(work.userId, work.id, work.creditPool) : archiveThumbKey(work.outputKey)
  const tile = req.size === 'tile' ? await tileOf(deps.store, work, thumb) : null
  if (tile) return deps.store.presignGet(tile, { expiresInSeconds: SIGNED_GET_SECONDS })
  if (work.creditPool === 'free' || (req.size !== 'full' && (await exists(deps.store, thumb)))) {
    return deps.store.presignGet(thumb, { expiresInSeconds: SIGNED_GET_SECONDS })
  }
  const downloadName = req.download ? `shotviva-${work.id}.png` : undefined
  return deps.store.presignGet(work.outputKey, { expiresInSeconds: SIGNED_GET_SECONDS, downloadName })
}

// The tile copy of a live work (its maker's account exists): the one that is there, or one cut
// now from the small copy (as the maker's own thumbnail route does; a free work's small copy is
// the protected one, so its tile is too). null for an archived work, or when there is no small
// copy to cut from: the caller then answers the small copy or the full file as for 'thumb'.
async function tileOf(store: ObjectStore, work: OrgWorkFile, thumb: string): Promise<string | null> {
  if (!work.userId) return null
  const key = workTileKeyFor(work.userId, work.id, work.creditPool)
  if (await exists(store, key)) return key
  if (!(await exists(store, thumb))) return null
  return (await writeWorkTile(store, { userId: work.userId, jobId: work.id, pool: work.creditPool })) ? key : null
}

// Photos' company view, first screen: the signed tile address of each of these works that the
// user may read (the same member check as the route, one by one) and whose tile already exists,
// so the browser fetches it straight from storage. Nothing is made here; anything missing,
// archived, not theirs to read or failing is left out and the page falls back to the route.
export async function signedOrgTiles(deps: { db: SupabaseClient; store: () => ObjectStore }, user: string, jobIds: readonly string[]): Promise<Map<string, string>> {
  try {
    const store = deps.store()
    const signed = await Promise.all(
      jobIds.map(async (jobId) => {
        const work = await findOrgWork(deps.db, user, jobId)
        if (!work?.userId || work.archiveKey) return null
        const key = workTileKeyFor(work.userId, work.id, work.creditPool)
        return (await exists(store, key)) ? ([jobId, await store.presignGet(key, { expiresInSeconds: SIGNED_GET_SECONDS })] as const) : null
      }),
    )
    return new Map(signed.filter((entry) => entry !== null))
  } catch (error) {
    logger.warn('org tiles not signed', { error })
    return new Map()
  }
}

// An unfinished account deletion's copy, once it is complete; else the work as it is. A free
// work is only ever served by its small copy, so for one the archive counts only with that copy.
async function servedCopy(store: ObjectStore, found: OrgWorkFile): Promise<OrgWorkFile> {
  const key = found.archiveKey
  if (!key || !(await exists(store, key))) return found
  if (found.creditPool === 'free' && !(await exists(store, archiveThumbKey(key)))) return found
  return { ...found, userId: null, outputKey: key }
}

async function exists(store: ObjectStore, key: string): Promise<boolean> {
  try {
    return (await store.head(key)) !== null
  } catch {
    return false
  }
}
