import type { ExperimentRegistry } from '@/core/experiments'

// Every surface an A/B experiment can test, with the options /admin/experiments may pick from
// (ARCHITECTURE §16.5). Adding a surface or an option is a code change; the admin never types
// content, and no option carries a price. Kept free of page content: the proxy imports it.
// The pricing page and the paywall follow in later PRs.

// The home hero (content in hero-options.ts). `tote` is today's hero, the e-commerce case.
export const HERO_DEFAULT_OPTION = 'tote'
export const HERO_OPTIONS = [
  { id: HERO_DEFAULT_OPTION, label: 'B 电商：托特包（现在的首屏）' },
  { id: 'art-style', label: 'A 画风迁移：猫的照片 → 动漫 / 3D / 水彩' },
  { id: 'food', label: 'C 餐饮：8 组白盘案例（第 1 组上首屏）' },
] as const

// The switch for B, the default option (Owner to decide, 2026-11-14): false = the home page stays
// as it is for everyone and only B visitors of a running experiment get B's generator order (they
// are served /x/hero/tote); true = the plain home page itself uses B's order, for every visitor.
export const DEFAULT_PAGE_USES_HERO_ORDER = false

export const experimentRegistry: ExperimentRegistry = [
  { surface: 'hero', paths: ['/'], options: HERO_OPTIONS, defaultOption: HERO_DEFAULT_OPTION, defaultOptionPageInExperiment: !DEFAULT_PAGE_USES_HERO_ORDER },
]
