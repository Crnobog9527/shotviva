import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: () => undefined, cacheTag: () => undefined }))

const { pickVessel, readVesselBytes } = await import('./read')
const { createMemoryStore } = await import('../../../tests/fakes/memory-store')

const item = (id: string, category: 'long' | 'cold', isActive = true) => ({
  id, label: id, category, shape: 's', imageKey: `dishware/${id}.webp`, width: 1, height: 1, isActive,
})

describe('vessel pick (§5.1c)', () => {
  it('picks at random within the category, never an inactive one', () => {
    const items = [item('a', 'long'), item('b', 'cold'), item('c', 'long'), item('d', 'long', false)]
    expect(pickVessel(items, 'long', () => 1)?.id).toBe('c')
    expect(pickVessel(items, 'long', (n) => { expect(n).toBe(2); return 0 })?.id).toBe('a')
    expect(pickVessel(items, 'cold', () => 0)?.id).toBe('b')
    expect(pickVessel([item('d', 'long', false)], 'long')).toBeNull()
  })

  it('skips a vessel that looks like the user own and draws again within the category, none when only those remain', () => {
    const plate = (id: string, shape: string) => ({ ...item(id, 'long'), shape })
    const items = [plate('white-oval', 'A white oval plate with a wide rim'), plate('teardrop', 'A teardrop platter, satin ivory glaze')]
    const user = 'A white oval platter'
    for (const pick of [() => 0, () => 0]) expect(pickVessel(items, 'long', pick, user)?.id).toBe('teardrop')
    expect(pickVessel([items[0]!], 'long', () => 0, user)).toBeNull()
    expect(pickVessel([items[0]!], 'long', () => 0)?.id).toBe('white-oval')
  })

  it('reads a vessel once per process and retries a failed read', async () => {
    const r2 = createMemoryStore()
    await expect(readVesselBytes(r2.store, 'dishware/missing.webp')).rejects.toThrow()
    r2.upload('dishware/missing.webp', Uint8Array.of(1, 2), 'image/webp')
    await expect(readVesselBytes(r2.store, 'dishware/missing.webp')).resolves.toEqual(Uint8Array.of(1, 2))
  })
})
