import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runGeneration } from '@/core/jobs'
import { newInputKey } from '@/core/storage'

import { heicHeader, text } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, jobCount, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// AGENTS §7 item 8 through the real generate path: an object PUT straight to R2 that is over
// 20MB or not really an image gets 422 and is deleted, before any credit moves.

let db: Client
let templateId: string

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

describe('generate rejects bad uploads', () => {
  it.each([
    ['a 25MB file', () => new Uint8Array(25 * 1024 * 1024), 'image/jpeg', 'IMAGE_TOO_LARGE'],
    ['a text file renamed to .jpg', () => text('definitely not a photo'), 'image/jpeg', 'IMAGE_UNSUPPORTED'],
    ['an Android HEIC original', () => heicHeader(), 'image/jpeg', 'IMAGE_UNSUPPORTED'],
  ])('%s → 422, object deleted, nothing charged', async (_, body, type, code) => {
    const userId = await createUser(db, { credits: 3 })
    const r2 = createMemoryStore()
    const key = newInputKey(userId, 'image/jpeg')
    r2.upload(key, body(), type)
    const fake = fakeProvider()

    const error = await runGeneration(
      { db: serviceSupabase(), store: r2.store, provider: fake.provider },
      { userId, source: 'web', templateId, inputKey: key },
    ).catch((e: unknown) => e)

    expect(error).toMatchObject({ code, status: 422 })
    expect(r2.objects.has(key)).toBe(false)
    expect(fake.generate).not.toHaveBeenCalled()
    expect((await profileOf(db, userId)).credits).toBe(3)
    expect(await jobCount(db, userId)).toBe(0)
  })
})
