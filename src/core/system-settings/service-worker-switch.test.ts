import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
const { serviceWorkerOrOff } = await import('./service-worker-switch')

// The service worker's admin switch (system_settings service_worker_enabled, 1999): off unless the
// stored value says on; a failed read is off (the worker unregisters itself), for a minute.
describe('service worker switch', () => {
  it('is off without a row, on only for true', async () => {
    await expect(serviceWorkerOrOff(async () => undefined)).resolves.toBe(false)
    await expect(serviceWorkerOrOff(async () => 'yes')).resolves.toBe(false)
    await expect(serviceWorkerOrOff(async () => true)).resolves.toBe(true)
  })

  it('a failed read is off', async () => {
    await expect(serviceWorkerOrOff(async () => { throw new Error('db down') })).resolves.toBe(false)
  })
})
