import { SHELL_COPY } from './copy'
import { bestMatch } from './nav-items'

export type ModuleTab = { href: `/admin${string}`; label: string }
export type AdminModule = { label: string; tabs: readonly ModuleTab[] }

const TABS = SHELL_COPY.tabs

// The template area's modules and their tabs (Owner 2026-11-27, design/admin-templates-ux-plan.md).
// Each tab is its own page.
export const ADMIN_MODULES: readonly AdminModule[] = [
  {
    label: SHELL_COPY.nav.templates,
    tabs: [
      { href: '/admin/templates', label: TABS.templates },
      { href: '/admin/templates/series', label: TABS.series },
      { href: '/admin/templates/categories', label: TABS.categories },
    ],
  },
  {
    label: SHELL_COPY.nav.home,
    tabs: [
      { href: '/admin/home', label: TABS.homeDefault },
      { href: '/admin/home/zh', label: TABS.homeZh },
      { href: '/admin/home/en', label: TABS.homeEn },
      { href: '/admin/home/bundles', label: TABS.bundles },
    ],
  },
  {
    label: SHELL_COPY.nav.generation,
    tabs: [
      { href: '/admin/providers', label: TABS.providers },
      { href: '/admin/templates/profiles', label: TABS.profiles },
      { href: '/admin/templates/dishware', label: TABS.dishware },
      { href: '/admin/templates/edit', label: TABS.edit },
    ],
  },
]

// The page's module and tab: the tab whose address matches the path most closely, so
// /admin/templates/series/… is 系列 and /admin/templates/profiles is 出图设置. Pages outside the
// modules get none.
export function moduleTabs(pathname: string): { module: AdminModule; current: ModuleTab } | null {
  const tabs = ADMIN_MODULES.flatMap((module) => module.tabs.map((tab) => ({ module, tab })))
  const found = bestMatch(pathname, tabs, ({ tab }) => [tab.href])
  return found ? { module: found.module, current: found.tab } : null
}
