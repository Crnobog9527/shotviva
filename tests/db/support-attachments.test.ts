import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { addTicketMessage, createTicket, loadAdminTicket, loadMyThread, replyTicket, type TicketImageRow } from '@/core/support'

import { anonClient, connectAdmin, createUser } from './helpers'
import { ticket } from './support-fixtures'
import { serviceSupabase } from './supabase-env'
import { signedIn, wishlistUser } from './wishlist-fixtures'

// T69 (TASKS T69 验收) on the real database: at most 3 images per message, each filed under the
// ticket's author and the ticket, malformed entries refused with nothing written, RLS like the
// messages, the Owner's images, the account-deletion cascade, and the pre-T69 call still working.

let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

const image = (authorId: string, ticketId: string, extra: Partial<TicketImageRow> = {}): TicketImageRow => ({
  object_key: `tickets/${authorId}/${ticketId}/${randomUUID()}.webp`,
  content_type: 'image/webp',
  bytes: 120_000,
  width: 1536,
  height: 2048,
  ...extra,
})

const images = (n: number, authorId: string, ticketId: string) => Array.from({ length: n }, () => image(authorId, ticketId))

async function attachmentsOf(ticketId: string) {
  const { rows } = await db.query<{ message_id: string; object_key: string }>(
    'select message_id::text, object_key from public.support_ticket_attachments where ticket_id = $1 order by created_at',
    [ticketId],
  )
  return rows
}

async function ticketExists(ticketId: string) {
  const { rowCount } = await db.query('select 1 from public.support_tickets where id = $1', [ticketId])
  return rowCount === 1
}

function newTicket(authorId: string, rows: (ticketId: string) => TicketImageRow[]) {
  const ticketId = randomUUID()
  const promise = createTicket(serviceSupabase(), authorId, { type: 'image_issue', body: 'See the screenshots' }, { ticketId, images: rows(ticketId) })
  return { ticketId, promise }
}

describe('a new ticket with images', () => {
  it('takes 3 images on the first message, under the id the server chose', async () => {
    const author = await createUser(db)
    const { ticketId, promise } = newTicket(author, (id) => images(3, author, id))
    await expect(promise).resolves.toBe(ticketId)
    const rows = await attachmentsOf(ticketId)
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((row) => row.message_id)).size).toBe(1)
  })

  it('refuses a 4th image and writes nothing', async () => {
    const author = await createUser(db)
    const { ticketId, promise } = newTicket(author, (id) => images(4, author, id))
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await ticketExists(ticketId)).toBe(false)
  })

  it.each([
    ['filed under another account', (_author: string, id: string) => image(randomUUID(), id)],
    ['filed under another ticket', (author: string) => image(author, randomUUID())],
    ['not WebP', (author: string, id: string) => image(author, id, { content_type: 'image/png' as 'image/webp' })],
    ['over 10 MB', (author: string, id: string) => image(author, id, { bytes: 10 * 1024 * 1024 + 1 })],
    ['without a size', (author: string, id: string) => ({ ...image(author, id), width: undefined as unknown as number })],
    ['with a key that is not ours', (author: string, id: string) => image(author, id, { object_key: `tickets/${author}/${id}/../../outputs/x.webp` })],
  ])('refuses an image %s and writes nothing', async (_, make) => {
    const author = await createUser(db)
    const { ticketId, promise } = newTicket(author, (id) => [make(author, id)])
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await ticketExists(ticketId)).toBe(false)
  })

  it('still takes the pre-T69 call without the new arguments (expand-safe)', async () => {
    const author = await createUser(db)
    const { data, error } = await serviceSupabase().rpc('create_support_ticket', {
      p_user_id: author,
      p_type: 'feedback',
      p_body: 'Old caller',
      p_payment_id: null,
      p_job_id: null,
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({ user_id: author })
  })
})

describe('adding to a ticket with images', () => {
  it('takes up to 3 per message, each message counted on its own', async () => {
    const author = await createUser(db)
    const id = await ticket(author)
    await addTicketMessage(serviceSupabase(), author, { ticketId: id, body: 'One more' }, images(3, author, id))
    await addTicketMessage(serviceSupabase(), author, { ticketId: id, body: 'And another' }, images(2, author, id))
    expect(await attachmentsOf(id)).toHaveLength(5)
    await expect(addTicketMessage(serviceSupabase(), author, { ticketId: id, body: 'Too many' }, images(4, author, id))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    expect(await attachmentsOf(id)).toHaveLength(5)
  })

  it('refuses someone else’s ticket, also with images filed under it', async () => {
    const author = await createUser(db)
    const other = await createUser(db)
    const id = await ticket(author)
    await expect(addTicketMessage(serviceSupabase(), other, { ticketId: id, body: 'hi' }, images(1, author, id))).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await attachmentsOf(id)).toHaveLength(0)
  })
})

describe('RLS: only the author sees a ticket’s images', () => {
  it('shows them in the author’s thread and nowhere else', async () => {
    const author = await wishlistUser(db, { session: true, eligible: false })
    const other = await wishlistUser(db, { session: true, eligible: false })
    const { ticketId, promise } = newTicket(author.id, (id) => images(2, author.id, id))
    await promise

    const mine = await loadMyThread(await signedIn(author), ticketId)
    expect(mine?.messages[0]?.attachments).toHaveLength(2)
    expect(mine?.messages[0]?.attachments[0]).toMatchObject({ width: 1536, height: 2048 })

    const theirs = await signedIn(other)
    expect(await loadMyThread(theirs, ticketId)).toBeNull()
    const direct = await theirs.from('support_ticket_attachments').select('object_key').eq('ticket_id', ticketId)
    expect(direct.data).toEqual([])
    expect((await anonClient().select('support_ticket_attachments')).ok).toBe(false)
  })

  it('lets no client write rows or call the helper', async () => {
    const author = await wishlistUser(db, { session: true, eligible: false })
    const client = await signedIn(author)
    const id = await ticket(author.id)
    const { rows } = await db.query<{ id: string }>('select id::text from public.support_ticket_messages where ticket_id = $1', [id])
    const insert = await client.from('support_ticket_attachments').insert({ ...image(author.id, id), message_id: rows[0]!.id, ticket_id: id })
    expect(insert.error).not.toBeNull()
    const helper = await serviceSupabase().rpc('attach_ticket_images', {
      p_ticket_id: id,
      p_owner_id: author.id,
      p_message_id: rows[0]!.id,
      p_images: [image(author.id, id)],
    })
    expect(helper.error).not.toBeNull()
  })
})

describe('the Owner’s reply', () => {
  it('carries images filed under the ticket’s author', async () => {
    const author = await createUser(db)
    const id = await ticket(author)
    await replyTicket(serviceSupabase(), { ticketId: id, body: 'Here is what we see', close: false }, images(2, author, id))
    const loaded = await loadAdminTicket(serviceSupabase(), id)
    expect(loaded?.messages.at(-1)).toMatchObject({ author: 'admin' })
    expect(loaded?.messages.at(-1)?.attachments).toHaveLength(2)
  })

  it('refuses images on a bare close, and images under someone else', async () => {
    const author = await createUser(db)
    const id = await ticket(author)
    const close = await serviceSupabase().rpc('admin_reply_ticket', { p_ticket_id: id, p_body: '', p_close: true, p_images: images(1, author, id) })
    expect(close.error?.message).toBe('INVALID_INPUT')
    await expect(replyTicket(serviceSupabase(), { ticketId: id, body: 'x', close: false }, images(1, randomUUID(), id))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    expect(await attachmentsOf(id)).toHaveLength(0)
  })
})

describe('account deletion', () => {
  it('deletes the image rows with the account (the files go by the tickets/<user>/ prefix)', async () => {
    const author = await createUser(db)
    const { ticketId, promise } = newTicket(author, (id) => images(2, author, id))
    await promise
    await db.query('delete from auth.users where id = $1', [author])
    expect(await attachmentsOf(ticketId)).toHaveLength(0)
  })
})
