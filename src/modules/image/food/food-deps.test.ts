import { beforeEach, describe, expect, it, vi } from 'vitest'

const activeCredentials = vi.fn()
vi.mock('@/core/providers', () => ({ activeCredentials }))
vi.mock('@/core/dishware', () => ({ cachedActiveDishware: vi.fn(), loadActiveDishware: vi.fn() }))

const { dishReader } = await import('./food-deps')

const row = (tag: string, model: string) => ({
  tag, adapter: 'openai_responses', prices: { inputTextPerM: 1, inputImagePerM: null, outputPerM: 2 },
  config: { baseUrl: 'https://openrouter.ai/api/v1', model, apiKey: 'k' },
})

describe('which line reads the dish (§5.1c)', () => {
  beforeEach(() => activeCredentials.mockReset())

  it('uses the active dish-reading row, so the judge keeps its own model', async () => {
    activeCredentials.mockImplementation(async (module: string) => (module === 'dish_read' ? row('sol-row/openai/gpt-6-sol', 'openai/gpt-6-sol') : row('judge/luna', 'luna')))
    const reader = await dishReader()
    expect(reader?.tag).toBe('sol-row/openai/gpt-6-sol')
    expect(activeCredentials).toHaveBeenCalledTimes(1)
    expect(activeCredentials).toHaveBeenCalledWith('dish_read', undefined)
  })

  it('falls back to the judge row without one, and to none at all', async () => {
    activeCredentials.mockImplementation(async (module: string) => (module === 'decision' ? row('judge/luna', 'luna') : null))
    expect((await dishReader())?.tag).toBe('judge/luna')
    activeCredentials.mockResolvedValue(null)
    expect(await dishReader()).toBeNull()
  })
})
