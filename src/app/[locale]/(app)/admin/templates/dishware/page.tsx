import { DishwareLibrary, dishwareCopy } from '@/core/admin/dishware-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { listDishware } from '@/core/dishware'
import { r2Store } from '@/core/storage'

import { deleteDishwareAction, finishDishwareAction, saveDishwareAction, stageDishwareAction } from './actions'

export const instant = false
export const metadata = { title: dishwareCopy.title }

// Private images: each shown through an hour-long signed address made for this admin's page.
export default async function AdminDishwarePage() {
  await requireAdmin()
  const store = r2Store()
  const items = await listDishware(createAdminSupabase())
  const shown = await Promise.all(items.map(async (item) => ({ ...item, previewUrl: await store.presignGet(item.imageKey, { expiresInSeconds: 3600 }) })))
  const actions = { save: saveDishwareAction, remove: deleteDishwareAction, stage: stageDishwareAction, finish: finishDishwareAction }
  return <DishwareLibrary items={shown} actions={actions} />
}
