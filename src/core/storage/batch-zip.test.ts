import { Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import type { S3Client } from '@aws-sdk/client-s3'
import { expect, it, vi } from 'vitest'

import { writeBatchZip } from './batch-zip'

const result = vi.hoisted(() => ({ bytes: Buffer.alloc(0) as Buffer }))
vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor(private options: { params: { Body: Readable } }) {}
    async done() { result.bytes = await buffer(this.options.params.Body) }
  },
}))

const archive = { key: 'private.zip', name: 'download.zip',
  files: [{ key: 'a', name: '甲_一_1.png' }, { key: 'b', name: '乙_一_2.png' }] }

it('writes stored ZIP entries in order with unmodified PNG bytes', async () => {
  const send = vi.fn(async ({ input }: { input: { Key: string } }) => {
    const image = Buffer.from('PNG:' + input.Key)
    return { Body: Readable.from([image]), ContentLength: image.length }
  })
  await writeBatchZip({ send } as unknown as S3Client, 'bucket', archive)
  const zip = result.bytes
  const end = zip.length - 22
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  expect(zip.readUInt16LE(end + 10)).toBe(2)
  let offset = zip.readUInt32LE(end + 16)
  for (const file of archive.files) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50)
    const nameSize = zip.readUInt16LE(offset + 28)
    expect(zip.subarray(offset + 46, offset + 46 + nameSize).toString()).toBe(file.name)
    const header = zip.readUInt32LE(offset + 42)
    const start = header + 30 + zip.readUInt16LE(header + 26) + zip.readUInt16LE(header + 28)
    expect(zip.subarray(start, start + zip.readUInt32LE(offset + 20)).toString()).toBe('PNG:' + file.key)
    offset += 46 + nameSize + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32)
  }
})

it('rejects the upload when an input read fails', async () => {
  const send = vi.fn(async () => { throw new Error('missing object') })
  await expect(writeBatchZip({ send } as unknown as S3Client, 'bucket', archive)).rejects.toThrow('missing object')
  expect(send).toHaveBeenCalledTimes(1)
})
