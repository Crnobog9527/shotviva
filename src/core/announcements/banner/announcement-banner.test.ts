import { isValidElement, Suspense, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { HIDE_CLOSED_SCRIPT, HIDE_ENDED_SCRIPT } from '../rules/dismissal'
import { AnnouncementBanner } from './announcement-banner'
import { BannerView } from './banner-view'

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}))
vi.mock('../banner-read', () => ({
  bannerState: vi.fn(async () => ({
    items: [{ id: 'a1', message: 'Hello', link: null, tone: 'info', startsAt: null, endsAt: null, closeKey: 'a1.x', reshowAfterDays: 7 }],
    initialId: 'a1',
  })),
}))

type Node = ReactElement<{ children: ReactElement[]; dangerouslySetInnerHTML?: { __html: string } }>

describe('AnnouncementBanner', () => {
  // The closed-check comes first, outside the boundary, so it is in the static shell ahead of
  // the banner even when the banner streams in later. BannerView calls usePathname, which
  // suspends during prerender on routes with request-time params (/photos/[jobId]); without a
  // boundary the build fails (Next 16 cacheComponents).
  it('puts the closed-check ahead of a Suspense boundary holding the view and the ended-check', async () => {
    const fragment = (await AnnouncementBanner()) as Node
    const [closed, boundary] = fragment.props.children as [Node, Node]
    expect(closed.type).toBe('script')
    expect(closed.props.dangerouslySetInnerHTML?.__html).toBe(HIDE_CLOSED_SCRIPT)
    expect(isValidElement(boundary)).toBe(true)
    expect(boundary.type).toBe(Suspense)
    const [view, ended] = boundary.props.children as [Node, Node]
    expect(view.type).toBe(BannerView)
    expect(ended.props.dangerouslySetInnerHTML?.__html).toBe(HIDE_ENDED_SCRIPT)
  })
})
