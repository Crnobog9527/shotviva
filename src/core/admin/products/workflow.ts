import 'server-only'
import { z } from 'zod'
import { notifyOwner } from '../../alerts'
import { callRpc, type RpcClient } from '../../billing/rpc'
import { stripeClient } from '../../billing/stripe/client'
import { serverEnv } from '../../env'
import { readEditor, readRelease } from './editor-data'
import { accountId, priceId, type Editor } from './model'
import { newBindings, oldBindings, ReviewError, verifyAccount } from './stripe-review'
import { reviewWaffo } from './waffo-review'

export const phases = z.enum(['prepare', 'publish', 'archive', 'waffo'])
type Phase = z.infer<typeof phases>
type Review = { db: RpcClient; actor: string; id: string; item: Editor; form: FormData }
const voidResult = z.null()

function liveEnvironment() {
  const env = serverEnv()
  const live = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? '')
  if (live !== (env.VERCEL_ENV === 'production')) throw new ReviewError('stripe_environment')
  return live
}
async function prepare({ db, actor, id, item, form }: Review) {
  const account = accountId.parse(form.get('account'))
  const live = liveEnvironment()
  const stripe = stripeClient()
  await verifyAccount(stripe, account)
  const prices = await oldBindings(stripe, item, live)
  return callRpc(db, 'admin_catalog_prepare', { p_actor: actor,p_id: id,p_account: account,p_live: live,p_prices: prices }, z.uuid())
}
async function publish({ db, actor, id, item, form }: Review) {
  const account = accountId.parse(item.request?.stripe_account)
  const live = liveEnvironment()
  if (item.request?.livemode !== live) throw new ReviewError('stripe_environment')
  const stripe = stripeClient()
  await verifyAccount(stripe, account)
  const prices = await newBindings(stripe, item, form, live)
  return callRpc(db, 'admin_catalog_publish', { p_actor: actor,p_id: id,p_account: account,p_live: live,p_prices: prices }, z.uuid())
}
export function archivable(db: RpcClient, actor: string, id: string) {
  return callRpc(db, 'admin_catalog_archivable', { p_actor: actor,p_id: id }, z.array(priceId))
}
async function archive({ db, actor, id, form }: Review) {
  const price = priceId.parse(form.get('price'))
  const safe = await archivable(db, actor, id)
  if (!safe.includes(price)) throw new ReviewError('CATALOG_STILL_IN_USE')
  const stripe = stripeClient()
  // The account was pinned at preparation; a changed credential cannot attest an archive.
  const account = await callRpc(db, 'admin_catalog_account', { p_actor: actor,p_id: id }, accountId)
  await verifyAccount(stripe, account)
  const object = await stripe.prices.retrieve(price)
  if (object.active || object.livemode !== liveEnvironment()) throw new ReviewError('stripe_price_still_active')
  await callRpc(db, 'admin_catalog_archive', { p_actor: actor,p_id: id,p_price: price }, voidResult)
}
const execute = { prepare, publish, archive, waffo: reviewWaffo }
export function safeFailure(error: unknown) {
  if (error instanceof ReviewError) return error.message
  if (error instanceof z.ZodError) return 'INVALID_INPUT'
  const cause = error instanceof Error ? error.cause : null
  const sql = z.object({ message: z.string().regex(/^(?:(?:CATALOG_|PRODUCT_)[A-Z0-9_]+|INVALID_INPUT|NOT_ADMIN)(?:: [a-zA-Z0-9_ -]{1,100})?$/) }).safeParse(cause)
  if (sql.success) return sql.data.message
  return 'REVIEW_UNAVAILABLE'
}
function alreadyReviewed(item: Editor, id: string, phase: Phase, publishedRevision?: number) {
  if (item.request?.id === id) {
    return phase === 'prepare' && item.request.status === 'prepared'
  }
  if (!publishedRevision || phase === 'prepare') throw new ReviewError('CATALOG_STALE')
  if (phase === 'waffo' && item.current?.revision !== publishedRevision) throw new ReviewError('CATALOG_STALE')
  return phase === 'publish'
}
export async function review(db: RpcClient, actor: string, product: string, phase: Phase, form: FormData) {
  const id = z.uuid().parse(form.get('request'))
  const item = await readEditor(db, actor, product)
  if (!item) throw new ReviewError('CATALOG_STALE')
  const release = item.request?.id === id ? null : await readRelease(db,actor,product,id)
  if (alreadyReviewed(item,id,phase,release?.revision)) return
  try {
    await execute[phase]({ db, actor, id, item, form })
  } catch (error) {
    const code = safeFailure(error)
    notifyOwner({ kind: 'catalog_publish_failed', request: id, step: phase })
    await db.rpc('admin_catalog_retry', { p_actor: actor,p_id: id,p_step: phase,p_error: code.replaceAll(' ', '_') })
    throw error
  }
}
