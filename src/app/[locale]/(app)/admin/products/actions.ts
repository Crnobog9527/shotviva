'use server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect, unstable_rethrow } from 'next/navigation'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { phases, review, safeFailure } from '@/core/admin/products/workflow'
import { saveDraft } from '@/core/admin/products/editor-data'
import { productIdSchema } from '@/core/config/product-id'

export async function catalogAction(form: FormData) {
  const actor = await requireAdmin()
  const sku = productIdSchema.safeParse(form.get('sku'))
  const query = new URLSearchParams()
  try {
    if (!sku.success || actor.banned) throw new Error('Invalid request')
    query.set('sku', sku.data)
    const db = createAdminSupabase()
    if (form.get('op') === 'save') await saveDraft(db,actor.id,sku.data,form)
    else {
      const phase = phases.parse(form.get('op'))
      if (phase === 'prepare' && form.get('confirmed') !== 'on') throw new Error('Confirmation required')
      await review(db,actor.id,sku.data,phase,form)
      if (phase === 'publish' || phase === 'waffo') updateTag('billing-products')
    }
    revalidatePath('/[locale]/admin/products','page')
    query.set('done','1')
  } catch (error) {
    unstable_rethrow(error)
    query.set('error',safeFailure(error))
  }
  redirect('/admin/products?'+query.toString())
}
