'use server'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { r2Store } from '@/core/storage'
import type { StoreSave } from '@/core/store-profile'
import { readStoreProfile, saveStoreProfile } from '@/core/store-profile/store'

// 店铺信息 (ARCHITECTURE §5.3「每周复用」): the account card's read and save, own row only.
export async function loadStoreProfile() {
  const user = await requireUser('/account')
  return readStoreProfile(createAdminSupabase(), r2Store, user.id)
}

export async function saveStoreProfileAction(input: StoreSave) {
  const user = await requireUser('/account')
  return saveStoreProfile(createAdminSupabase(), r2Store, user.id, input)
}
