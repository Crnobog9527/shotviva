import sharp from 'sharp'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRequest, isWishlistEligible, listAdminRequests, reviewRequest, toggleVote } from '@/core/wishlist'

import { connectAdmin } from './helpers'
import { serviceSupabase } from './supabase-env'
import { requestRow, succeededJob, uploadInput, wishlistDeps, wishlistUser } from './wishlist-fixtures'

// LAUNCH §9.6 items 1 and 3 on the real database: the threshold, and rejecting deletes the
// reference images (R2 is the in-memory fake, AGENTS §7).

let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

const objectsUnder = (memory: ReturnType<typeof wishlistDeps>['memory'], prefix: string) =>
  [...memory.objects.keys()].filter((key) => key.startsWith(prefix))

describe('threshold: one succeeded generation (§15.1)', () => {
  it('turns on only after a succeeded job; a failed one does not count', async () => {
    const user = await wishlistUser(db, { eligible: false })
    expect(await isWishlistEligible(serviceSupabase(), user.id)).toBe(false)
    await succeededJob(db, user.id, 'failed')
    expect(await isWishlistEligible(serviceSupabase(), user.id)).toBe(false)
    await succeededJob(db, user.id)
    expect(await isWishlistEligible(serviceSupabase(), user.id)).toBe(true)
  })

  it('refuses posting (leaving no reference images behind) and voting for an ineligible account', async () => {
    const author = await wishlistUser(db)
    const newcomer = await wishlistUser(db, { eligible: false })
    const { deps, memory } = wishlistDeps()
    const live = await createRequest(deps, author.id, { description: 'Neon menu', input_keys: [await uploadInput(memory, author.id)] })
    await reviewRequest(deps, { id: live.id, action: 'approve' })

    const key = await uploadInput(memory, newcomer.id)
    await expect(createRequest(deps, newcomer.id, { description: 'x', input_keys: [key] })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(objectsUnder(memory, `requests/${newcomer.id}/`)).toEqual([])
    await expect(toggleVote(deps.db, newcomer.id, live.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('is checked inside the SQL function too, so no caller can skip it', async () => {
    const newcomer = await wishlistUser(db, { eligible: false })
    const { error } = await serviceSupabase().rpc('create_template_request', {
      p_user_id: newcomer.id,
      p_description: 'x',
      p_image_keys: [`requests/${newcomer.id}/00000000-0000-4000-8000-000000000000.jpg`],
    })
    expect(error?.message).toBe('WISHLIST_NOT_ELIGIBLE')
  })

  it('locks out a banned account', async () => {
    const user = await wishlistUser(db)
    await db.query('update public.profiles set banned_at = now() where id = $1', [user.id])
    expect(await isWishlistEligible(serviceSupabase(), user.id)).toBe(false)
  })
})

describe('posting', () => {
  it('re-encodes each upload into requests/{user_id}/{uuid}.jpg without EXIF and starts pending', async () => {
    const user = await wishlistUser(db, { fullName: 'jamie Doe' })
    const { deps, memory } = wishlistDeps()
    const keys = [await uploadInput(memory, user.id, { exif: true }), await uploadInput(memory, user.id)]
    const created = await createRequest(deps, user.id, { description: '  Dark moody brunch poster  ', input_keys: keys })

    expect(created.status).toBe('pending')
    expect(created.description).toBe('Dark moody brunch poster')
    expect(created.author_label).toBe('J***')
    expect(created.image_keys).toHaveLength(2)
    for (const key of created.image_keys) {
      expect(key).toMatch(new RegExp(`^requests/${user.id}/[0-9a-f-]{36}\\.jpg$`))
      const stored = memory.objects.get(key)
      expect(stored?.contentType).toBe('image/jpeg')
      expect((await sharp(stored!.body).metadata()).exif).toBeUndefined()
    }
  })

  it('masks email sign-ups to the first letter too, never the address', async () => {
    const user = await wishlistUser(db)
    const { deps, memory } = wishlistDeps()
    const created = await createRequest(deps, user.id, { description: 'x', input_keys: [await uploadInput(memory, user.id)] })
    expect(created.author_label).toBe('T***')
  })

  it('refuses someone else’s upload, bad input, and a sixth post in a day', async () => {
    const user = await wishlistUser(db)
    const other = await wishlistUser(db)
    const { deps, memory } = wishlistDeps()
    const theirs = await uploadInput(memory, other.id)
    await expect(createRequest(deps, user.id, { description: 'x', input_keys: [theirs] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(createRequest(deps, user.id, { description: 'x'.repeat(301), input_keys: [theirs] })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    await expect(createRequest(deps, user.id, { description: 'x', input_keys: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })

    for (let i = 0; i < 5; i += 1) {
      await createRequest(deps, user.id, { description: `post ${i}`, input_keys: [await uploadInput(memory, user.id)] })
    }
    const before = objectsUnder(memory, `requests/${user.id}/`).length
    const sixth = createRequest(deps, user.id, { description: 'six', input_keys: [await uploadInput(memory, user.id)] })
    await expect(sixth).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    // The refused post's re-encoded image was removed again.
    expect(objectsUnder(memory, `requests/${user.id}/`)).toHaveLength(before)
  })
})

describe('review: reject deletes the reference images (§15.1)', () => {
  it('deletes the images of a rejected pending request and empties image_keys', async () => {
    const user = await wishlistUser(db)
    const { deps, memory } = wishlistDeps()
    const created = await createRequest(deps, user.id, { description: 'x', input_keys: [await uploadInput(memory, user.id)] })
    expect(objectsUnder(memory, `requests/${user.id}/`)).toHaveLength(1)

    await reviewRequest(deps, { id: created.id, action: 'reject' })
    expect(objectsUnder(memory, `requests/${user.id}/`)).toEqual([])
    expect(await requestRow(db, created.id)).toMatchObject({ status: 'rejected', image_keys: [] })
  })

  it('deletes them when a live request is taken down', async () => {
    const user = await wishlistUser(db)
    const { deps, memory } = wishlistDeps()
    const created = await createRequest(deps, user.id, { description: 'x', input_keys: [await uploadInput(memory, user.id)] })
    await reviewRequest(deps, { id: created.id, action: 'approve' })
    await reviewRequest(deps, { id: created.id, action: 'reject' })
    expect(objectsUnder(memory, `requests/${user.id}/`)).toEqual([])
    expect((await requestRow(db, created.id))?.status).toBe('rejected')
  })

  it('keeps images on approve and ship, links the template, and refuses moves off the machine', async () => {
    const user = await wishlistUser(db)
    const { deps, memory } = wishlistDeps()
    const created = await createRequest(deps, user.id, { description: 'x', input_keys: [await uploadInput(memory, user.id)] })
    await expect(reviewRequest(deps, { id: created.id, action: 'ship', templateId: 'freeform' })).rejects.toMatchObject({ code: 'CONFLICT' })
    await reviewRequest(deps, { id: created.id, action: 'approve' })
    await expect(reviewRequest(deps, { id: created.id, action: 'ship', templateId: 'no-such' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await reviewRequest(deps, { id: created.id, action: 'ship', templateId: 'freeform' })

    expect(await requestRow(db, created.id)).toMatchObject({ status: 'shipped', template_id: 'freeform' })
    expect(objectsUnder(memory, `requests/${user.id}/`)).toHaveLength(1)
    await expect(reviewRequest(deps, { id: created.id, action: 'reject' })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(objectsUnder(memory, `requests/${user.id}/`)).toHaveLength(1)
  })

  it('keeps the rejection when R2 fails to delete, leaving the orphans to account deletion', async () => {
    const user = await wishlistUser(db)
    const { deps, memory } = wishlistDeps()
    const created = await createRequest(deps, user.id, { description: 'x', input_keys: [await uploadInput(memory, user.id)] })
    const failing = { ...deps, store: { ...memory.store, delete: async () => Promise.reject(new Error('r2 down')) } }
    await reviewRequest(failing, { id: created.id, action: 'reject' })
    expect(await requestRow(db, created.id)).toMatchObject({ status: 'rejected', image_keys: [] })
    expect(objectsUnder(memory, `requests/${user.id}/`)).toHaveLength(1)
  })

  it('lists requests for the admin with the author email and signed image links', async () => {
    const user = await wishlistUser(db)
    const { deps, memory } = wishlistDeps()
    const created = await createRequest(deps, user.id, { description: 'admin list', input_keys: [await uploadInput(memory, user.id)] })
    const listed = (await listAdminRequests(deps)).find((request) => request.id === created.id)
    expect(listed).toMatchObject({ email: user.email, status: 'pending', description: 'admin list' })
    expect(listed?.imageUrls[0]).toMatch(/^memory:\/\/get\/requests\//)
  })
})
