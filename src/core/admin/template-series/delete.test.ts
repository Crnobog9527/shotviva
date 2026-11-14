import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }))
vi.mock('@/core/logger', () => ({ logger }))

const { deleteAdminSeries } = await import('./delete')

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const D = '00000000-0000-4000-8000-00000000000d'
type Answer = { data: number | null; error: { message: string } | null }
function fakeClient(answers: Answer[]) {
  const rpc = vi.fn(async () => answers.shift() ?? { data: 0, error: null })
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

beforeEach(() => logger.info.mockReset())

describe('删除系列', () => {
  it('calls the audited function once per series and reports each one', async () => {
    const { client, rpc } = fakeClient([
      { data: 3, error: null }, { data: null, error: { message: 'SERIES_LIVE' } },
      { data: null, error: null }, { data: null, error: { message: 'SERIES_MISSING' } },
    ])
    const outcome = await deleteAdminSeries(client, 'admin-1', { ids: [A, B, C, D] })
    expect(rpc).toHaveBeenCalledTimes(4)
    expect(rpc).toHaveBeenNthCalledWith(1, 'admin_delete_template_series', { p_actor: 'admin-1', p_id: A })
    expect(outcome).toEqual({
      done: [{ id: A, moved: 3 }],
      skipped: [{ id: B, reason: '已上架，先下架才能删除' }, { id: C, reason: '已经删除过' }, { id: D, reason: '系列已不存在' }],
    })
    expect(logger.info).toHaveBeenCalledTimes(1)
  })

  it('refuses bad input before calling, and stops on a non-admin or an unknown error', async () => {
    const { client, rpc } = fakeClient([])
    await expect(deleteAdminSeries(client, 'u', { ids: ['not-a-uuid'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(deleteAdminSeries(client, 'u', { ids: [A, A] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(rpc).not.toHaveBeenCalled()
    await expect(deleteAdminSeries(fakeClient([{ data: null, error: { message: 'NOT_ADMIN' } }]).client, 'u', { ids: [A] }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(deleteAdminSeries(fakeClient([{ data: null, error: { message: 'boom' } }]).client, 'u', { ids: [A] }))
      .rejects.toMatchObject({ code: 'INTERNAL' })
  })
})
