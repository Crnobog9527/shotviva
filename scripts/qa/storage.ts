import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import type { R2Config } from './env'
import { LOCAL_REF } from './target'

// The two R2 operations the personas need. core/storage's r2-store is server-only, so this
// is a small copy with the same client settings; it only ever touches keys under a QA
// persona's own prefixes (inputs/, outputs/, requests/ + that user's id).
export type QaStorage = {
  enabled: boolean
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  deletePrefix(prefix: string): Promise<void>
}

type S3Like = Pick<S3Client, 'send'>

export function r2Storage(client: S3Like, bucket: string): QaStorage {
  return {
    enabled: true,
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
    },
    async deletePrefix(prefix) {
      let token: string | undefined
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
        const keys = (page.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []))
        if (keys.length > 0) {
          const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }))
          if (result.Errors?.length) throw new Error(`R2 delete failed under ${prefix}`)
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
    },
  }
}

// A local stack has no R2: rows are still written, files are skipped and reported.
const skipped: QaStorage = { enabled: false, put: async () => {}, deletePrefix: async () => {} }

export function qaStorage(ref: string, config: R2Config | null): QaStorage {
  if (config) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
    return r2Storage(client, config.bucket)
  }
  if (ref === LOCAL_REF) return skipped
  throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (preview bucket) must be in .env.local.')
}
