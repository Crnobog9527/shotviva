import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { AppError, toAppError } from '../errors'
import { logger } from '../logger'
import { appOrigin } from '../site-url'
import { deleteAccount, noUploadsYetStorage, type AccountStorage } from './account-deletion'
import { getSessionUser } from './session'
import { createAdminSupabase } from './supabase-admin'
import { createServerSupabase } from './supabase-server'

const bodySchema = z.object({ confirm: z.literal('DELETE') })

// Session cookies are SameSite=Lax already; the Origin check also stops a same-site
// subdomain or a form on another origin from triggering an irreversible delete.
function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin !== appOrigin) throw new AppError('FORBIDDEN', 'Bad origin')
}

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

export async function handleDeleteAccount(request: NextRequest, storage: AccountStorage = noUploadsYetStorage) {
  try {
    await run(request, storage)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'INTERNAL') logger.error('account deletion failed', { error })
    return NextResponse.json(appError.toBody(), { status: appError.status })
  }
}
