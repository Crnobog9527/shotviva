import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const plateFrame = vi.fn()
const cachedHomeHero = vi.fn()
vi.mock('@/core/templates/cover-ratio', () => ({ plateFrame: (...args: unknown[]) => plateFrame(...args) }))
vi.mock('@/core/templates/cached-home-hero', () => ({ cachedHomeHero: (...args: unknown[]) => cachedHomeHero(...args) }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values: Record<string, string> = {}) =>
    ({ beforeAlt: `phone ${values.name}`, afterAlt: `ai ${values.name}, ${values.use}`, heroScenesLabel: 'scenes' })[key] ?? key,
}))

const { adminHeroPairs, homeHeroPictures } = await import('./home-hero-admin')

const template = (id: string, covers = true) => ({
  id, name: `Name ${id}`, description: id === 'a' ? 'on slate' : null,
  coverBeforeUrl: covers ? `https://a.test/${id}-b.webp` : null, coverAfterUrl: covers ? `https://a.test/${id}-a.webp` : null,
})
const live = [template('a'), template('b'), template('bare', false)]
const words = { phone: (name: string) => `phone ${name}`, ai: (name: string, use: string) => `ai ${name} ${use}`.trim() }
const option = { hero: { before: { src: '/home/x.webp', alt: 'x', width: 1, height: 1 }, after: { src: '/home/y.webp', alt: 'y', width: 1, height: 1 }, caption: 'Built in', scenes: undefined } }

describe('首页首屏大图 from admin', () => {
  beforeEach(() => {
    plateFrame.mockReset().mockResolvedValue('data:image/avif;base64,AAA')
    cachedHomeHero.mockReset()
  })

  it('names each scene after its template unless the admin wrote a caption, and skips what is not live', () => {
    expect(adminHeroPairs([{ templateId: 'gone', caption: null }, { templateId: 'a', caption: 'Same plate' }, { templateId: 'b', caption: null }], live, words)).toEqual([
      { templateId: 'a', phone: 'phone Name a', ai: 'ai Name a on slate', caption: 'Same plate' },
      { templateId: 'b', phone: 'phone Name b', ai: 'ai Name b', caption: 'Name b' },
    ])
  })

  it('shows one template alone, with the first frame of its phone photo', async () => {
    cachedHomeHero.mockResolvedValue([{ templateId: 'a', caption: null }])
    const hero = await homeHeroPictures(option, false, 'en', live)
    expect(hero).toMatchObject({ before: { src: 'https://a.test/a-b.webp', firstFrame: 'data:image/avif;base64,AAA' }, after: { alt: 'ai Name a, on slate' }, caption: 'Name a', scenes: undefined })
  })

  it('takes turns between several templates and drops the dangling comma of an empty one-liner', async () => {
    cachedHomeHero.mockResolvedValue([{ templateId: 'b', caption: null }, { templateId: 'a', caption: null }])
    const hero = await homeHeroPictures(option, false, 'en', live)
    expect(hero?.scenes?.label).toBe('scenes')
    expect(hero?.scenes?.items.map((item) => item.caption)).toEqual(['Name b', 'Name a'])
    expect(hero?.after.alt).toBe('ai Name b')
  })

  it('keeps the built-in hero when nothing is set or nothing set is live', async () => {
    cachedHomeHero.mockResolvedValue([])
    expect(await homeHeroPictures(option, false, 'en', live)).toBe(option.hero)
    cachedHomeHero.mockResolvedValue([{ templateId: 'bare', caption: null }])
    expect(await homeHeroPictures(option, false, 'en', live)).toBe(option.hero)
  })

  it('leaves an A/B option page on its own pictures', async () => {
    cachedHomeHero.mockResolvedValue([{ templateId: 'a', caption: null }])
    expect(await homeHeroPictures(option, true, 'en', live)).toBe(option.hero)
    expect(cachedHomeHero).not.toHaveBeenCalled()
  })
})
