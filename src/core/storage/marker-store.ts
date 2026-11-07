import { DeleteObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'

// Tiny marker objects that make "only one instance does this" decisions without a database
// (owner alerts, T72). R2 evaluates conditional writes atomically against the committed bucket
// state: If-None-Match: * writes only when nothing is there; If-Unmodified-Since writes only when
// the object was last written before the given time. A successful write moves that time to now,
// so a cooldown slides from the last claim.

export const MARKER_TIMEOUT_MS = 1500

export type MarkerStore = {
  // true when this call wrote the marker: it was absent, or (staleBefore given) last written
  // before staleBefore. staleBefore null: only an absent marker can be claimed.
  claim(key: string, staleBefore: Date | null): Promise<boolean>
  release(key: string): Promise<void>
}

type S3Like = Pick<S3Client, 'send'>

const statusOf = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode

// 412: the condition failed (someone holds it). 409: a concurrent conditional write won.
const lostRace = (error: unknown) => statusOf(error) === 412 || statusOf(error) === 409

export function createR2MarkerStore(client: S3Like, bucket: string): MarkerStore {
  // A hard ceiling on top of the client's socket timeout.
  const send = (command: PutObjectCommand | DeleteObjectCommand) => client.send(command as never, { abortSignal: AbortSignal.timeout(MARKER_TIMEOUT_MS) })
  const put = async (key: string, condition: { IfNoneMatch?: string; IfUnmodifiedSince?: Date }): Promise<boolean> => {
    try {
      await send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: new Date().toISOString(), ContentType: 'text/plain', ...condition }))
      return true
    } catch (error) {
      if (lostRace(error)) return false
      throw error
    }
  }
  return {
    async claim(key, staleBefore) {
      if (await put(key, { IfNoneMatch: '*' })) return true
      return staleBefore ? put(key, { IfUnmodifiedSince: staleBefore }) : false
    },
    async release(key) {
      await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
  }
}
