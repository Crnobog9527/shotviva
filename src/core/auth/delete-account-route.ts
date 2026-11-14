import 'server-only'
import { revalidateTag } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { AppError, toAppError } from '../errors'
import { GALLERY_CACHE_TAG } from '../gallery/cache'
import { logger } from '../logger'
import { accountStorage, r2Store } from '../storage'
import { deleteAccount, type AccountStorage, type CancelSubscriptions } from './account-deletion'
import { assertSameOrigin } from './api-guards'
import { getSessionUser } from './session'
import { createAdminSupabase } from './supabase-admin'
import { createSessionSupabase } from './supabase-server'

const bodySchema = z.object({ confirm: z.literal('DELETE') })

type RouteDeps = { cancelSubscriptions: CancelSubscriptions; storage?: AccountStorage }

async function run(request: NextRequest, deps: Required<RouteDeps>) {
  assertSameOrigin(request)
  const user = await getSessionUser()
  if (!user) throw new AppError('UNAUTHORIZED', 'Sign in first')
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) throw new AppError('INVALID_INPUT', 'Type DELETE to confirm')

  const admin = createAdminSupabase()
  await deleteAccount(user.id, {
    cancelSubscriptions: deps.cancelSubscriptions,
    storage: deps.storage,
    authAdmin: { deleteUser: (id) => admin.auth.admin.deleteUser(id) },
  })
  // Their public works are gone with the account; the gallery's cached pages must not keep them
  // (ARCHITECTURE §9 第 6 条): the next visit rebuilds them.
  // The account is already gone, so a failure here is logged, never answered as an error.
  try {
    revalidateTag(GALLERY_CACHE_TAG, { expire: 0 })
  } catch (error) {
    logger.warn('account deletion: gallery cache not expired', { error })
  }
  // Clears this browser's cookies; the refresh token died with the user.
  const supabase = await createSessionSupabase()
  await supabase.auth.signOut({ scope: 'local' })
}

// R2 is resolved lazily: a missing R2 config fails the request (500) before anything is
// deleted, rather than deleting the account and leaving its photos behind. A subscription
// Stripe would not cancel answers 502 SUBSCRIPTION_CANCEL_FAILED, with nothing deleted.
export async function handleDeleteAccount(request: NextRequest, deps: RouteDeps) {
  try {
    await run(request, { cancelSubscriptions: deps.cancelSubscriptions, storage: deps.storage ?? accountStorage(r2Store) })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'INTERNAL') logger.error('account deletion failed', { error })
    return NextResponse.json(appError.toBody(), { status: appError.status })
  }
}
