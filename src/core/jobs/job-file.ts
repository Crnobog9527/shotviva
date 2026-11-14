import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import {
  applyWatermark,
  downloadVariantKeyFor,
  flattenOnWhite,
  shouldWatermark,
  signBatchZip,
  stageVariant,
  type Archive,
  type DownloadVariant,
  type ObjectStore,
} from '../storage'
import type { DownloadBackground } from '../storage/rules/download-background'
import { isCutOut } from './job-cut-out'
import { findOwnJob } from './job-lookup'
import type { Job } from './job-schema'

export type JobFile =
  // Clean output or a staged copy: the browser fetches it straight from R2, so no bytes pass the function.
  | { kind: 'redirect'; url: string }
  // Free work: watermarked here (ARCHITECTURE §6.2), JPEG so it stays well under 4.5MB.
  | { kind: 'bytes'; body: Uint8Array; contentType: 'image/jpeg'; filename: string }

// Short: the URL is minted per request, so a revoked share never outlives it for long.
const SIGNED_GET_SECONDS = 300

type Deps = { db: SupabaseClient; store: ObjectStore }
// zip: writes (or reuses) the archive and signs it; tests pass a fake.
type PairDeps = Deps & { zip?(archive: Archive): Promise<string> }
type FileRequest = { userId: string; jobId: string; download: boolean; background?: DownloadBackground }

// The download route's logic: owner only (anyone else gets the same 404 as a missing job),
// finished jobs only, and the watermark decided by the work's own credit_pool: a free work
// stays marked after its owner pays, a paid work stays clean after the membership ends.
// background (白底 / 透明底, ARCHITECTURE §8): honoured unless the work is known to be opaque, so a
// cut-out the browser found itself still gets its choice; without one, nothing changes.
export async function resolveJobFile(deps: Deps, req: FileRequest): Promise<JobFile> {
  const job = await findOwnJob(deps.db, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded' || !job.outputKey) throw new AppError('NOT_FOUND', 'Not found')
  const background = req.background && isCutOut(job) !== false ? req.background : null
  const free = shouldWatermark(job.creditPool)
  const variant = stagedVariantFor(free, background)
  if (variant) return staged(deps, job, req, variant)
  if (!free) return signed(deps.store, job.outputKey, req.download ? `shotviva-${job.id}.png` : undefined)
  // A free work's display and its 白底 download are the same marked JPEG on white.
  const body = await applyWatermark(await deps.store.get(job.outputKey))
  const filename = background === 'white' ? `shotviva-${job.id}-white.jpg` : `shotviva-${job.id}.jpg`
  return { kind: 'bytes', body, contentType: 'image/jpeg', filename }
}

// The two files that are neither the stored original nor today's marked JPEG.
function stagedVariantFor(free: boolean, background: DownloadBackground | null): ImageVariant | null {
  if (background === 'white' && !free) return 'white'
  if (background === 'transparent' && free) return 'marked'
  return null
}

type ImageVariant = Exclude<DownloadVariant, 'both'>

const VARIANTS: Record<ImageVariant, { contentType: string; suffix: string; make(source: Uint8Array): Promise<Uint8Array> }> = {
  // Paid cut-out → pure white JPEG, no mark (a paid work never carries one).
  white: { contentType: 'image/jpeg', suffix: '-white.jpg', make: (source) => flattenOnWhite(source) },
  // Free cut-out → the same mark, alpha kept.
  marked: { contentType: 'image/png', suffix: '.png', make: (source) => applyWatermark(source, 'transparent') },
  // Free cut-out's 白底 for the pair ZIP: the same marked JPEG the single download makes per request.
  'marked-white': { contentType: 'image/jpeg', suffix: '-white.jpg', make: (source) => applyWatermark(source) },
}

async function staged(deps: Deps, job: Job, req: FileRequest, variant: ImageVariant): Promise<JobFile> {
  const key = await stage(deps.store, job, variant)
  return signed(deps.store, key, req.download ? `shotviva-${job.id}${VARIANTS[variant].suffix}` : undefined)
}

async function stage(store: ObjectStore, job: Job, variant: ImageVariant): Promise<string> {
  const spec = VARIANTS[variant]
  const key = downloadVariantKeyFor(job.userId, job.id, variant)
  await stageVariant(store, { sourceKey: job.outputKey as string, key, contentType: spec.contentType, make: spec.make })
  return key
}

// 「下载白底 + 透明图」: one ZIP with both files, the same ones the two single downloads give
// (watermark by credit_pool, as always), so a phone gets them from one tap. Written once to R2
// and handed out as a short signed link like the batch ZIP; a known opaque work has no pair.
export async function resolveJobPair(deps: PairDeps, req: { userId: string; jobId: string }): Promise<JobFile> {
  const job = await findOwnJob(deps.db, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded' || !job.outputKey || isCutOut(job) === false) throw new AppError('NOT_FOUND', 'Not found')
  const free = shouldWatermark(job.creditPool)
  const white = await stage(deps.store, job, free ? 'marked-white' : 'white')
  const transparent = free ? await stage(deps.store, job, 'marked') : job.outputKey
  const files = [
    { key: white, name: `shotviva-${job.id}-white.jpg` },
    { key: transparent, name: `shotviva-${job.id}.png` },
  ]
  const zip = { key: downloadVariantKeyFor(job.userId, job.id, 'both'), name: `shotviva-${job.id}.zip`, files }
  return { kind: 'redirect', url: await (deps.zip ?? signBatchZip)(zip) }
}

async function signed(store: ObjectStore, key: string, downloadName: string | undefined): Promise<JobFile> {
  return { kind: 'redirect', url: await store.presignGet(key, { expiresInSeconds: SIGNED_GET_SECONDS, downloadName }) }
}
