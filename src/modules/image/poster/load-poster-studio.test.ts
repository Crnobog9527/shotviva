import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { narrowToRoute, toStudioTemplate } = await import('./load-poster-studio')

const poster = { kinds: [{ key: 'prizes', name: { en: 'P', zh: '奖品' }, blocks: ['header', 'prizes', 'footer'], capacity: {} }] }

describe('toStudioTemplate', () => {
  it('offers only the template sizes the model makes, and every tier it makes, 1K included', () => {
    const template = {
      id: 't', name: 'T', creditsCost: { '1k': 1, '2k': 2, '4k': 3 },
      fields: { aspectRatios: ['1:2', '1:3', '9:16'], poster, images: { min: 0, max: 1, slots: [{ key: 'prize_photo', label: '奖品图', required: false }] } },
      imageOptions: { resolutions: ['1k', '2k', '4k'], aspectRatios: ['9:16', '1:2'], originalRatio: true },
    }
    expect(toStudioTemplate(template as never)).toMatchObject({ aspects: ['1:2', '9:16'], resolutions: ['1k', '2k', '4k'], slots: [{ key: 'prize_photo', label: '奖品图', required: false }] })
  })

  it('is null for a template that makes no posters', () => {
    expect(toStudioTemplate({ fields: { aspectRatios: ['1:1'] } } as never)).toBeNull()
  })

  it('drops sizes the bound model would refuse, keeping the order', () => {
    const studio = { id: 't', name: 'T', poster, aspects: ['1:2', '1:3', '9:16'], resolutions: ['2k'], creditsCost: {} }
    expect(narrowToRoute(studio as never, (aspect) => aspect === '9:16').aspects).toEqual(['9:16'])
  })
})
