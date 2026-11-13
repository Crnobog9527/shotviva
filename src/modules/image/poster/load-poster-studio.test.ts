import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { toStudioTemplate } = await import('./load-poster-studio')

const poster = { kinds: [{ key: 'prizes', name: { en: 'P', zh: '奖品' }, blocks: ['header', 'prizes', 'footer'], capacity: {} }] }

describe('toStudioTemplate', () => {
  it('offers only the template sizes the model makes, and never 1K', () => {
    const template = {
      id: 't', name: 'T', creditsCost: { '1k': 1, '2k': 2, '4k': 3 },
      fields: { aspectRatios: ['1:2', '1:3', '9:16'], poster },
      imageOptions: { resolutions: ['1k', '2k', '4k'], aspectRatios: ['9:16', '1:2'], originalRatio: true },
    }
    expect(toStudioTemplate(template as never)).toMatchObject({ aspects: ['1:2', '9:16'], resolutions: ['2k', '4k'] })
  })

  it('is null for a template that makes no posters', () => {
    expect(toStudioTemplate({ fields: { aspectRatios: ['1:1'] } } as never)).toBeNull()
  })
})
