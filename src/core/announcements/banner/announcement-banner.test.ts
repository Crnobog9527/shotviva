import { Fragment, isValidElement, Suspense, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { HIDE_CLOSED_SCRIPT, HIDE_ENDED_SCRIPT } from '../rules/dismissal-scripts'
import { AnnouncementBanner } from './announcement-banner'
import { BannerView, PathAwareBannerView } from './banner-view'

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

type Node = ReactElement<{ children: Node | Node[]; dangerouslySetInnerHTML?: { __html: string } }>

describe('AnnouncementBanner', () => {
  it.each([
    { checkPath: true, view: PathAwareBannerView },
    { checkPath: false, view: BannerView },
  ])('preserves early dismissal without streaming the marketing banner (checkPath=$checkPath)', async ({ checkPath, view }) => {
    const fragment = (await AnnouncementBanner({ checkPath })) as Node
    const [closed, content] = fragment.props.children as [Node, Node]
    expect(closed.type).toBe('script')
    expect(closed.props.dangerouslySetInnerHTML?.__html).toBe(HIDE_CLOSED_SCRIPT)
    expect(isValidElement(content)).toBe(true)
    expect(content.type).toBe(checkPath ? Suspense : Fragment)
    const banner = checkPath ? content.props.children as Node : content
    const [bannerView, ended] = banner.props.children as [Node, Node]
    expect(bannerView.type).toBe(view)
    expect(ended.props.dangerouslySetInnerHTML?.__html).toBe(HIDE_ENDED_SCRIPT)
  })
})
