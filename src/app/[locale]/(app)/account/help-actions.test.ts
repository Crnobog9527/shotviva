import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const mocks = vi.hoisted(() => ({ addTicketMessage: vi.fn(), withTicketImages: vi.fn() }))

vi.mock('@/core/auth', () => ({
  requireApiUser: vi.fn(async () => ({ id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11' })),
  createAdminSupabase: vi.fn(() => ({})),
  createServerSupabase: vi.fn(async () => ({})),
}))
vi.mock('@/core/storage', () => ({ r2Store: vi.fn(() => ({})) }))
vi.mock('@/core/jobs', () => ({ jobRefsOrShort: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }))
vi.mock('@/core/support', async (original) => ({
  ...(await original<typeof import('@/core/support')>()),
  addTicketMessage: mocks.addTicketMessage,
  withTicketImages: mocks.withTicketImages,
}))

const { addMessageAction } = await import('./help-actions')

const TICKET = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
const form = () => {
  const data = new FormData()
  data.set('body', 'Still broken')
  return data
}

beforeEach(() => {
  mocks.addTicketMessage.mockReset()
  mocks.withTicketImages.mockReset().mockImplementation(async (_store, _target, _keys, write: (images: never[]) => Promise<unknown>) => write([]))
})

describe('addMessageAction', () => {
  it('answers TICKET_CLOSED when the Owner closed the ticket', async () => {
    mocks.addTicketMessage.mockRejectedValue(new AppError('TICKET_CLOSED', 'TICKET_CLOSED'))
    expect(await addMessageAction(TICKET, { error: null }, form())).toEqual({ error: 'TICKET_CLOSED' })
  })

  it('sends to an open ticket', async () => {
    mocks.addTicketMessage.mockResolvedValue(undefined)
    const state = await addMessageAction(TICKET, { error: null }, form())
    expect(state).toMatchObject({ error: null, sentAt: expect.any(Number) })
    expect(mocks.addTicketMessage).toHaveBeenCalledWith({}, '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', { ticketId: TICKET, body: 'Still broken' }, [])
  })
})
