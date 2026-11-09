import { effectiveStillCover, type CoverLocales } from '@/core/templates/client'

import { stillCoverKey } from './still-cover-key'

type CoverFields = { id: string; coverAfterUrl: string | null; coverLocales: CoverLocales }
export type AfterCover = { locale: string | null; hash: string; key: string }

export function afterCoverSource(template: CoverFields | null, locale: string | null, base?: string): AfterCover | null {
  if (!template) return null
  const url = effectiveStillCover(template.coverLocales, locale, 'after', template.coverAfterUrl)
  const source = stillCoverKey(template.id, 'after', url, base)
  return source && { locale, ...source }
}

// Keep the existing private UUID key format. Embed the immutable cover fingerprint at the ends
// so a reopened draft can recognise it, while every import still has its own random private key.
export function afterCoverRefId(hash: string, uuid: string) {
  return hash.slice(0, 8) + uuid.slice(8, -8) + hash.slice(8, 16)
}

export function isRefFromAfterCover(key: string, hash: string) {
  const id = key.split('/')[2]?.replace(/\.webp$/, '')
  return !!id && id === afterCoverRefId(hash, id)
}
