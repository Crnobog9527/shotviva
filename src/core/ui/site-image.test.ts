import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The switch is read when public-env.ts loads, so it is set before the component is imported.
vi.stubEnv('NEXT_PUBLIC_PRESIZED_IMAGES_URL', 'https://img-eo.shotviva.com')
const { SiteImage } = await import('./site-image')
const { Picture } = await import('./picture')

const CDN = 'https://img-eo.shotviva.com'
const render = (props: Record<string, unknown>) => renderToString(createElement(SiteImage, { src: '/home/hero-set-phone.webp', alt: 'Phone photo', width: 1080, height: 1350, ...props }))

describe('SiteImage with pre-sized copies (NEXT_PUBLIC_PRESIZED_IMAGES_URL)', () => {
  it('draws a <picture> for a first-screen picture: AVIF source, WebP <img>, same widths, laid out as before', () => {
    const html = render({ sizes: '(min-width: 1024px) 268px, 50vw', loading: 'eager' })
    expect(html).toContain('<picture style="display:contents">')
    expect(html).toMatch(new RegExp(`<source type="image/avif" srcSet="${CDN}/presized/v1/w384/home/hero-set-phone\\.avif 384w`))
    expect(html).toMatch(new RegExp(`<img[^>]*srcSet="${CDN}/presized/v1/w384/home/hero-set-phone\\.webp 384w`))
    expect(html).toContain('width="1080" height="1350"')
    expect(html).toContain('loading="eager"')
    expect(html).not.toContain('/_next/image')
  })

  it('gives a lazy picture (below the fold) only its WebP <img>, so the HTML stays small', () => {
    for (const props of [{ sizes: '50vw', loading: 'lazy' }, { sizes: '50vw' }]) {
      const html = render(props)
      expect(html).not.toContain('<picture')
      expect(html).not.toContain('.avif')
      expect(html).toMatch(new RegExp(`<img[^>]*loading="lazy"[^>]*srcSet="${CDN}/presized/v1/w\\d+/home/hero-set-phone\\.webp|<img[^>]*srcSet="${CDN}/presized/v1/w\\d+/home/hero-set-phone\\.webp[^>]*loading="lazy"`))
    }
  })

  it('preloads the hero’s AVIF srcset with its type, as eager as next/image and no higher priority', () => {
    const html = render({ preload: true })
    expect(html).toMatch(/<link rel="preload"[^>]*as="image"[^>]*type="image\/avif"|<link rel="preload"[^>]*type="image\/avif"[^>]*as="image"/)
    expect(html).toMatch(new RegExp(`imageSrcSet="${CDN}/presized/v1/w\\d+/home/hero-set-phone\\.avif 1x`))
    expect(html).toContain('<picture')
    expect(html).not.toMatch(/<img[^>]*loading="lazy"/)
    expect(html).not.toMatch(/fetchPriority="high"/)
  })

  it('passes a caller’s fetch priority to the <img> and the preload', () => {
    const html = render({ preload: true, fetchPriority: 'high' })
    expect(html).toMatch(/<link rel="preload"[^>]*fetchPriority="high"/)
    expect(html).toMatch(/<img[^>]*fetchPriority="high"/)
  })

  it('keeps next/image for a picture without copies', () => {
    const html = renderToString(createElement(SiteImage, { src: '/brand/email/wordmark.png', alt: '', width: 200, height: 40 }))
    expect(html).not.toContain('<picture')
    expect(html).toContain('/_next/image')
  })
})

describe('Picture', () => {
  it('drops the AVIF source in front of a lazy <img>', () => {
    const avif = { srcSet: '/a.avif 384w', sizes: '50vw' }
    const lazy = renderToString(Picture({ avif, children: createElement('img', { src: '/a.webp', alt: '', loading: 'lazy' }) }) as ReactElement)
    const eager = renderToString(Picture({ avif, children: createElement('img', { src: '/a.webp', alt: '' }) }) as ReactElement)
    expect(lazy).not.toContain('<picture')
    expect(eager).toContain('<source type="image/avif" srcSet="/a.avif 384w" sizes="50vw"/>')
  })

  it('renders the <img> alone when there is no AVIF source', () => {
    const html = renderToString(Picture({ avif: undefined, children: createElement('img', { src: '/a.webp', alt: '' }) }) as ReactElement)
    expect(html).toContain('<img src="/a.webp" alt=""/>')
    expect(html).not.toContain('<picture')
  })
})
