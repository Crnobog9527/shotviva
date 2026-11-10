import { expect, it, vi } from 'vitest'
import { executeCells } from './matrix-submit'
import { labRequest } from './api'

vi.mock('./api', () => ({ labRequest: vi.fn(), labError: String }))

it('starts a full twelve-cell matrix in two waves and skips claimed cells on resume', async () => {
  const release: (() => void)[] = []
  vi.mocked(labRequest).mockImplementation(() => new Promise<void>(resolve => release.push(resolve)))
  const cells = Array.from({ length: 12 }, (_, i) => ({ id: String(i), status: 'queued' as const }))
  const changed = vi.fn()
  const run = executeCells([...cells, { id: 'claimed', status: 'running' }], changed)
  expect(labRequest).toHaveBeenCalledTimes(6)
  release.splice(0).forEach(done => done())
  await vi.waitFor(() => expect(labRequest).toHaveBeenCalledTimes(12))
  release.splice(0).forEach(done => done())
  await run
  expect(labRequest).not.toHaveBeenCalledWith('run', { runId: 'claimed' })
  expect(changed).toHaveBeenCalledTimes(1)
})
