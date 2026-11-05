import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { AppError, toAppError } from '../errors'
import { logger } from '../logger'
import { accountStorage, r2Store } from '../storage'
import { deleteAccount, type AccountStorage } from './account-deletion'
import { assertSameOrigin } from './api-guards'
import { getSessionUser } from './session'
import { createAdminSupabase } from './supabase-admin'
import { createServerSupabase } from './supabase-server'

const bodySchema = z.object({ confirm: z.literal('DELETE') })

async function run(request: NextRequest, storage: AccountStorage) {
  assertSameOrigin(request)
  const user = await getSessionUser()
  if (!user) throw new AppError('UNAUTHORIZED', 'Sign in first')
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) throw new AppError('INVALID_INPUT', 'Type DELETE to confirm')

  const admin = createAdminSupabase()
  await deleteAccount(user.id, {
    storage,
    authAdmin: { deleteUser: (id) => admin.auth.admin.deleteUser(id) },
  })
  // Clears this browser's cookies; the refresh token died with the user.
  const supabase = await createServerSupabase()
  await supabase.auth.signOut({ scope: 'local' })
}

// R2 is resolved lazily: a missing R2 config fails the request (500) before anything is
// deleted, rather than deleting the account and leaving its photos behind.
export async function handleDeleteAccount(request: NextRequest, storage: AccountStorage = accountStorage(r2Store)) {
  try {
    await run(request, storage)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'INTERNAL') logger.error('account deletion failed', { error })
    return NextResponse.json(appError.toBody(), { status: appError.status })
  }
}
