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

type Found = { href: string; className?: string; text: string; links?: readonly { href: string; label: string }[] }

type Props = { href?: string; className?: string; children?: ReactNode; label?: string; links?: Found['links']; variant?: string }

// One element's own entry: a link, or a Use Cases menu recorded with its list ('menu:bar' / 'menu:row').
function entry(props: Props, type: unknown): Found | null {
  // The page-links row itself, by its classes ('nav:row').
  if (type === 'nav' && props.className?.includes('mk-mnav')) return { href: 'nav:row', className: props.className, text: '' }
  if (Array.isArray(props.links)) return { href: `menu:${props.variant ?? 'bar'}`, className: props.className, text: props.label ?? '', links: props.links }
  if (typeof props.href === 'string') return { href: props.href, className: props.className, text: String(props.children ?? '') }
  return null
}

// Every link and menu, in order; the header's async PhoneNav is awaited.
async function links(node: ReactNode, out: Found[] = []): Promise<Found[]> {
  if (Array.isArray(node)) {
    for (const child of node) await links(child, out)
    return out
  }
  if (!isValidElement(node)) return out
  const element = node as ReactElement<Props>
  const own = entry(element.props, element.type)
  if (own) out.push(own)
  const phoneNav = typeof element.type === 'function' && element.type.name === 'PhoneNav'
  const children = phoneNav ? await (element.type as (p: unknown) => Promise<ReactNode>)(element.props) : element.props.children
  return links(children, out)
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
    const all = await links(await MarketingHeader({ locale: 'en' }))
    const row = all.slice(all.findIndex((link) => link.href === 'menu:row'))
    const dup = row.filter((link) => link.className === 'mk-mnav-dup').map((link) => link.href)
    expect(dup).toEqual(['menu:row', '/#templates', '/pricing'])
  })

  // Owner 2026-11-25: the phone row matches the desktop bar.
  it("gives the page-links row the bar's items, in its order, with the same Use Cases list", async () => {
    const all = await links(await MarketingHeader({ locale: 'en' }))
    const bar = all.find((link) => link.href === 'menu:bar')
    const row = all.slice(all.findIndex((link) => link.href === 'menu:row'))
    expect(row.map((link) => link.href)).toEqual(['menu:row', '/#templates', '/template-requests', '/pricing'])
    expect(row[0].links).toEqual(bar?.links)
    expect(row[0].links?.map((link) => link.href)).toEqual(['/ai-restaurant-menu', '/commercial-photography', '/image-to-image-generator', '/transparent-background'])
  })

  it('gives the zh row the same Use Cases list as the zh bar, without the English-only page', async () => {
    const all = await links(await MarketingHeader({ locale: 'zh' }))
    const bar = all.find((link) => link.href === 'menu:bar')
    const row = all.find((link) => link.href === 'menu:row')
    expect(row?.links).toEqual(bar?.links)
    expect(row?.links?.map((link) => link.href)).toEqual(['/ai-restaurant-menu', '/commercial-photography', '/image-to-image-generator'])
  })

  // With the wishlist off a tablet row would hold nothing visible: it is a phone-only row then.
  it('keeps the row to phones while the wishlist is off, and on tablets while it is open', async () => {
    const rowOf = async () => (await links(await MarketingHeader({ locale: 'en' }))).find((link) => link.href === 'nav:row')?.className
    expect(await rowOf()).toBe('mk-mnav mk-w')
    wishlist.open = false
    expect(await rowOf()).toBe('mk-mnav mk-mnav-phone mk-w')
  })
})
