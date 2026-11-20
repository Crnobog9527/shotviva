import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAdminPost, listAdminPosts, savePost, setPostStatus } from '@/core/admin'
import { readPublishedPost, readPublishedPosts, readSitemapPosts } from '@/core/blog'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// Blog CMS v1 (1600, 1601): RLS shows only published rows to the public, writes go through the
// two admin functions (admin check, audit row), and the commands the admin page calls.

let db: Client
let admin: string
let member: string
const service = serviceSupabase()
const anon = anonSupabase()
const run = Math.random().toString(36).slice(2, 8)
const slug = (name: string) => `${name}-${run}`

const input = (patch: Record<string, unknown> = {}) => ({
  id: null,
  locale: 'en',
  slug: slug('post'),
  title: 'Best AI food photo tools',
  description: 'A comparison of tools',
  bodyMd: '## One\n\nText.',
  coverUrl: null,
  coverAlt: null,
  authorName: 'Shotviva Team',
  ...patch,
})

const auditOf = async (target: string) =>
  (await db.query<{ action: string; user_id: string }>('select action, user_id from public.admin_audit_log where target_id = $1 order by id', [target])).rows

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  member = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
})

afterAll(async () => {
  await db.query('delete from public.blog_posts where slug like $1', [`%-${run}`])
  await db.end()
})

describe('blog_posts access', () => {
  it('shows the public published rows only, and never created_by', async () => {
    const draft = await savePost(service, admin, input({ slug: slug('hidden') }))
    const live = await savePost(service, admin, input({ slug: slug('shown') }))
    await setPostStatus(service, admin, { id: live.id, publish: true })

    const { data, error } = await anon.from('blog_posts').select('id, slug, status').like('slug', `%-${run}`)
    expect(error).toBeNull()
    expect(data?.map((row) => row.id)).toEqual([live.id])
    expect(data?.map((row) => row.id)).not.toContain(draft.id)
    expect((await anon.from('blog_posts').select('created_by')).error?.message ?? '').toMatch(/permission denied/i)
  })

  it('refuses every write from the public client', async () => {
    const row = { locale: 'en', slug: slug('sneaky'), title: 't', description: 'd', author_name: 'a' }
    expect((await anon.from('blog_posts').insert(row)).error).not.toBeNull()
    const live = await readPublishedPosts(anon, 'en')
    if (live[0]) {
      await anon.from('blog_posts').update({ title: 'defaced' }).eq('id', live[0].id)
      await anon.from('blog_posts').delete().eq('id', live[0].id)
      const after = await db.query('select title from public.blog_posts where id = $1', [live[0].id])
      expect(after.rows[0].title).not.toBe('defaced')
    }
  })

  it('refuses the two admin functions to the public client', async () => {
    const { error } = await anon.rpc('admin_blog_save', {
      p_actor: admin, p_id: null, p_locale: 'en', p_slug: slug('rpc'), p_title: 't', p_description: 'd', p_body_md: '', p_cover_url: null, p_cover_alt: null, p_author_name: 'a',
    })
    expect(error).not.toBeNull()
    expect((await anon.rpc('admin_blog_set_status', { p_actor: admin, p_id: crypto.randomUUID(), p_publish: true })).error).not.toBeNull()
  })

  it('checks the shape in the database too', async () => {
    const insert = (cols: string, values: unknown[]) =>
      db.query(
        `insert into public.blog_posts (locale, slug, title, description, author_name, ${cols}) values ('en', $1, 't', 'd', 'a', ${values.map((_, i) => `$${i + 2}`).join(', ')})`,
        [slug('shape'), ...values],
      )
    await expect(db.query("insert into public.blog_posts (locale, slug, title, description, author_name) values ('en', 'Bad Slug', 't', 'd', 'a')")).rejects.toThrow(/slug/)
    await expect(db.query("insert into public.blog_posts (locale, slug, title, description, author_name) values ('fr', 'x', 't', 'd', 'a')")).rejects.toThrow(/locale/)
    await expect(insert('cover_url, cover_alt', ['javascript:alert(1)', 'x'])).rejects.toThrow(/cover_url/)
    await expect(insert('cover_url', ['https://example.com/a.webp'])).rejects.toThrow(/cover_alt_required/)
    await expect(insert('status', ['published'])).rejects.toThrow(/published_has_date/)
  })
})

describe('admin_blog_save', () => {
  it('refuses an actor who is not an admin, and writes nothing', async () => {
    await expect(savePost(service, member, input({ slug: slug('member') }))).rejects.toThrow()
    expect((await db.query('select 1 from public.blog_posts where slug = $1', [slug('member')])).rowCount).toBe(0)
  })

  it('creates a draft with its audit entry and rewrites it without touching the status', async () => {
    const saved = await savePost(service, admin, input({ slug: slug('create') }))
    expect(saved.status).toBe('draft')
    const again = await savePost(service, admin, input({ id: saved.id, slug: slug('create'), title: 'Renamed' }))
    expect(again).toMatchObject({ id: saved.id, status: 'draft' })
    expect((await getAdminPost(service, saved.id))?.title).toBe('Renamed')
    expect(await auditOf(saved.id)).toEqual([{ action: 'blog_save', user_id: admin }, { action: 'blog_save', user_id: admin }])
    expect((await db.query('select created_by from public.blog_posts where id = $1', [saved.id])).rows[0].created_by).toBe(admin)
  })

  it('keeps an address unique per language, and lets the two languages share one', async () => {
    await savePost(service, admin, input({ slug: slug('twin') }))
    await expect(savePost(service, admin, input({ slug: slug('twin') }))).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(savePost(service, admin, input({ slug: slug('twin'), locale: 'zh', title: '中文标题' }))).resolves.toMatchObject({ status: 'draft' })
  })

  it('fails for a post that does not exist', async () => {
    await expect(savePost(service, admin, input({ id: crypto.randomUUID(), slug: slug('ghost') }))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses to empty a published post, and still lets a draft be empty', async () => {
    const saved = await savePost(service, admin, input({ slug: slug('keep-body') }))
    await setPostStatus(service, admin, { id: saved.id, publish: true })
    await expect(savePost(service, admin, input({ id: saved.id, slug: slug('keep-body'), bodyMd: ' \n ' }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await getAdminPost(service, saved.id))?.body_md).toContain('Text.')
    await setPostStatus(service, admin, { id: saved.id, publish: false })
    await expect(savePost(service, admin, input({ id: saved.id, slug: slug('keep-body'), bodyMd: '' }))).resolves.toMatchObject({ status: 'draft' })
  })

  it('refuses bad input before the database', async () => {
    await expect(savePost(service, admin, input({ slug: 'Bad Slug' }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(savePost(service, admin, input({ coverUrl: 'https://example.com/a.webp', coverAlt: null }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('admin_blog_set_status', () => {
  it('publishes, takes down and republishes, keeping the first publish date and auditing each change once', async () => {
    const saved = await savePost(service, admin, input({ slug: slug('status') }))
    await setPostStatus(service, admin, { id: saved.id, publish: true })
    await setPostStatus(service, admin, { id: saved.id, publish: true })
    const first = (await getAdminPost(service, saved.id))?.published_at
    expect(first).not.toBeNull()
    expect((await readPublishedPost(anon, 'en', slug('status')))?.title).toBe('Best AI food photo tools')

    await setPostStatus(service, admin, { id: saved.id, publish: false })
    expect(await readPublishedPost(anon, 'en', slug('status'))).toBeNull()
    await setPostStatus(service, admin, { id: saved.id, publish: true })
    expect((await getAdminPost(service, saved.id))?.published_at).toBe(first)
    expect((await auditOf(saved.id)).map((row) => row.action)).toEqual(['blog_save', 'blog_publish', 'blog_unpublish', 'blog_publish'])
  })

  it('refuses a non-admin and an empty body', async () => {
    const saved = await savePost(service, admin, input({ slug: slug('guard'), bodyMd: '  \n ' }))
    await expect(setPostStatus(service, member, { id: saved.id, publish: true })).rejects.toThrow()
    await expect(setPostStatus(service, admin, { id: saved.id, publish: true })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await getAdminPost(service, saved.id))?.status).toBe('draft')
  })

  it('reports a missing post', async () => {
    await expect(setPostStatus(service, admin, { id: crypto.randomUUID(), publish: true })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('public reads', () => {
  it('lists newest first per language, with the sitemap rows, and 404s a draft by address', async () => {
    const older = await savePost(service, admin, input({ slug: slug('older'), locale: 'zh', title: '较早' }))
    const newer = await savePost(service, admin, input({ slug: slug('newer'), locale: 'zh', title: '较新' }))
    await savePost(service, admin, input({ slug: slug('draft-only'), locale: 'zh' }))
    await setPostStatus(service, admin, { id: older.id, publish: true })
    await setPostStatus(service, admin, { id: newer.id, publish: true })
    const mine = (await readPublishedPosts(anon, 'zh')).filter((post) => post.slug.endsWith(`-${run}`))
    expect(mine.map((post) => post.slug)).toEqual([slug('newer'), slug('older')])
    expect(await readPublishedPost(anon, 'zh', slug('draft-only'))).toBeNull()
    expect(await readPublishedPost(anon, 'en', slug('older'))).toBeNull()
    expect((await readSitemapPosts(anon)).filter((post) => post.slug === slug('older'))).toHaveLength(1)
    expect((await listAdminPosts(service)).items.length).toBeGreaterThan(0)
  })
})
