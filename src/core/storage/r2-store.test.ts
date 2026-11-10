import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import { createR2Store } from './r2-store'

type Command = { input: Record<string, unknown> }

describe('createR2Store', () => {
  it('deletes every page under a prefix', async () => {
    const send = vi.fn(async (command: Command) => {
      if (command instanceof ListObjectsV2Command) {
        return command.input.ContinuationToken
          ? { Contents: [{ Key: 'outputs/u/3.png' }], IsTruncated: false }
          : { Contents: [{ Key: 'outputs/u/1.png' }, { Key: 'outputs/u/2.png' }], IsTruncated: true, NextContinuationToken: 't' }
      }
      return {}
    })
    await createR2Store({ send } as never, 'bucket').deletePrefix('outputs/u/')
    const deletes = send.mock.calls.map(([command]) => command).filter((command) => command instanceof DeleteObjectsCommand)
    expect(deletes.flatMap((command) => (command.input.Delete as { Objects: { Key: string }[] }).Objects.map((o) => o.Key))).toEqual([
      'outputs/u/1.png',
      'outputs/u/2.png',
      'outputs/u/3.png',
    ])
  })

  it('treats a 404 HEAD as missing and reports size and type otherwise', async () => {
    const send = vi.fn(async (command: Command) => {
      if (command instanceof HeadObjectCommand && command.input.Key === 'missing') {
        throw Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })
      }
      return { ContentLength: 42, ContentType: 'image/jpeg' }
    })
    const store = createR2Store({ send } as never, 'bucket')
    await expect(store.head('missing')).resolves.toBeNull()
    await expect(store.head('there')).resolves.toEqual({ size: 42, contentType: 'image/jpeg' })
  })

  it('presigns the PUT with the content type and TTL', async () => {
    const presign = vi.fn(async () => 'https://signed')
    await createR2Store({ send: vi.fn() } as never, 'bucket', presign).presignPut('inputs/u/a.jpg', 'image/jpeg', 60)
    const [, command, options] = presign.mock.calls[0] as unknown as [unknown, PutObjectCommand, { expiresIn: number }]
    expect(command.input).toMatchObject({ Bucket: 'bucket', Key: 'inputs/u/a.jpg', ContentType: 'image/jpeg' })
    expect(options.expiresIn).toBe(60)
  })

  it('limits staged reads with an inclusive byte range', async () => {
    const send = vi.fn<(command: GetObjectCommand) => Promise<{ Body: { transformToByteArray(): Promise<Uint8Array> } }>>(async () => ({
      Body: { transformToByteArray: async () => new Uint8Array(4) },
    }))
    const store = createR2Store({ send } as never, 'private')
    await store.get('staging', 4)
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'private', Key: 'staging', Range: 'bytes=0-3' })
  })

  it('copies inside the bucket with an encoded CopySource', async () => {
    const send = vi.fn(async () => ({}))
    await createR2Store({ send } as never, 'bucket').copy('inputs/u/a b.jpg', 'outputs/u/j-in-1.jpg')
    const [command] = send.mock.calls[0] as unknown as [CopyObjectCommand]
    expect(command).toBeInstanceOf(CopyObjectCommand)
    expect(command.input).toMatchObject({ Bucket: 'bucket', Key: 'outputs/u/j-in-1.jpg', CopySource: 'bucket/inputs/u/a%20b.jpg' })
  })
})
