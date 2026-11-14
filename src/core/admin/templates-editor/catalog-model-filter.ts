import type { AdminTemplate } from '../templates/types'
import { catalogCopy as copy } from './copy'

// The 出图模型 filter (Owner 2026-11-15: 「可以加一个出图模型筛选」): narrow the list to the
// templates bound to one provider line, so 「全选当前列表」 + 批量编辑 can move them all to another.
export const UNBOUND_MODEL = 'unbound'

type ModelRow = Pick<AdminTemplate, 'prompt'>
type Line = { id: string; label: string; model: string; isActive: boolean }
export type ModelFilterOption = { value: string; label: string; count: number }

const boundTo = (template: ModelRow) => template.prompt?.providerId ?? UNBOUND_MODEL

export function filterByModel<T extends ModelRow>(rows: readonly T[], model: string): T[] {
  return model ? rows.filter(template => boundTo(template) === model) : [...rows]
}

function lineLabel(id: string, lines: ReadonlyMap<string, Line>) {
  if (id === UNBOUND_MODEL) return copy.unboundModel
  const line = lines.get(id)
  if (!line) return copy.unknownModel(id)
  return `${line.label} · ${line.model}${line.isActive ? '' : copy.inactiveModel}`
}

// One option per line some template is bound to (with how many of `rows` use it), the current
// default line first. A chosen line that no row uses any more (all just moved away) stays listed
// at 0, so the select keeps showing what the empty list is filtered by.
export function modelFilterOptions(rows: readonly ModelRow[], lines: readonly Line[], selected = ''): ModelFilterOption[] {
  const counts = new Map<string, number>()
  for (const template of rows) counts.set(boundTo(template), (counts.get(boundTo(template)) ?? 0) + 1)
  if (selected && !counts.has(selected)) counts.set(selected, 0)
  const byId = new Map(lines.map(line => [line.id, line]))
  const rank = (id: string) => (id === UNBOUND_MODEL ? 2 : byId.get(id)?.isActive ? 0 : 1)
  return [...counts]
    .sort(([a, x], [b, y]) => rank(a) - rank(b) || y - x || a.localeCompare(b))
    .map(([value, count]) => ({ value, count, label: lineLabel(value, byId) }))
}
