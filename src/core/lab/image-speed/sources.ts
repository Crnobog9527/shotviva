// The image-speed lab (/api/lab/image-speed): which origins it compares and which covers it
// loads from each. Pure, so the choice can be tested without a deployment.
//
// The original-file rows serve the same object key from the public covers bucket: today's path
// (the site's /assets rewrite to r2.dev) and the r2.dev origin itself. The small-image rows load
// the card-sized file from this site's /_next/image and from the image CDN in front of it.

// `small`: the card-sized file (/_next/image, AVIF/WebP at w=384, what a catalogue card loads)
// from `base` + /_next/image, for the cover at assetsBase/key; otherwise the stored original at
// base/key. An empty base is this page's own origin.
// `font`: a static file instead of a picture (one of the MiSans woff2 subsets in public/fonts,
// ~45 KB, the kind of file the static-file CDN serves), fetched from base + /fonts/misans/….
// `hero`: the home page's first-screen pictures (public/home, the mobile LCP image) at w=640 from
// base + /_next/image, the size a phone's srcset picks.
export type LabOrigin = { id: string; label: string; base: string; small?: boolean; font?: boolean; hero?: boolean }

export const LAB_HERO_FILES = ['hero-set-phone.webp', 'hero-ai-street.webp', 'hero-ai-terrace.webp', 'hero-ai-villa.webp', 'hero-set-listing.webp', 'hero-set-promo.webp']
export const HERO_WIDTH = 640
export type LabConfig = { origins: LabOrigin[]; keys: string[]; assetsBase?: string }

// Six of the largest MiSans subsets the Chinese pages load (public/fonts/misans, content-hashed).
export const LAB_FONT_FILES = [
  '2c880eaf490c88d201cffb95cc6b6f45219e2cfbca51ef690cbaddfc551590d0.woff2',
  '4cead95bdbc5d2035aa3d5dcda631d1329ebde2b2744b43fa97649144836e1bf.woff2',
  '379e6a12a19e6d4b01f504bca6f82f0abf492e849c215e4bed9706ad2c38de79.woff2',
  'b979b389cf6064db6610c3021e3dabe6580454becf36bea6c70d7c14a340f6fd.woff2',
  '0bcae4b1170b031fc65332e1c370449e85ddad4ec986635a81e55e1ed7ae98e8.woff2',
  '53b14cdd995d2f8b0922b9c9342c8b226b52671f7bc3418cfc2f254320c7feca.woff2',
]

export const SMALL_WIDTH = 384

// The image CDN (Tencent EdgeOne, overseas nodes only, no ICP filing). Since 2026-11-13 it
// forwards only /_next/image to shotviva.com (plan A1), so it has no original-file row any more.
export const IMAGE_CDN_ORIGIN = 'https://img-eo.shotviva.com'

export const LAB_IMAGE_COUNT = 6

const trimSlash = (url: string) => url.replace(/\/+$/, '')

// The bucket key of a cover URL under the configured base, or null for anything else (a video
// cover, a cover from another host, an old absolute URL).
export function coverKey(url: string | null, base: string): string | null {
  if (!url) return null
  const prefix = `${trimSlash(base)}/`
  if (!url.startsWith(prefix)) return null
  const key = url.slice(prefix.length).split(/[?#]/)[0]
  return key && /\.(?:webp|jpe?g|png|avif)$/i.test(key) ? key : null
}

// The first distinct still covers, in catalogue order (the order visitors see them).
export function pickKeys(urls: (string | null)[], base: string, count = LAB_IMAGE_COUNT): string[] {
  const keys: string[] = []
  for (const url of urls) {
    const key = coverKey(url, base)
    if (key && !keys.includes(key)) keys.push(key)
    if (keys.length === count) break
  }
  return keys
}

const isR2Dev = (url: string) => new URL(url).hostname.endsWith('.r2.dev')

// Production: the base is https://shotviva.com/assets and R2_PUBLIC_ORIGIN is its r2.dev origin.
// Preview: the base is the preview bucket's r2.dev itself, so there is no separate rewrite row.
//
// Then the small-image pair, when there are covers: this site's own /_next/image (Vercel, today)
// against the same URL on the image CDN (the switch's value when set, else img-eo). The CDN
// forwards /_next/image to production, so that row is only meaningful on shotviva.com.
export function labOrigins(env: { assetsBase?: string; r2Origin?: string; imageCdn?: string }): LabOrigin[] {
  const origins: LabOrigin[] = []
  const base = env.assetsBase && trimSlash(env.assetsBase)
  if (base && !isR2Dev(base)) origins.push({ id: 'site', label: '现在：本站 /assets（Vercel 转 R2）', base })
  const r2 = env.r2Origin ? trimSlash(env.r2Origin) : base && isR2Dev(base) ? base : undefined
  if (r2) origins.push({ id: 'r2', label: 'R2 直连（r2.dev）', base: r2 })
  return [...origins, ...cdnRows(Boolean(base), trimSlash(env.imageCdn ?? IMAGE_CDN_ORIGIN))]
}

// This site against the CDN: the card-sized cover (when there are covers) and a static file.
function cdnRows(hasCovers: boolean, cdn: string): LabOrigin[] {
  const small: LabOrigin[] = [
    { id: 'site-s', label: '小图：本站 /_next/image（Vercel，现在）', base: '', small: true },
    { id: 'eo-s', label: '小图：img-eo /_next/image（EdgeOne 转 Vercel）', base: cdn, small: true },
  ]
  const heroes: LabOrigin[] = [
    { id: 'site-h', label: '首屏大图：本站 /_next/image（Vercel，现在）', base: '', hero: true },
    { id: 'eo-h', label: '首屏大图：img-eo /_next/image（EdgeOne 转 Vercel）', base: cdn, hero: true },
  ]
  const fonts: LabOrigin[] = [
    { id: 'site-f', label: '静态文件：本站（Vercel）', base: '', font: true },
    { id: 'eo-f', label: '静态文件：img-eo（EdgeOne 转 Vercel）', base: cdn, font: true },
  ]
  return [...(hasCovers ? small : []), ...heroes, ...fonts]
}
