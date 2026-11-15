'use server'

import { revalidatePath, updateTag } from 'next/cache'

import { runAdminAction, runAdminQuery } from '@/core/admin/templates'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { deleteDishware, DISHWARE_CACHE_TAG, finishDishware, saveDishware, stageDishware } from '@/core/dishware'
import { r2Store } from '@/core/storage'

// The vessel library's writes (ARCHITECTURE §5.1c「器皿图库」). Every save or delete expires the
// generation's cached library, so the next tableware job picks from the new one.
const PAGE = '/[locale]/admin/templates/dishware'

export async function stageDishwareAction(input: unknown) {
  await requireAdmin()
  return runAdminQuery(() => stageDishware(r2Store(), input))
}

export async function finishDishwareAction(input: unknown) {
  await requireAdmin()
  return runAdminQuery(() => finishDishware(r2Store(), input))
}

export async function saveDishwareAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveDishware({ db: createAdminSupabase(), store: r2Store() }, admin.id, input)
    updateTag(DISHWARE_CACHE_TAG)
    revalidatePath(PAGE, 'page')
  })
}

export async function deleteDishwareAction(id: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await deleteDishware({ db: createAdminSupabase(), store: r2Store() }, admin.id, id)
    updateTag(DISHWARE_CACHE_TAG)
    revalidatePath(PAGE, 'page')
  })
}
