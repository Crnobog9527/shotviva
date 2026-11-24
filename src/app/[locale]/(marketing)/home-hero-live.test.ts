import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const coverPreview = vi.fn()
vi.mock('@/core/templates/cover-ratio', () => ({ coverPreview: (...args: unknown[]) => coverPreview(...args) }))

const { liveHero } = await import('./home-hero-live')

const scene = (templateId: string) => ({ templateId, phone: `手机照 ${templateId}`, ai: `成图 ${templateId}`, caption: `说明 ${templateId}` })
const template = (id: string, before: string | null = `https://a.test/${id}-b.webp`, after: string | null = `https://a.test/${id}-a.webp`) => ({ id, coverBeforeUrl: before, coverAfterUrl: after })

describe('liveHero', () => {
  beforeEach(() => {
    coverPreview.mockReset()
    coverPreview.mockResolvedValue({ ratio: 0.75, firstFrame: 'data:image/avif;base64,AAA' })
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
    expect(coverPreview).toHaveBeenCalledWith('https://a.test/one-b.webp', true)
  })

  it('drops a template that is not live or lacks a cover, and keeps a single pair without scenes', async () => {
    const hero = await liveHero([scene('gone'), scene('nocover'), scene('two')], '菜', [template('nocover', null), template('two')])
    expect(hero?.before.src).toBe('https://a.test/two-b.webp')
    expect(hero?.scenes).toBeUndefined()
  })

  it('gives null when none is live, and no first frame when the cover cannot be read', async () => {
    expect(await liveHero([scene('gone')], '菜', [])).toBeNull()
    coverPreview.mockResolvedValue({ ratio: null, firstFrame: null })
    const hero = await liveHero([scene('one')], '菜', [template('one')])
    expect(hero?.before.firstFrame).toBeUndefined()
  })
})
