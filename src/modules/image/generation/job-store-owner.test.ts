import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { TrackedJob } from './job-model'
import { encodeState } from './store-persistence'

vi.mock('./job-api', () => ({ readJob: vi.fn(), submitJob: vi.fn(() => new Promise(() => {})) }))

// T107 validation (2026-11-11): qa-creator's finished batch showed in qa-free's workspace after a
// magic-link sign-in in the same tab. The store now belongs to the signed-in account.

const KEY = 'shotviva.generations'
const storage = new Map<string, string>()

const job = (id: string, patch: Partial<TrackedJob> = {}): TrackedJob => ({
  id, templateId: 'qa-t61-a', templateName: 'QA', resolution: '1k', aspect: 'original', credits: 43,
  inputKey: `inputs/a/${id}.jpg`, batchSize: 3, queuedAt: Date.now(), startedAt: Date.now(), sentAt: Date.now(),
  status: 'succeeded', fileUrl: `/api/files/${id}`, creditPool: 'paid', failure: null, settledAt: Date.now(),
  body: { template_id: 'qa-t61-a', input_key: `inputs/a/${id}.jpg`, inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' }, batch_size: 3 },
  ...patch,
})

function stored(owner: string | undefined, jobs: TrackedJob[]) {
  storage.set(KEY, encodeState({ limit: 3, jobs, views: { 'qa-t61-a': jobs.map((j) => j.id) }, owner }))
}

// A new module store each time, like a new page load (the mocked job-api comes back new too).
async function freshStore() {
  vi.resetModules()
  return { ...(await import('./job-store')), submitJob: (await import('./job-api')).submitJob }
}

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('window', {})
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

it('drops another account’s batch, in memory and in the tab’s storage', async () => {
  stored('user-a', [job('a'), job('b'), job('c')])
  const store = await freshStore()
  store.claimStore('user-b')
  expect(store.getJobs()).toEqual([])
  expect(store.getWorkspaceJobs('qa-t61-a')).toEqual([])
  expect(JSON.parse(storage.get(KEY) ?? '{}')).toMatchObject({ jobs: [], views: {}, owner: 'user-b' })
})

it('drops a state from before the owner field (nobody’s)', async () => {
  stored(undefined, [job('a')])
  const store = await freshStore()
  store.claimStore('user-b')
  expect(store.getJobs()).toEqual([])
})

it('keeps the same account’s batch across a reload', async () => {
  stored('user-a', [job('a')])
  const store = await freshStore()
  store.claimStore('user-a')
  expect(store.getWorkspaceJobs('qa-t61-a')).toEqual(['a'])
})

it('resends restored unsettled jobs only once the same account is confirmed', async () => {
  stored('user-a', [job('a', { status: 'running', settledAt: undefined, fileUrl: null, creditPool: null })])
  const other = await freshStore()
  other.getJobs()
  await Promise.resolve()
  expect(other.submitJob).not.toHaveBeenCalled()
  other.claimStore('user-b')
  expect(other.submitJob).not.toHaveBeenCalled()

  stored('user-a', [job('a', { status: 'running', settledAt: undefined, fileUrl: null, creditPool: null })])
  const same = await freshStore()
  same.claimStore('user-a')
  expect(same.submitJob).toHaveBeenCalledTimes(1)
})

it('keeps jobs started in this page before the account was known (the home generator)', async () => {
  const store = await freshStore()
  store.enqueueJobs([{ templateId: 'food', templateName: 'Food', resolution: '1k', aspect: 'original', credits: 2, inputKey: 'inputs/b/x.jpg',
    body: { template_id: 'food', input_key: 'inputs/b/x.jpg', inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' } } }], 1)
  store.claimStore('user-b')
  expect(store.getJobs()).toHaveLength(1)
})
