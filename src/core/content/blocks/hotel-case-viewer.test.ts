import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { caseNote, pictureStatus } from './hotel-case-state'
import { Full, LABELS, PictureNote } from './hotel-case-viewer'

const none = new Set<string>()
const seen = (over: Partial<{ requestFailed: boolean; shown: ReadonlySet<string>; broken: ReadonlySet<string> }> = {}) => ({ requestFailed: false, shown: none, broken: none, ...over })
const thumb = { src: '/thumb-640.webp', srcSet: '/thumb-384.webp 384w, /thumb-640.webp 640w', sizes: '27vw', avif: null }
const picture = { src: '/full.webp', alt: 'The same pool terrace at sunset' }
const noop = () => undefined
const side = (status: 'waiting' | 'shown' | 'broken', withPicture = true) =>
  renderToStaticMarkup(createElement(Full, { picture: withPicture ? picture : undefined, thumb, tag: 'AI', ai: true, status, attempt: 0, onShown: noop, onBroken: noop }))
const note = (kind: 'loading' | 'failed' | null, locale: 'en' | 'zh' = 'en') => renderToStaticMarkup(createElement(PictureNote, { note: kind, labels: LABELS[locale], retry: noop }))

describe('hotels viewer: one side of a case', () => {
  it('waits on the thumbnail until the full-size picture has loaded', () => {
    expect(pictureStatus(undefined, seen())).toBe('waiting')
    expect(pictureStatus('/full.webp', seen())).toBe('waiting')
    expect(pictureStatus('/full.webp', seen({ shown: new Set(['/full.webp']) }))).toBe('shown')
  })

  it('is broken when the pictures’ request failed, or this picture failed to load', () => {
    expect(pictureStatus(undefined, seen({ requestFailed: true }))).toBe('broken')
    expect(pictureStatus('/full.webp', seen({ broken: new Set(['/full.webp']) }))).toBe('broken')
    // A picture that loaded stays shown.
    expect(pictureStatus('/full.webp', seen({ shown: new Set(['/full.webp']), broken: new Set(['/full.webp']) }))).toBe('shown')
  })

  it('shows the thumbnail on a pulsing plate, the full-size picture hidden, before it has loaded', () => {
    for (const html of [side('waiting'), side('waiting', false)]) {
      expect(html).toContain('class="hc-full hc-wait"')
      expect(html).toContain('class="hc-thumb" src="/thumb-640.webp" srcSet="/thumb-384.webp 384w, /thumb-640.webp 640w" sizes="27vw"')
      expect(html).not.toContain('hc-on')
    }
    expect(side('waiting')).toContain('class="hc-big"')
  })

  it('keeps the still thumbnail when the full-size picture failed, and fades the picture in once loaded', () => {
    const broken = side('broken')
    expect(broken).toContain('class="hc-full"')
    expect(broken).toContain('class="hc-thumb"')
    expect(broken).not.toContain('hc-on')
    expect(side('shown')).toContain('class="hc-big hc-on"')
  })
})

describe('hotels viewer: the note under a case', () => {
  it('says loading while either side waits, before any full-size picture has loaded', () => {
    expect(caseNote(['waiting', 'waiting'])).toBe('loading')
    expect(caseNote(['shown', 'waiting'])).toBe('loading')
    expect(note('loading')).toBe('<p class="hc-note" role="status">Loading the full-size pictures…</p>')
    expect(note('loading', 'zh')).toContain('正在加载大图…')
  })

  it('offers a retry when a full-size picture failed, even after the request succeeded', () => {
    expect(caseNote(['shown', 'broken'])).toBe('failed')
    expect(caseNote(['broken', 'waiting'])).toBe('failed')
    expect(note('failed')).toContain('The full-size pictures did not load. <button type="button" class="hc-retry">Try again</button>')
    expect(note('failed', 'zh')).toContain('大图没有加载出来。<button type="button" class="hc-retry">重试</button>')
  })

  it('says nothing once both full-size pictures are shown', () => {
    expect(caseNote(['shown', 'shown'])).toBeNull()
    expect(note(null)).toBe('')
  })
})
