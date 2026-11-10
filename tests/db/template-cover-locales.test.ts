import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { applyCover, bulkEditTemplates, createCoverUpload } from '@/core/admin'
import type { GenerationProvider, ProviderInput } from '@/core/jobs'
import { listTemplatesIn } from '@/core/templates'
import { CREDITS_FLOOR } from '@/modules/image/credits-floor'
import { confirmTestPhoto, runTestGenerate, runTestTranslate, saveTestBudget, setTestRunCover } from '@/modules/image'

import { jpeg, png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { publishEditTemplate, setEditTemplate, TEST_EDIT_PARAMS, TEST_WRAPPER } from './edit-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

// T87 per-language covers (ARCHITECTURE §8.3 「封面按语言适配」): cover_locales (0820), the admin's
// language-tab writes (0824), 「设为封面」 into a language (0823) and the cover translation run
// (0821, 0822), against the real local database with in-memory buckets and a fake image model.

const BASE = 'https://assets.test'
let db: Client
let admin: string
const service = serviceSupabase()

let releaseBudget: () => Promise<void>

beforeAll(async () => {
  db = await connectAdmin()
  releaseBudget = await holdTestBudget(db)
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  await saveTestBudget(service, admin, 1000)
  // Waiting for the other test-run file to release the budget lock can take a while.
}, 120_000)

afterAll(async () => {
  await releaseBudget()
  await db.end()
})

const localesOf = async (id: string) =>
  (await db.query<{ cover_locales: Record<string, Record<string, string>>; cover_before_url: string | null }>(
    'select cover_locales, cover_before_url from public.templates where id = $1',
    [id],
  )).rows[0]!

// Test URLs live on https://a.test, passed as the assets origin like the server passes its own.
const setLocale = (args: Record<string, unknown>) =>
  service.rpc('admin_set_template_locale_cover', { p_actor: admin, p_assets_base: 'https://a.test', p_locales: ['en', 'zh'], ...args })

function provider() {
  const calls: Omit<ProviderInput, 'signal'>[] = []
  const generate = vi.fn(async (input: ProviderInput) => {
    calls.push({ ...input })
    return { bytes: await png(800, 1000), contentType: 'image/png' as const, usage: { input_text_tokens: 10, input_image_tokens: 100, output_tokens: 500 } }
  })
  const fake: GenerationProvider = { id: 'fake-openai/gpt-image-2.6', prices: { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }, generate }
  return { fake, calls, generate }
}

describe('admin_set_template_locale_cover', () => {
  it('merges one language’s keys, drops nulls, removes an emptied language, and clears on request', async () => {
    const id = await seedTemplate(db)
    expect((await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: { after: 'https://a.test/zh-a.webp' } })).error).toBeNull()
    await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: { media: 'video', video: 'https://a.test/zh.mp4', poster: 'https://a.test/zh-p.webp' } })
    expect((await localesOf(id)).cover_locales.zh).toEqual({ after: 'https://a.test/zh-a.webp', media: 'video', video: 'https://a.test/zh.mp4', poster: 'https://a.test/zh-p.webp' })
    await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: { media: null, video: null, poster: null } })
    expect((await localesOf(id)).cover_locales.zh).toEqual({ after: 'https://a.test/zh-a.webp' })
    await setLocale({ p_template_id: id, p_locale: 'ja', p_patch: { after: 'https://a.test/ja-a.webp' } })
    await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: {}, p_clear: true })
    expect((await localesOf(id)).cover_locales).toEqual({ ja: { after: 'https://a.test/ja-a.webp' } })
  })

  it('refuses bad codes, keys, URLs and anyone but an admin', async () => {
    const id = await seedTemplate(db)
    expect((await setLocale({ p_template_id: id, p_locale: 'ZH', p_patch: {} })).error?.message).toBe('INVALID_INPUT')
    expect((await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: { title: 'x' } })).error?.message).toBe('INVALID_INPUT')
    expect((await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: { after: 'http://a.test/x.webp' } })).error?.message).toBe('INVALID_INPUT')
    // Only our own assets origin.
    expect((await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: { after: 'https://evil.test/x.webp' } })).error?.message).toBe('INVALID_INPUT')
    const user = await createUser(db)
    const { error } = await service.rpc('admin_set_template_locale_cover', {
      p_actor: user,
      p_template_id: id,
      p_locale: 'zh',
      p_patch: {},
      p_assets_base: 'https://a.test',
      p_locales: ['en', 'zh'],
    })
    expect(error?.message).toBe('NOT_ADMIN')
  })
})

describe('a live web template keeps something to show', () => {
  it('refuses to remove its last "after" (zh only), but lets an incomplete one be filled', async () => {
    const id = await seedTemplate(db)
    await db.query("update public.templates set cover_before_url = 'https://a.test/b.webp' where id = $1", [id])
    // Live on the web without any "after" yet: an upload is how it gets fixed.
    expect((await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: { after: 'https://a.test/za.webp' } })).error).toBeNull()
    expect((await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: {}, p_clear: true })).error?.message).toBe('COVER_STILL_NEEDED')
    expect((await localesOf(id)).cover_locales.zh?.after).toBe('https://a.test/za.webp')
    await db.query('update public.templates set is_active = false where id = $1', [id])
    expect((await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: {}, p_clear: true })).error).toBeNull()
  })
})

describe('language covers on the site', () => {
  it('a zh-only "after" shows on zh pages; en pages keep the common cover; removing it falls back', async () => {
    const id = await seedTemplate(db)
    await db.query("update public.templates set cover_before_url = 'https://a.test/b.webp', cover_after_url = 'https://a.test/a.webp' where id = $1", [id])
    await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: { after: 'https://a.test/zh-a.webp' } })
    const shown = async (locale: 'en' | 'zh') => (await listTemplatesIn(anonSupabase(), locale)).find((t) => t.id === id)
    expect(await shown('zh')).toMatchObject({ coverBeforeUrl: 'https://a.test/b.webp', coverAfterUrl: 'https://a.test/zh-a.webp' })
    expect((await shown('en'))?.coverAfterUrl).toBe('https://a.test/a.webp')
    await setLocale({ p_template_id: id, p_locale: 'zh', p_patch: {}, p_clear: true })
    expect((await shown('zh'))?.coverAfterUrl).toBe('https://a.test/a.webp')
  })
})

describe('admin upload into a language tab', () => {
  it('converts and publishes like the common cover, but writes cover_locales', async () => {
    const id = await seedTemplate(db)
    const uploads = createMemoryStore()
    const assets = createMemoryStore()
    const ticket = await createCoverUpload(uploads.store, { templateId: id, purpose: 'after', contentType: 'image/jpeg', size: 10 })
    uploads.upload(ticket.key, await jpeg(2400, 3000), 'image/jpeg')
    await applyCover({ db: service, uploads: uploads.store, assets: assets.store, assetsBaseUrl: BASE, actorId: admin }, { templateId: id, locale: 'zh', slot: 'after', key: ticket.key })
    const row = await localesOf(id)
    expect(row.cover_locales.zh?.after).toMatch(new RegExp(`^${BASE}/covers/${id}/after-[0-9a-f]{16}\\.webp$`))
    expect(row.cover_before_url).toBeNull()
  })
})

describe('test runs into language covers', () => {
  async function testRun(id: string, r2: ReturnType<typeof createMemoryStore>) {
    const photoId = randomUUID()
    const key = `admin-tests/photos/${photoId}.jpg`
    r2.upload(key, await jpeg(1200, 1500), 'image/jpeg')
    await confirmTestPhoto({ db: service, store: r2.store }, admin, photoId, key)
    const deps = { db: service, store: r2.store, provider: provider().fake, providerTimeoutMs: 2_000, identityJudge: null }
    const body = { run_id: randomUUID(), batch_id: randomUUID(), template_id: id, photo_id: photoId, inputs: { copy: {}, resolution: '1k' as const } }
    return runTestGenerate(deps, { actorId: admin, body })
  }

  it('「设为封面」 into zh sets its "after", and its "before" only while there is no common one', async () => {
    const r2 = createMemoryStore()
    const assets = createMemoryStore()
    const coverDeps = { db: service, store: r2.store, assets: assets.store, assetsBaseUrl: BASE }
    const bare = await seedTemplate(db)
    await setTestRunCover(coverDeps, admin, (await testRun(bare, r2)).id, 'zh')
    expect(Object.keys((await localesOf(bare)).cover_locales.zh ?? {}).sort()).toEqual(['after', 'before'])
    const withCommon = await seedTemplate(db)
    await db.query("update public.templates set cover_before_url = 'https://a.test/b.webp' where id = $1", [withCommon])
    await setTestRunCover(coverDeps, admin, (await testRun(withCommon, r2)).id, 'zh')
    expect(Object.keys((await localesOf(withCommon)).cover_locales.zh ?? {})).toEqual(['after'])
  })

  // Both cases share the singleton edit template with other files. Finish waiting for
  // their lock before the next case starts on this same database session.
  it('translates an approved cover through the edit template’s prompt, as a test run, then sets it as ja', async () => {
    const restore = await publishEditTemplate(db)
    try {
      await setEditTemplate(db, true, TEST_WRAPPER, { ...TEST_EDIT_PARAMS, cover_translate: 'TRANSLATE-ONLY into {{language}}' })
      const id = await seedTemplate(db)
      const r2 = createMemoryStore()
      const assets = createMemoryStore()
      assets.upload(`covers/${id}/after-src.webp`, await jpeg(1200, 1500), 'image/webp')
      await db.query('update public.templates set cover_after_url = $2 where id = $1', [id, `${BASE}/covers/${id}/after-src.webp`])
      const p = provider()
      const deps = { db: service, store: r2.store, provider: p.fake, providerTimeoutMs: 2_000, assets: assets.store, assetsBaseUrl: BASE }
      const body = { run_id: randomUUID(), batch_id: randomUUID(), template_id: id, source_locale: null, target_locale: 'ja' }
      const run = await runTestTranslate(deps, { actorId: admin, body })
      expect(run).toMatchObject({ kind: 'translate', status: 'succeeded', parentId: null, photoId: null, resolution: '2k' })
      expect(run.inputs).toMatchObject({ source_locale: null, target_locale: 'ja' })
      expect(p.calls[0]).toMatchObject({ prompt: 'TRANSLATE-ONLY into Japanese', aspectRatio: 'original', resolution: '2k' })
      // Its prompt is the edit template's: recorded under its own name, not as this template's version.
      expect(run.promptVersion).toBeNull()
      expect(run.inputs).toMatchObject({ translate_prompt: 'edit.cover_translate' })
      const coverDeps = { db: service, store: r2.store, assets: assets.store, assetsBaseUrl: BASE }
      // A translation only ever becomes its own language's "after".
      await expect(setTestRunCover(coverDeps, admin, run.id, null)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(setTestRunCover(coverDeps, admin, run.id, 'zh')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      const direct = await service.rpc('admin_set_test_run_cover', { p_actor: admin, p_run_id: run.id, p_before_url: null, p_after_url: `${BASE}/x.webp`, p_locale: 'zh' })
      expect(direct.error?.message).toBe('TRANSLATE_TARGET_ONLY')
      await setTestRunCover(coverDeps, admin, run.id, 'ja')
      expect(Object.keys((await localesOf(id)).cover_locales.ja ?? {})).toEqual(['after'])
      // An upcoming language is stored but never shown on the launched pages.
      expect((await listTemplatesIn(anonSupabase(), 'en')).find((t) => t.id === id)?.coverAfterUrl).toBe(`${BASE}/covers/${id}/after-src.webp`)
    } finally {
      await restore()
    }
  }, 15_000)

  it('says cover translation is not set up until the prompt is written', async () => {
    const restore = await publishEditTemplate(db)
    try {
      const id = await seedTemplate(db)
      const assets = createMemoryStore()
      assets.upload(`covers/${id}/after-src.webp`, await jpeg(600, 750), 'image/webp')
      await db.query('update public.templates set cover_after_url = $2 where id = $1', [id, `${BASE}/covers/${id}/after-src.webp`])
      const deps = { db: service, store: createMemoryStore().store, provider: provider().fake, assets: assets.store, assetsBaseUrl: BASE }
      const body = { run_id: randomUUID(), batch_id: randomUUID(), template_id: id, source_locale: null, target_locale: 'ja' }
      await expect(runTestTranslate(deps, { actorId: admin, body })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      await restore()
    }
  }, 120_000)
})

describe('publishing with only a language’s covers (0825)', () => {
  it('a live partner template goes on the web with a launched language’s complete set, not an upcoming one’s', async () => {
    const zhOnly = await seedTemplate(db, { visibleIn: ['partner'] })
    const jaOnly = await seedTemplate(db, { visibleIn: ['partner'] })
    await db.query("update public.templates set description = 'One line.' where id = any($1)", [[zhOnly, jaOnly]])
    await setLocale({ p_template_id: zhOnly, p_locale: 'zh', p_patch: { before: 'https://a.test/zb.webp', after: 'https://a.test/za.webp' } })
    await setLocale({ p_template_id: jaOnly, p_locale: 'ja', p_patch: { before: 'https://a.test/jb.webp', after: 'https://a.test/ja.webp' } })
    const outcome = await bulkEditTemplates(service, admin, { ids: [zhOnly, jaOnly], patch: { visibleIn: ['web', 'partner'] } }, CREDITS_FLOOR)
    expect(outcome.failures).toEqual([{ id: jaOnly, name: 'T4 test', reason: 'web_incomplete' }])
    const ok = await bulkEditTemplates(service, admin, { ids: [zhOnly], patch: { visibleIn: ['web', 'partner'] } }, CREDITS_FLOOR)
    expect(ok).toMatchObject({ failures: [], changed: 1 })
  })

  it('a common "before" with a zh "after" counts (what 「设为中文封面」 writes when a common "before" exists)', async () => {
    const mixed = await seedTemplate(db, { visibleIn: ['partner'] })
    await db.query("update public.templates set description = 'One line.', cover_before_url = 'https://a.test/b.webp' where id = $1", [mixed])
    await setLocale({ p_template_id: mixed, p_locale: 'zh', p_patch: { after: 'https://a.test/za.webp' } })
    const outcome = await bulkEditTemplates(service, admin, { ids: [mixed], patch: { visibleIn: ['web', 'partner'] } }, CREDITS_FLOOR)
    expect(outcome).toMatchObject({ failures: [], changed: 1 })
  })
})
