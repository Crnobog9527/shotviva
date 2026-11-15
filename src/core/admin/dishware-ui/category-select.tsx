import { DISH_CATEGORIES, type DishCategory } from '@/core/templates/food-flow'

import { CATEGORY_NAMES } from './copy'

export function CategorySelect({ value, onChange, id }: { value: DishCategory; onChange: (value: DishCategory) => void; id: string }) {
  return (
    <select id={id} className="h-9 rounded-md border bg-background px-2 text-sm" value={value}
      onChange={(event) => onChange(event.target.value as DishCategory)}>
      {DISH_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_NAMES[category]}</option>)}
    </select>
  )
}
