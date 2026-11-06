import { isValidElement, Suspense, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AnnouncementBanner } from './announcement-banner'
import { BannerView } from './banner-view'

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}))
vi.mock('../banner-read', () => ({
  bannerState: vi.fn(async () => ({
    items: [{ id: 'a1', message: 'Hello', link: null, tone: 'info', startsAt: null, endsAt: null }],
    initialId: 'a1',
  })),
}))

describe('AnnouncementBanner', () => {
  // BannerView calls usePathname, which suspends during prerender on routes with request-time
  // params (/photos/[jobId]); without a boundary the build fails (Next 16 cacheComponents).
  it('renders BannerView and the hide-early script inside a Suspense boundary', async () => {
    const element = (await AnnouncementBanner()) as ReactElement<{ children: ReactElement[] }>
    expect(isValidElement(element)).toBe(true)
    expect(element.type).toBe(Suspense)
    const [view, script] = element.props.children
    expect(view.type).toBe(BannerView)
    expect(script.type).toBe('script')
  })
})
