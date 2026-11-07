'use client'

import { Label } from '@/core/ui/label'

import { categoryCopy as COPY } from './copy'

const SELECT = 'border-input h-9 rounded-md border bg-transparent px-3 text-sm'

// What the picker needs of each template_categories row (T75).
export type CategoryOption = { key: string; nameZh: string; nameEn: string; isSystem: boolean }

type Props = { value: string; categories: readonly CategoryOption[]; onChange: (category: string) => void }

// templates.category_key (ARCHITECTURE §5, T75): the admin picks one of the categories managed
// in 分类管理; there is no free-typed option any more, and system categories are not offered.
// A template already in a system category (the partner freeform) shows it, locked. A key no
// longer in the list (deleted while the form was open) shows the placeholder until one is
// picked, and saving without one is refused.
export function CategoryField({ value, categories, onChange }: Props) {
  const system = categories.find((category) => category.key === value && category.isSystem)
  if (system) return <LockedCategory category={system} />
  const offered = categories.filter((category) => !category.isSystem)
  const known = offered.some((category) => category.key === value)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="tpl-category">{COPY.label}</Label>
      <select id="tpl-category" className={SELECT} value={known ? value : ''} onChange={(event) => onChange(event.target.value)}>
        <option value="" disabled>
          {COPY.placeholder}
        </option>
        {offered.map((category) => (
          <option key={category.key} value={category.key}>
            {category.nameZh} · {category.nameEn}
          </option>
        ))}
      </select>
      <p className="text-muted-foreground text-xs">{COPY.hint}</p>
    </div>
  )
}

function LockedCategory({ category }: { category: CategoryOption }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="tpl-category">{COPY.label}</Label>
      <select id="tpl-category" className={SELECT} value={category.key} disabled>
        <option value={category.key}>
          {category.nameZh} · {category.nameEn}
        </option>
      </select>
      <p className="text-muted-foreground text-xs">{COPY.systemHint}</p>
    </div>
  )
}
