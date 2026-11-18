import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'

type S3Like = Pick<S3Client, 'send'>
export type StoredJson = { etag: string; value: unknown }
export type ConditionalJsonStore = {
  read(key: string): Promise<StoredJson | null>
  // undefined overwrites, null only creates, and a string must match the current ETag.
  write(key: string, value: unknown, expected?: string | null): Promise<string | null>
}

const TIMEOUT_MS = 2_000
const MAX_BYTES = 8 * 1024 * 1024
const status = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode

export function createConditionalR2Json(client: S3Like, bucket: string): ConditionalJsonStore {
  return {
    async read(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!object.ETag || !object.Body) throw new Error('Incomplete R2 cache object')
        if ((object.ContentLength ?? 0) > MAX_BYTES) {
          // Close the stream without retaining an unexpectedly large object in memory.
          if ('destroy' in object.Body && typeof object.Body.destroy === 'function') object.Body.destroy()
          throw new Error('R2 cache object exceeds the size limit')
        }
        return { etag: object.ETag, value: JSON.parse(await object.Body.transformToString()) as unknown }
      } catch (error) {
        if (status(error) === 404) return null
        throw error
      }
    },
    async write(key, value, expected) {
      const body = JSON.stringify(value)
      if (Buffer.byteLength(body) > MAX_BYTES) throw new Error('R2 cache object exceeds the size limit')
      try {
        const object = await client.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: body, ContentType: 'application/json', CacheControl: 'private, no-store',
          IfMatch: expected ?? undefined, IfNoneMatch: expected === null ? '*' : undefined,
        }), { abortSignal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!object.ETag) throw new Error('R2 cache write returned no ETag')
        return object.ETag
      } catch (error) {
        if (status(error) === 409 || status(error) === 412) return null
        throw error
      }
    },
  }
}
