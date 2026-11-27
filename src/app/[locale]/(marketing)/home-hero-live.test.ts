import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const plateFrame = vi.fn()
vi.mock('@/core/templates/cover-ratio', () => ({ plateFrame: (...args: unknown[]) => plateFrame(...args) }))

const { liveHero, optionPictures } = await import('./home-hero-live')

const scene = (templateId: string) => ({ templateId, phone: `手机照 ${templateId}`, ai: `成图 ${templateId}`, caption: `说明 ${templateId}` })
const template = (id: string, before: string | null = `https://a.test/${id}-b.webp`, after: string | null = `https://a.test/${id}-a.webp`) => ({ id, coverBeforeUrl: before, coverAfterUrl: after })

describe('liveHero', () => {
  beforeEach(() => {
    plateFrame.mockReset()
    plateFrame.mockResolvedValue('data:image/avif;base64,AAA')
  })

  it('takes each pair from the template current covers, in the listed order, with our words', async () => {
    const hero = await liveHero([scene('one'), scene('two'), scene('three')], '菜', [template('three'), template('one'), template('two')])
    expect(hero?.scenes?.items.map((item) => [item.before?.src, item.image.src, item.caption])).toEqual([
      ['https://a.test/one-b.webp', 'https://a.test/one-a.webp', '说明 one'],
      ['https://a.test/two-b.webp', 'https://a.test/two-a.webp', '说明 two'],
      ['https://a.test/three-b.webp', 'https://a.test/three-a.webp', '说明 three'],
    ])
    expect(hero?.before).toMatchObject({ src: 'https://a.test/one-b.webp', alt: '手机照 one', firstFrame: 'data:image/avif;base64,AAA' })
    expect(hero?.after).toMatchObject({ src: 'https://a.test/one-a.webp', alt: '成图 one' })
    expect(plateFrame).toHaveBeenCalledWith('https://a.test/one-b.webp', 0.8)
  })

  it('drops a template that is not live or lacks a cover, and keeps a single pair without scenes', async () => {
    const hero = await liveHero([scene('gone'), scene('nocover'), scene('two')], '菜', [template('nocover', null), template('two')])
    expect(hero?.before.src).toBe('https://a.test/two-b.webp')
    expect(hero?.scenes).toBeUndefined()
  })

  it('gives null when none is live, and no first frame when the cover cannot be read', async () => {
    expect(await liveHero([scene('gone')], '菜', [])).toBeNull()
    plateFrame.mockResolvedValue(null)
    const hero = await liveHero([scene('one')], '菜', [template('one')])
    expect(hero?.before.firstFrame).toBeUndefined()
  })
})

describe('optionPictures', () => {
  const fallback = { before: { src: '/home/cn-hero-1-photo.webp', alt: '手机照', width: 880, height: 1100, firstFrame: 'data:image/avif;base64,STATIC' }, after: { src: '/home/cn-hero-1-ai.webp', alt: '成图', width: 880, height: 1100 }, caption: '说明', scenes: undefined }
  const option = { live: { label: '菜', scenes: [scene('one')] }, hero: fallback }

  beforeEach(() => plateFrame.mockResolvedValue('data:image/avif;base64,LIVE'))

  it('shows the live covers when a listed template is live', async () => {
    expect((await optionPictures(option, [template('one')]))?.before.src).toBe('https://a.test/one-b.webp')
  })

  it('falls back to the static dish, first frame included, when none is live (an outage, all unpublished, a build without a database)', async () => {
    expect(await optionPictures(option, [])).toBe(fallback)
    expect(await optionPictures({ hero: fallback }, [])).toBe(fallback)
    expect(await optionPictures(null, [])).toBeNull()
  })
})
