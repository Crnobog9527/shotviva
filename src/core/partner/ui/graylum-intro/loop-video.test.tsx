import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { heroMedia } from './intro-shots'

const HERO_MEDIA = heroMedia('zh')
import { LoopMedia } from './loop-video'

const render = (reduced: boolean) => renderToStaticMarkup(createElement(LoopMedia, { media: HERO_MEDIA, label: 'Hero', reduced }))

describe('the looping animation', () => {
  it('is a muted, inline, looping, autoplaying video with webm before mp4 and a poster', () => {
    const html = render(false)
    expect(html).toMatch(/<video[^>]* autoPlay=""|<video[^>]* autoplay=""/)
    for (const attr of ['muted', 'loop', 'playsinline', 'preload="metadata"', `poster="${HERO_MEDIA.poster}"`, 'aria-label="Hero"']) expect(html.toLowerCase()).toContain(attr.toLowerCase())
    expect(html.indexOf('video/webm')).toBeGreaterThan(-1)
    expect(html.indexOf('video/webm')).toBeLessThan(html.indexOf('video/mp4'))
    expect(html).toContain('aspect-[16/10]')
  })

  it('under reduced motion shows the poster only, with no video to fetch or play', () => {
    const html = render(true)
    expect(html).not.toContain('<video')
    expect(html).not.toContain('.webm')
    expect(html).not.toContain('.mp4')
    expect(html).toContain(`src="${HERO_MEDIA.poster}"`)
    expect(html).toContain('alt="Hero"')
  })
})
