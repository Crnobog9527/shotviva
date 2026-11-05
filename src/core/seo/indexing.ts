import { isModuleEnabled, isPathEnabled, type ModuleId, type SiteConfig } from '../config'

// A page that belongs to a module, so it disappears with the module (ARCHITECTURE §2).
export type PageGate = { path: string; module?: ModuleId }

export function isGateOpen(site: SiteConfig, path: string, gates: readonly PageGate[]): boolean {
  const owner = gates.find((gate) => gate.path === path)?.module
  return isPathEnabled(site, path) && (owner === undefined || isModuleEnabled(site, owner))
}

// The single indexing switch (AGENTS §9): a path is indexable only when the site lists
// it and its module is on. Everything else renders noindex, so no page hand-writes robots.
export function isIndexable(site: SiteConfig, path: string, gates: readonly PageGate[] = []): boolean {
  return site.indexing.indexablePaths.some((p) => p === path) && isGateOpen(site, path, gates)
}

export function indexablePaths(site: SiteConfig, gates: readonly PageGate[] = []): string[] {
  return site.indexing.indexablePaths.filter((path) => isGateOpen(site, path, gates))
}

export const NOINDEX = { index: false, follow: false } as const
export const INDEX = { index: true, follow: true } as const
