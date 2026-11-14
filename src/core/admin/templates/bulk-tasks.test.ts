import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }))
vi.mock('@/core/logger', () => ({ logger }))

const { deleteTemplates, setTemplatesSale } = await import('./bulk-tasks')

type RpcError = { message: string; details?: string; code?: string }
// Each rpc call answers with the next entry (null = success) and is recorded.
function fakeClient(answers: (RpcError | null)[]) {
  const rpc = vi.fn(async () => ({ data: true, error: answers.shift() ?? null }))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

beforeEach(() => logger.info.mockReset())

describe('批量删除', () => {
  it('calls the single delete function once per template and reports refusals per template', async () => {
    const { client, rpc } = fakeClient([null, { message: 'TEMPLATE_LIVE' }, { message: 'x', code: 'P0002' }])
    const outcome = await deleteTemplates(client, 'admin-1', { ids: ['a', 'b', 'c'] })
    expect(rpc).toHaveBeenNthCalledWith(1, 'admin_delete_template', { p_actor: 'admin-1', p_id: 'a' })
    expect(outcome).toEqual({ done: ['a'], skipped: [{ id: 'b', reason: '已上架，先下架才能删除' }, { id: 'c', reason: '模板已不存在' }] })
    expect(logger.info).toHaveBeenCalledTimes(1)
  })

  it('stops on a non-admin and on errors it cannot explain', async () => {
    await expect(deleteTemplates(fakeClient([{ message: 'NOT_ADMIN' }]).client, 'u', { ids: ['a'] })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(deleteTemplates(fakeClient([{ message: 'boom' }]).client, 'u', { ids: ['a'] })).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('refuses duplicate or empty id lists before any call', async () => {
    const { client, rpc } = fakeClient([])
    await expect(deleteTemplates(client, 'u', { ids: ['a', 'a'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(deleteTemplates(client, 'u', { ids: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('批量售卖', () => {
  it('passes the floor refusal through in Chinese', async () => {
    const { client, rpc } = fakeClient([{ message: 'TEMPLATE_PRICE_BELOW_FLOOR', details: '所选模型的可用档位尚未确认' }, null])
    const outcome = await setTemplatesSale(client, 'admin-1', { ids: ['a', 'b'], enabled: true })
    expect(rpc).toHaveBeenLastCalledWith('admin_set_template_sale', { p_actor: 'admin-1', p_template_id: 'b', p_enabled: true })
    expect(outcome).toEqual({ done: ['b'], skipped: [{ id: 'a', reason: '所选模型的可用档位尚未确认' }] })
  })
})
