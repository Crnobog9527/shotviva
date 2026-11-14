import { HERO_DEFAULT_OPTION } from './registry'

// Which templates the first-screen generator offers first for each home hero option (Owner
// 2026-11-14: 「落地页的生成组件优先显示的模板也要匹配对应品类用户」). The generator's rail is the
// chosen template then the next ones in list order (modules/image/home/panel-parts.tsx), so the page
// puts the option's template first and its categories' templates right after it; everything else
// keeps today's order behind them, and the full picker is unchanged. Server-side only: the list is
// in the prerendered HTML, nothing is fetched in the browser.
// Category keys are template_categories.key (never renamed, T75). A key with no live template, or
// a first template that is not on sale, simply falls back to today's order and default.

export type GeneratorPick = { categories: readonly string[]; first: string }

export const HERO_GENERATOR: Readonly<Record<string, GeneratorPick>> = {
  // B, today's page: the product templates (studio product shot, apparel on white).
  [HERO_DEFAULT_OPTION]: { categories: ['products-resale'], first: 'white-background' },
  'art-style': { categories: ['art-styles'], first: 'flat-anime-style' },
  // C: the template behind the hero pair first, then the other food templates.
  food: { categories: ['food-drink'], first: 'wd-dappled-slate' },
}

type Placed = { id: string; category: string; categoryPath?: readonly string[] }

const inCategories = (template: Placed, categories: readonly string[]) =>
  categories.includes(template.category) || (template.categoryPath ?? []).some((key) => categories.includes(key))

// The option's first template, then its categories' templates, then the rest, each in list order.
export function orderForHero<T extends Placed>(templates: readonly T[], pick: GeneratorPick | undefined): { ordered: T[]; first: string | null } {
  if (!pick) return { ordered: [...templates], first: null }
  const first = templates.find((template) => template.id === pick.first) ?? null
  const matching = templates.filter((template) => template !== first && inCategories(template, pick.categories))
  const rest = templates.filter((template) => template !== first && !inCategories(template, pick.categories))
  return { ordered: [...(first ? [first] : []), ...matching, ...rest], first: first?.id ?? matching[0]?.id ?? null }
}

export function generatorPickFor(option: string | undefined): GeneratorPick | undefined {
  return HERO_GENERATOR[option ?? HERO_DEFAULT_OPTION]
}
