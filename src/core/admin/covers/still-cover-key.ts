import { publicEnv } from '@/core/public-env'

// The admin publisher uses a slot and short hash. The preview → production sync keeps a full
// digest and the source format. Its slot must come from the template's corresponding column.
export function stillCoverKey(templateId: string, slot: 'before' | 'after', url: string | null, base = publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL) {
  if (!base || !url || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(templateId)) return null
  const start = `${base}/covers/${templateId}/`
  if (!url.startsWith(start)) return null
  const filename = url.slice(start.length)
  const match = new RegExp(`^${slot}-([0-9a-f]{16})\\.webp$`).exec(filename) ?? /^sync-([0-9a-f]{64})\.(?:jpg|png|webp)$/.exec(filename)
  return match ? { key: url.slice(base.length + 1), hash: match[1] } : null
}
