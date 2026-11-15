import Link from 'next/link'

import { DISH_CATEGORIES } from '@/core/templates/food-flow'

import { DishwareCard } from './dishware-card'
import { CATEGORY_NAMES, dishwareCopy as copy } from './copy'
import type { DishwareActions, ShownDishware } from './types'
import { DishwareUpload } from './upload-form'

// The whole library by category, with the upload form on top.
export function DishwareLibrary({ items, actions }: { items: ShownDishware[]; actions: DishwareActions }) {
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-6 p-6">
      <div className="grid gap-2">
        <Link href="/admin/templates" className="text-sm underline underline-offset-4">{copy.back}</Link>
        <h1 className="text-xl font-semibold">{copy.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{copy.intro}</p>
        <p className="max-w-3xl text-sm text-muted-foreground">{copy.syncNote}</p>
      </div>
      <DishwareUpload actions={actions} />
      {DISH_CATEGORIES.map((category) => {
        const shown = items.filter((item) => item.category === category)
        return (
          <section key={category} className="grid gap-3">
            <h2 className="font-medium">{CATEGORY_NAMES[category]}（{shown.filter((item) => item.isActive).length} 只在用）</h2>
            {shown.length === 0 ? <p className="text-sm text-muted-foreground">{copy.empty}</p> : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {shown.map((item) => <DishwareCard key={`${item.id}:${item.imageKey}`} item={item} actions={actions} />)}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
