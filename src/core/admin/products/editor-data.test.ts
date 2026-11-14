import { expect, it, vi } from 'vitest'
import { readPage } from './editor-data'

it('serves the phase-one read-only list when the editing RPC is missing, and propagates other errors', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'missing function', code: 'PGRST202' } })
    .mockResolvedValueOnce({ data: null, error: { message: 'permission denied', code: '42501' } })
    .mockResolvedValueOnce({ data: [], error: null })
  await expect(readPage({ rpc }, 'admin', '')).resolves.toBeNull()
  await expect(readPage({ rpc }, 'admin', '')).rejects.toThrow()
  await expect(readPage({ rpc }, 'admin', '')).resolves.toEqual([])
})
