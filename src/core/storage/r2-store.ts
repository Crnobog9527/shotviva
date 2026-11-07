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
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { serverEnv } from '../env'
import { AppError } from '../errors'
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

// 412: something is already there. 409: a concurrent conditional write to the same key won.
const lostRace = (error: unknown) => {
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode
  return status === 412 || status === 409
}

// R2 rejects the CRC32 checksum headers newer SDKs add to presigned URLs by default.
export function createR2Client(config: { accountId: string; accessKeyId: string; secretAccessKey: string }) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
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
    async get(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      if (!result.Body) throw new Error('R2 get returned no body')
      return result.Body.transformToByteArray()
    },
    async put(key, body, contentType, options) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: options?.cacheControl }),
      )
    },
    async putIfAbsent(key, body, contentType) {
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, IfNoneMatch: '*' }))
        return true
      } catch (error) {
        if (lostRace(error)) return false
        throw error
      }
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
