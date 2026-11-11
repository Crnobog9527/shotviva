import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { STRIPE_TAX_CODE, stripeProductId } from '../../billing/stripe/catalog'
import { E } from './editor-copy'
import type { CatalogAction } from './editor-form'
import { asProduct, checklist, type Editor } from './model'

function Hidden({ item, op }: { item: Editor; op: string }) {
  return <><input type="hidden" name="sku" value={item.product_id} /><input type="hidden" name="request" value={item.request?.id} />
    <input type="hidden" name="op" value={op} /></>
}
export function ManualReview({ item, action }: { item: Editor; action: CatalogAction }) {
  if (!item.request || !item.draft) return null
  if (item.request.status === 'draft') return <form className="grid max-w-xl gap-3" action={action}>
    <Hidden item={item} op="prepare" /><p>{E.reviewAmount}</p><label>{E.account}<Input name="account" required pattern="acct_[A-Za-z0-9]+" placeholder="acct_…" /></label>
    <label><input name="confirmed" type="checkbox" required /> {E.confirmText}</label><Button type="submit">{E.confirm}</Button></form>
  const product = asProduct(item, item.draft)
  return <section className="grid gap-3"><h2>{E.forms}</h2><p>{E.frozen}</p>
    <dl><dt>{E.request}</dt><dd><code>{item.request.id}</code></dd><dt>{E.mode}</dt><dd>{item.request.livemode ? E.live : E.test} · {item.request.stripe_account}</dd></dl>
    <p>{E.stripeInstructions}</p><p><code>{stripeProductId(product)} · {STRIPE_TAX_CODE} · tier={item.tier} · product_id={item.product_id}</code></p><p>{E.moved}</p>
    <form action={action} className="grid gap-3"><Hidden item={item} op="publish" />
      {checklist(item).map(f => <fieldset className="grid gap-1 rounded border p-3" key={f.lookupKey}><legend>{f.lookupKey}</legend>
        <p>{E.interval} · {f.recurring === 'month' ? E.monthly : f.recurring === 'year' ? E.yearly : E.pack}</p>
        <p>{E.amountCents} · {f.oldCents ?? E.empty} → {f.unitAmount}</p><p>{E.oldPrice} · {f.oldId ?? E.empty}</p>
        {f.reuse ? <p>{E.newPrice} · {f.oldId}</p> : <label>{E.newPrice}<Input name={f.lookupKey} pattern="price_[A-Za-z0-9]+" required /></label>}
      </fieldset>)}<Button type="submit">{E.check}</Button></form></section>
}
export function WaffoReview({ item, action, request, enabled }: { item: Editor; action: CatalogAction; request: string; enabled: boolean }) {
  if (!enabled) return <p>{E.waffoOff}</p>
  const value = item.request?.id === request ? item.draft : item.current
  return <form action={action} className="grid max-w-xl gap-2"><h2>{E.waffo}</h2><p>{E.waffoHelp}</p>
    {value && <p>{item.product_id} · {E.version} {value.revision} · {value.usd_cents} {E.amountCents} · {value.credits} {E.credits} · {E[item.kind]}</p>}
    <input type="hidden" name="sku" value={item.product_id} /><input type="hidden" name="request" value={request} /><input type="hidden" name="op" value="waffo" />
    <label>{E.waffoOnce}<Input name="waffo_once" defaultValue={item.waffo?.one_time_id} pattern="PROD_[A-Za-z0-9]+" required /></label>
    {item.tier !== 'pack' && <><label>{E.waffoSub}<Input name="waffo_recurring" defaultValue={item.waffo?.recurring_id ?? undefined} pattern="PROD_[A-Za-z0-9]+" required /></label>
      <label><input type="checkbox" name="waffo_period" value={item.kind === 'monthly' ? 'month' : 'year'} required /> {E.waffoPeriod} · {E[item.kind]}</label></>}
    <Button type="submit">{E.waffoCheck}</Button></form>
}
export function ArchiveReview({ item, id, prices, action }: { item: Editor; id: string; prices: string[]; action: CatalogAction }) {
  if (!prices.length) return <p>{E.archiveWait}</p>
  return <section><h2>{E.archived}</h2>{prices.map(price => <form action={action} key={price} className="flex items-center gap-3">
    <code>{price}</code><input type="hidden" name="sku" value={item.product_id} /><input type="hidden" name="op" value="archive" />
    <input type="hidden" name="request" value={id} /><input type="hidden" name="price" value={price} /><Button type="submit">{E.confirmArchived}</Button></form>)}</section>
}
