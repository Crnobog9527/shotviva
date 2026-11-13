// The image-speed lab (/api/lab/image-speed): which origins it compares and which covers it
// loads from each. Pure, so the choice can be tested without a deployment.
//
// Every origin serves the same object key from the public covers bucket: today's path (the
// site's /assets rewrite to r2.dev), the r2.dev origin itself, and two trial CDN domains the
// Owner may create in front of the bucket (Tencent EdgeOne and Alibaba Cloud CDN, overseas
// nodes only, no ICP filing). A trial domain that does not exist yet just shows as failed.

export type LabOrigin = { id: string; label: string; base: string }
export type LabConfig = { origins: LabOrigin[]; keys: string[] }

// Fixed names so the console steps and the page agree; changing one is a code change.
export const TRIAL_CDN_ORIGINS: LabOrigin[] = [
  { id: 'eo', label: 'EdgeOne 香港/境外（img-eo）', base: 'https://img-eo.shotviva.com' },
  { id: 'ali', label: '阿里云 CDN 境外（img-ali）', base: 'https://img-ali.shotviva.com' },
]

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
export function labOrigins(env: { assetsBase?: string; r2Origin?: string }): LabOrigin[] {
  const origins: LabOrigin[] = []
  const base = env.assetsBase && trimSlash(env.assetsBase)
  if (base && !isR2Dev(base)) origins.push({ id: 'site', label: '现在：本站 /assets（Vercel 转 R2）', base })
  const r2 = env.r2Origin ? trimSlash(env.r2Origin) : base && isR2Dev(base) ? base : undefined
  if (r2) origins.push({ id: 'r2', label: 'R2 直连（r2.dev）', base: r2 })
  return [...origins, ...TRIAL_CDN_ORIGINS]
}
