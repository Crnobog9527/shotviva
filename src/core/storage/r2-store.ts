import 'server-only'

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { serverEnv } from '../env'
import { AppError } from '../errors'
import { createR2MarkerStore, MARKER_TIMEOUT_MS, type MarkerStore } from './marker-store'
import type { ObjectStore } from './object-store'

// Cloudflare R2 through its S3 API. Written fresh for Shotviva (not copied from the
// flux-kontext-template base) so it follows the file rules and only does what §8 needs.

type S3Like = Pick<S3Client, 'send'>
type Presign = typeof getSignedUrl

const isNotFound = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { name?: string }).name === 'NotFound' ||
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)

// R2 rejects the CRC32 checksum headers newer SDKs add to presigned URLs by default.
// extra: per-use overrides, e.g. the alert markers' short timeout and single attempt.
export function createR2Client(config: { accountId: string; accessKeyId: string; secretAccessKey: string }, extra: S3ClientConfig = {}) {
  return new S3Client({
    ...extra,
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, // r2Origin() below names the same host
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

async function deleteAllUnder(client: S3Like, bucket: string, prefix: string) {
  let token: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
    const keys = (page.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []))
    if (keys.length > 0) {
      const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }))
      if (result.Errors?.length) throw new Error(`R2 delete failed for ${result.Errors.length} objects under ${prefix}`)
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
}

// CopySource is "bucket/key", URL-encoded per path segment (S3 decodes it once).
export function copySource(bucket: string, key: string): string {
  return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
}

export function createR2Store(client: S3Like, bucket: string, presign: Presign = getSignedUrl): ObjectStore {
  return {
    presignPut: (key, contentType, expiresIn) =>
      presign(client as S3Client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn }),
    presignGet: (key, { expiresInSeconds, downloadName }) =>
      presign(
        client as S3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined,
        }),
        { expiresIn: expiresInSeconds },
      ),
    async head(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? null }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },
    async get(key, maxBytes) {
      const Range = maxBytes === undefined ? undefined : `bytes=0-${maxBytes - 1}`
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range }))
      if (!result.Body) throw new Error('R2 get returned no body')
      return result.Body.transformToByteArray()
    },
    async put(key, body, contentType, options) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: options?.cacheControl }),
      )
    },
    async copy(sourceKey, destinationKey) {
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: destinationKey, CopySource: copySource(bucket, sourceKey) }))
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
    deletePrefix: (prefix) => deleteAllUnder(client, bucket, prefix),
  }
}

let cached: ObjectStore | undefined
let cachedPublic: ObjectStore | undefined

function r2Credentials() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = serverEnv()
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null
  return { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
}

// Where signed URLs point (the account's S3 endpoint), for a preconnect hint on pages whose first
// screen loads straight from R2. Already visible in every signed URL; null when R2 is not set up.
export function r2Origin(): string | null {
  const { R2_ACCOUNT_ID } = serverEnv()
  return R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null
}

// The configured bucket. Throws INTERNAL (not a silent no-op) when R2 is not set up, so
// e.g. account deletion fails loudly instead of leaving photos behind.
export function r2Store(): ObjectStore {
  if (cached) return cached
  const credentials = r2Credentials()
  const { R2_BUCKET } = serverEnv()
  if (!credentials || !R2_BUCKET) throw new AppError('INTERNAL', 'R2 storage is not configured')
  cached = createR2Store(createR2Client(credentials), R2_BUCKET)
  return cached
}

// The public assets bucket (template covers only; ARCHITECTURE §8.3). Nothing user-owned is
// ever written here: only core/admin/covers calls it, and only under covers/.
export function r2PublicStore(): ObjectStore {
  if (cachedPublic) return cachedPublic
  const credentials = r2Credentials()
  const { R2_PUBLIC_BUCKET } = serverEnv()
  if (!credentials || !R2_PUBLIC_BUCKET) throw new AppError('INTERNAL', 'R2 public assets bucket is not configured')
  cachedPublic = createR2Store(createR2Client(credentials), R2_PUBLIC_BUCKET)
  return cachedPublic
}

let cachedMarkers: MarkerStore | null | undefined

// The owner-alert dedupe markers (core/alerts, T72) in the private bucket. A client of its own:
// one attempt, no SDK retries, a short socket timeout, so an alert never waits on a slow R2.
// null when R2 is not configured (alerts then dedupe per instance only).
export function r2MarkerStore(): MarkerStore | null {
  if (cachedMarkers !== undefined) return cachedMarkers
  const credentials = r2Credentials()
  const { R2_BUCKET } = serverEnv()
  cachedMarkers =
    credentials && R2_BUCKET
      ? createR2MarkerStore(
          createR2Client(credentials, { maxAttempts: 1, requestHandler: { connectionTimeout: 1000, requestTimeout: MARKER_TIMEOUT_MS } }),
          R2_BUCKET,
        )
      : null
  return cachedMarkers
}

export async function signBatchZip(archive: import('./batch-zip').Archive) {
  const credentials = r2Credentials()
  const { R2_BUCKET } = serverEnv()
  if (!credentials || !R2_BUCKET) throw new AppError('INTERNAL', 'R2 storage is not configured')
  const store = r2Store()
  if (!(await store.head(archive.key))) {
    const { writeBatchZip } = await import('./batch-zip')
    const client = createR2Client(credentials)
    try {
      await writeBatchZip(client, R2_BUCKET, archive)
    } finally {
      client.destroy()
    }
  }
  return store.presignGet(archive.key, { expiresInSeconds: 60, downloadName: archive.name })
}
