'use server'

import { refresh, updateTag } from 'next/cache'
import { z } from 'zod'
import { runAdminAction } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'

const sale = z.object({ id: z.string().min(1).max(64), enabled: z.boolean() })

export async function setTemplateSaleAction(input: unknown) {
  const actor = await requireAdmin()
  return runAdminAction(async () => {
    const { id, enabled } = sale.parse(input)
    const { error } = await createAdminSupabase().rpc('admin_set_template_sale', {
      p_actor: actor.id, p_template_id: id, p_enabled: enabled,
    })
    if (error) {
      if (['UNPUBLISH_FIRST', 'TEMPLATE_PRICE_BELOW_FLOOR'].includes(error.message)) throw new AppError('INVALID_INPUT', error.details)
      throw new AppError('INTERNAL', '无法更新销售状态', { cause: error })
    }
    // Whether a template is on sale decides whether the catalogue (cached for every page, signed-in
    // ones included) lists it and whether its workspace opens: expire it now, like any template save.
    updateTag(TEMPLATES_CACHE_TAG)
    refresh()
  })
}
