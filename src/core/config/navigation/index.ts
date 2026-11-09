import { notFound } from 'next/navigation'

import { isModuleEnabled, type ModuleId, type SiteConfig } from '..'

// Call from a module route's layout so the switch cannot be forgotten page by page.
export function requireModule(site: SiteConfig, id: ModuleId): void {
  if (!isModuleEnabled(site, id)) notFound()
}
