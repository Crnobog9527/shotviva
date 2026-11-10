import 'server-only'

import { Readable } from 'node:stream'
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { ZipFile } from 'yazl'
import { logger } from '../logger'

export type Archive = { key: string; name: string; files: { key: string; name: string }[] }

// Lazy reads keep one input and one multipart upload part in flight. Abort cancels an
// outstanding GET too, including an input paused by upload backpressure.
export async function writeBatchZip(client: S3Client, bucket: string, archive: Archive) {
  const abort = new AbortController()
  const zip = new ZipFile()
  const output = zip.outputStream as Readable
  zip.on('error', error => output.destroy(error))
  const upload = new Upload({ client, queueSize: 1,
    params: { Bucket: bucket, Key: archive.key, Body: output, ContentType: 'application/zip' } })
  for (const file of archive.files) {
    zip.addReadStreamLazy(file.name, { compress: false }, callback => {
      client.send(new GetObjectCommand({ Bucket: bucket, Key: file.key }), { abortSignal: abort.signal })
        .then(({ Body, ContentLength }) => {
          if (!(Body instanceof Readable)) throw new Error('Missing batch output stream')
          let size = 0
          Body.on('data', chunk => { size += chunk.length })
          Body.on('end', () => {
            if (ContentLength !== undefined && size !== ContentLength) output.destroy(new Error('Incomplete batch output'))
          })
          Body.on('error', error => output.destroy(error))
          callback(null, Body)
        }).catch(error => output.destroy(error))
    })
  }
  const start = performance.now()
  const startRss = process.memoryUsage.rss()
  let peakRss = startRss
  const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage.rss()) }
  const timer = setInterval(sample, 250).unref()
  zip.end()
  try {
    await upload.done()
    sample()
    logger.info('batch.zip.built', { files: archive.files.length, elapsed_ms: Math.round(performance.now() - start),
      start_rss_bytes: startRss, sampled_peak_rss_bytes: peakRss })
  } finally {
    clearInterval(timer)
    abort.abort()
    output.destroy()
  }
}
