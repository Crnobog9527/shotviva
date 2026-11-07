'use client'

import { useState } from 'react'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { isKnownCategory, TEMPLATE_CATEGORIES } from '@/core/templates/categories'

import { categoryCopy as COPY } from './copy'

const NEW = '__new__'
const SELECT = 'border-input h-9 rounded-md border bg-transparent px-3 text-sm'

type Props = { value: string; onChange: (category: string) => void }

// templates.category: one of the six stored English names, or "新分类…" with a text box for a
// genuinely new one. A stored value outside the six opens on the text box, as stored, with a
// warning; nothing is rewritten unless the admin picks another.
export function CategoryField({ value, onChange }: Props) {
  const [custom, setCustom] = useState(value !== '' && !isKnownCategory(value))
  const choice = custom ? NEW : value
  const pick = (next: string) => {
    if (next === NEW) {
      setCustom(true)
      onChange(isKnownCategory(value) ? '' : value)
      return
    }
    setCustom(false)
    onChange(next)
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="tpl-category">{COPY.label}</Label>
      <select id="tpl-category" className={SELECT} value={choice} onChange={(event) => pick(event.target.value)}>
        <option value="" disabled>
          {COPY.placeholder}
        </option>
        {TEMPLATE_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {COPY.zh[category]} · {category}
          </option>
        ))}
        <option value={NEW}>{COPY.newOption}</option>
      </select>
      {custom ? (
        <>
          <Label htmlFor="tpl-category-new" className="text-xs">
            {COPY.newLabel}
          </Label>
          <Input id="tpl-category-new" value={value} maxLength={60} onChange={(event) => onChange(event.target.value)} />
          {value.trim() !== '' ? <p className="text-destructive text-xs">{COPY.offList(value.trim())}</p> : null}
        </>
      ) : null}
    </div>
  )
}
