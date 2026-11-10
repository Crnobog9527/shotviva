import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Textarea } from '../../ui/textarea'
import { E } from './editor-copy'
import type { Editor, Terms } from './model'

export type CatalogAction = (data: FormData) => Promise<void>
function editorFields(item?: Editor) {
  return item?.draft ?? item?.current ?? { usd_cents: null, credits: undefined, sort_order: 10, listed: false,
    name_en: '', name_zh: '', benefit_en: '', benefit_zh: '' }
}
export function DraftForm({ item, action }: { item?: Editor; action: CatalogAction }) {
  const value = editorFields(item)
  return <form action={action} className="grid max-w-3xl gap-3 rounded border p-4 sm:grid-cols-2">
    <input type="hidden" name="op" value="save" />
    <input type="hidden" name="base" value={item?.current?.revision ?? ''} />
    <input type="hidden" name="previous" value={item?.request?.id ?? ''} />
    {item ? <input type="hidden" name="sku" value={item.product_id} /> : <label>{E.id}<Input name="sku" pattern="(pack_[a-z][a-z0-9]{0,47}|[a-z][a-z0-9]{0,47}_(monthly|yearly))" required placeholder="pack_xl / studio_monthly" /></label>}
    {!item && <label>{E.tier}<select name="tier" required defaultValue="" className="block w-full rounded border p-2">
      <option value="" disabled>请选择</option><option value="pack">积分包</option><option value="starter">Starter</option>
      <option value="pro">Pro</option><option value="max">Max</option></select></label>}
    <label>{E.amount}<Input type="number" min=".01" step=".01" name="usd" required defaultValue={value.usd_cents === null ? undefined : value.usd_cents / 100} /></label>
    <label>{E.credits}<Input type="number" min="1" name="credits" required defaultValue={value.credits} /></label>
    <label>{E.sort}<Input type="number" min="0" max="99999" name="sort_order" required defaultValue={value.sort_order} /></label>
    <label>{E.nameEn}<Input name="name_en" required maxLength={120} defaultValue={value.name_en} /></label>
    <label>{E.nameZh}<Input name="name_zh" required maxLength={120} defaultValue={value.name_zh} /></label>
    <label>{E.benefitEn}<Textarea name="benefit_en" maxLength={1000} defaultValue={value.benefit_en} /></label>
    <label>{E.benefitZh}<Textarea name="benefit_zh" maxLength={1000} defaultValue={value.benefit_zh} /></label>
    <label>{E.reason}<Input name="reason" required maxLength={500} /></label>
    <label><input type="checkbox" name="listed" defaultChecked={value.listed} /> {E.active}</label>
    <Button type="submit">{E.save}</Button>
  </form>
}

function metrics(v: Terms | null) {
  if (!v) return []
  const per = v.usd_cents / 100 / v.credits
  return [v.revision,(v.usd_cents/100).toFixed(2),v.credits,v.name_en,v.name_zh,v.benefit_en,v.benefit_zh,
    v.listed ? E.listed : E.hidden,v.sort_order,per.toFixed(6)]
}
export function Differences({ item }: { item: Editor }) {
  const columns = [E.version,E.amount,E.credits,E.nameEn,E.nameZh,E.benefitEn,E.benefitZh,E.status,E.order,E.unit]
  const before = metrics(item.current)
  const after = metrics(item.draft)
  return <section><table className="w-full max-w-3xl text-left text-sm"><thead><tr>{[E.field,E.old,E.next].map(x => <th key={x}>{x}</th>)}</tr></thead>
    <tbody>{columns.map((x,i) => <tr className="border-t" key={x}><th>{x}</th><td>{before[i] || E.empty}</td><td>{after[i] || E.empty}</td></tr>)}</tbody>
  </table><p className="text-sm">{E.rule} · {['pack_m','pack_l'].includes(item.product_id) ? E.memberRule : E.listRule}</p>
    </section>
}
