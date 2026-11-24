import type { ExperimentRegistry } from '@/core/experiments'

// Every surface an A/B experiment can test, with the options /admin/experiments may pick from
// (ARCHITECTURE §16.5). Adding a surface or an option is a code change; the admin never types
// content, and no option carries a price. Kept free of page content: the proxy imports it.
// The pricing page and the paywall follow in later PRs.

// The home hero (content in hero-options.ts). `food` is the plain `/` (restaurants and hotels lead,
// Owner 2026-11-24), so the control group and bots see what the page shows and analytics name it
// right; `tote`, the old e-commerce hero, is the page content's own hero, served at /x/hero/tote.
// The first option is the admin form's default control.
export const HERO_DEFAULT_OPTION = 'food'
export const HERO_OPTIONS = [
  { id: HERO_DEFAULT_OPTION, label: 'C 餐饮：8 组白盘案例（第 1 组上首屏，默认）' },
  { id: 'tote', label: 'B 电商：托特包' },
  { id: 'art-style', label: 'A 画风迁移：猫的照片 → 动漫 / 3D / 水彩' },
] as const

export const experimentRegistry: ExperimentRegistry = [
  { surface: 'hero', paths: ['/'], options: HERO_OPTIONS, defaultOption: HERO_DEFAULT_OPTION },
]
