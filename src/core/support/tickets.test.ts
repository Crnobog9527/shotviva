import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('../alerts', () => ({ notifyOwner: mocks.notify }))

const { addTicketMessage } = await import('./tickets')

const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const TICKET = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'

function db(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

beforeEach(() => mocks.notify.mockClear())

describe('addTicketMessage', () => {
  it('turns a closed ticket into TICKET_CLOSED and alerts nobody', async () => {
    const { client, rpc } = db({ data: null, error: { message: 'TICKET_CLOSED' } })
    await expect(addTicketMessage(client, USER, { ticketId: TICKET, body: 'Still broken' })).rejects.toMatchObject({ code: 'TICKET_CLOSED' })
    expect(rpc).toHaveBeenCalledWith('add_ticket_message', { p_ticket_id: TICKET, p_user_id: USER, p_body: 'Still broken', p_images: [] })
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('alerts the Owner once the message is stored', async () => {
    const { client } = db({ data: { id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b' }, error: null })
    await addTicketMessage(client, USER, { ticketId: TICKET, body: 'Still broken' })
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ticket', ticketId: TICKET, reply: true }))
  })
})
