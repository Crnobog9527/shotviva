'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'

import { COPY } from '@/core/admin/code-reports'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { logger } from '@/core/logger'

export async function toggleCode(_message: string, form: FormData) {
  const actor = await requireAdmin()
  const id = z.uuid().safeParse(form.get('id'))
  const active = z.enum(['true', 'false']).safeParse(form.get('active'))
  if (!id.success || !active.success) return COPY.invalid
  const { error } = await createAdminSupabase().rpc('admin_set_code_active', {
    p_actor: actor.id, p_code_id: id.data, p_active: active.data === 'true',
  })
  if (error) {
    logger.error('admin.codes.toggle_failed', { code: error.code })
    return COPY.failed
  }
  refresh()
  return ''
}
