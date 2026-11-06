import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'

import { qaStorage, r2Storage } from './storage'

type Sent = { name: string; input: Record<string, unknown> }

function fakeClient(pages: { keys: string[]; next?: string }[]) {
  const sent: Sent[] = []
  let page = 0
  const client = {
    send: async (command: object) => {
      const input = (command as { input: Record<string, unknown> }).input
      sent.push({ name: command.constructor.name, input })
      if (command instanceof ListObjectsV2Command) {
        const current = pages[page++]
        return { Contents: current.keys.map((Key) => ({ Key })), IsTruncated: Boolean(current.next), NextContinuationToken: current.next }
      }
      return {}
    },
  }
  return { client: client as never, sent }
}

describe('r2Storage', () => {
  it('deletes every page under a prefix', async () => {
    const { client, sent } = fakeClient([{ keys: ['outputs/u/a.png', 'outputs/u/b.png'], next: 't1' }, { keys: [] }])
    await r2Storage(client, 'bucket-preview').deletePrefix('outputs/u/')
    expect(sent.map((s) => s.name)).toEqual([ListObjectsV2Command.name, DeleteObjectsCommand.name, ListObjectsV2Command.name])
    expect(sent[1].input).toMatchObject({ Bucket: 'bucket-preview', Delete: { Objects: [{ Key: 'outputs/u/a.png' }, { Key: 'outputs/u/b.png' }] } })
    expect(sent[2].input).toMatchObject({ Prefix: 'outputs/u/', ContinuationToken: 't1' })
  })

  it('puts with the content type', async () => {
    const { client, sent } = fakeClient([])
    await r2Storage(client, 'bucket-preview').put('outputs/u/j.png', new Uint8Array([1]), 'image/png')
    expect(sent[0].name).toBe(PutObjectCommand.name)
    expect(sent[0].input).toMatchObject({ Bucket: 'bucket-preview', Key: 'outputs/u/j.png', ContentType: 'image/png' })
  })
})

describe('qaStorage', () => {
  it('requires R2 for a remote project and skips it on a local stack', () => {
    expect(() => qaStorage('pnzkiqvktkzznfbyhphe', null)).toThrow(/R2_BUCKET/)
    expect(qaStorage('local', null).enabled).toBe(false)
  })
})
