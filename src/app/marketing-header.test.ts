import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner 2026-11-25: "Request a template" / 「定制模板」 in the top bar and the page-links row, only
// while the wishlist is open (the same switch as /template-requests). The header is an async
// server component: its tree is walked, awaiting its own async parts (PhoneNav), without rendering
// the client pieces.
const wishlist = vi.hoisted(() => ({ open: true }))
vi.mock('@/core/wishlist', () => ({ isWishlistEnabled: async () => wishlist.open }))
vi.mock('@/core/blog', () => ({ cachedHasPublishedPosts: async () => false }))
vi.mock('@/core/gallery', () => ({ isGalleryEnabled: async () => false }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => `t:${key}` }))
vi.mock('./[locale]/nav-account-slot', () => ({ NavAccountSlot: () => null }))

const { MarketingHeader } = await import('./[locale]/marketing-chrome')

type Found = { href: string; className?: string; text: string }

// Every element with an href, in order; async function components of the header are awaited.
async function links(node: ReactNode, out: Found[] = []): Promise<Found[]> {
  if (Array.isArray(node)) {
    for (const child of node) await links(child, out)
    return out
  }
  if (!isValidElement(node)) return out
  const element = node as ReactElement<{ href?: string; className?: string; children?: ReactNode; fallback?: ReactNode }>
  const { props } = element
  if (typeof props.href === 'string') out.push({ href: props.href, className: props.className, text: String(props.children ?? '') })
  if (typeof element.type === 'function' && element.type.name === 'PhoneNav') {
    await links(await (element.type as (p: unknown) => Promise<ReactNode>)(props), out)
    return out
  }
  return links(props.children, out)
}

describe('MarketingHeader: the way in to template requests', () => {
  beforeEach(() => {
    wishlist.open = true
  })

  it('shows it in the bar (from 1024px) and in the page-links row while the wishlist is open', async () => {
    const found = (await links(await MarketingHeader({ locale: 'en' }))).filter((link) => link.href === '/template-requests')
    expect(found.map((link) => link.text)).toEqual(['t:requestTemplate', 't:requestTemplate'])
    expect(found[0].className).toBe('mk-nl mk-nl-wide')
    // The row's copy is never one the bar already shows, so tablets keep it.
    expect(found[1].className).toBeUndefined()
  })

  it('leaves it out everywhere while the wishlist is off', async () => {
    wishlist.open = false
    const all = await links(await MarketingHeader({ locale: 'zh' }))
    expect(all.some((link) => link.href === '/template-requests')).toBe(false)
    expect(all.some((link) => link.href === '/pricing')).toBe(true)
  })

  it('hides on tablets only the row links the bar already has', async () => {
    const row = (await links(await MarketingHeader({ locale: 'en' }))).filter((link) => !link.className?.startsWith('mk-nl'))
    const dup = row.filter((link) => link.className === 'mk-mnav-dup').map((link) => link.href)
    expect(dup).toEqual(['/#templates', '/pricing'])
  })
})
