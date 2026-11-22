import 'server-only'

import type { RpcClient } from '../billing/rpc'
import type { ObjectStore } from '../storage'
import { sharedImagePath, worksWithBefore } from './share-images'
import type { WorkShare } from './share-schema'
import { readWorkShare } from './share-store'

// What the public collection page renders. Only route paths and display fields: no storage key,
// no owner id, nothing the sharer typed into a work (the note, the copy fields).
export type SharedWorkView = {
  jobId: string
  templateName: string
  afterUrl: string
  // Present only when the sharer opted in and the work still has its before photo.
  beforeUrl: string | null
  // A free work: marked, and labelled as such on the page.
  watermarked: boolean
  aspectRatio: string | null
}

export type WorkShareView = {
  id: string
  title: string | null
  note: string | null
  createdAt: Date
  ref: string | null
  showBefore: boolean
  works: SharedWorkView[]
}

type Deps = { db: RpcClient; store: () => ObjectStore; templateName(templateId: string): string }

export function shareViewOf(share: WorkShare, withBefore: ReadonlySet<string>, templateName: (id: string) => string): WorkShareView {
  return {
    id: share.id,
    title: share.title,
    note: share.note,
    createdAt: share.createdAt,
    ref: share.ref,
    showBefore: share.showBefore,
    works: share.items.map((item) => ({
      jobId: item.jobId,
      templateName: templateName(item.templateId),
      afterUrl: sharedImagePath(share.id, item.jobId, 'after'),
      beforeUrl: withBefore.has(item.jobId) ? sharedImagePath(share.id, item.jobId, 'before') : null,
      watermarked: item.creditPool === 'free',
      aspectRatio: item.aspectRatio,
    })),
  }
}

// null for a link that does not open (malformed, missing, revoked, banned owner).
export async function loadWorkShareView(deps: Deps, shareId: string): Promise<WorkShareView | null> {
  const share = await readWorkShare(deps.db, shareId)
  if (!share) return null
  const withBefore = share.showBefore ? await worksWithBefore(deps.store(), share) : new Set<string>()
  return shareViewOf(share, withBefore, deps.templateName)
}
