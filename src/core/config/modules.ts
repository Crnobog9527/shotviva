import { notFound } from 'next/navigation'

import type { ModuleId, SiteConfig } from './define-site'

// Public routes each module owns. A disabled module's routes 404 and never reach the sitemap.
export const MODULE_ROUTES: Record<ModuleId, readonly string[]> = {
  image: ['/generate'],
  video: [],
}

export function isModuleEnabled(site: SiteConfig, id: ModuleId): boolean {
  return site.modules[id]
}

// Call from a module route's layout so the switch cannot be forgotten page by page.
export function requireModule(site: SiteConfig, id: ModuleId): void {
  if (!isModuleEnabled(site, id)) notFound()
}

// The module owning a path, if any (exact match or a sub-path).
export function moduleForPath(path: string): ModuleId | undefined {
  const ids = Object.keys(MODULE_ROUTES) as ModuleId[]
  return ids.find((id) =>
    MODULE_ROUTES[id].some((route) => path === route || path.startsWith(`${route}/`)),
  )
}

export function isPathEnabled(site: SiteConfig, path: string): boolean {
  const owner = moduleForPath(path)
  return owner === undefined || isModuleEnabled(site, owner)
}
