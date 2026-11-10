import Link from 'next/link'
import { E } from './editor-copy'
import { Economics } from './economics'
import { Differences, DraftForm, type CatalogAction } from './editor-form'
import { ArchiveReview, ManualReview, WaffoReview } from './manual-review'
import type { CatalogPageRows, Editor } from './model'

const path = '/admin/products'
const href = (product: string) => path + '?sku=' + encodeURIComponent(product)
export function CatalogList({ rows }: { rows: CatalogPageRows }) {
  return <section className="grid gap-3"><Link href={href('new')} className="underline">{E.create}</Link>
    <table className="w-full text-left text-sm"><thead><tr>{[E.nameZh,E.id,E.amount,E.credits,E.version,E.status,E.edit].map(s => <th key={s}>{s}</th>)}</tr></thead>
      <tbody>{rows.slice(0,30).map(r => <tr key={r.product_id} className="border-t">
        <td>{r.name_zh ?? E.draft}<small className="block">{r.name_en}</small></td><td>{r.product_id}</td>
        <td>{r.usd_cents === null ? E.empty : (r.usd_cents / 100).toFixed(2)}</td><td>{r.credits ?? E.empty}</td><td>{r.published_revision ?? E.empty}</td>
        <td>{r.pending ? E[r.pending] : r.listed ? E.listed : E.hidden}</td><td><Link className="underline" href={href(r.product_id)}>{E.edit}</Link></td>
      </tr>)}</tbody></table>{rows.length > 30 && <Link href={path+'?after='+rows[29]!.product_id}>{E.nextPage}</Link>}</section>
}
function History({ item }: { item: Editor }) {
  const more = item.history[19]
  return <section><h2>{E.history}</h2><ol>{item.history.slice(0,20).map(r => <li key={r.id} className="border-t py-2">
    {r.created_at} · {r.base_revision ?? E.empty} → {r.revision} · {E[r.status]} · {r.reason}
    <small className="block">{E.owner} {r.actor_id} · {E.request} <Link href={href(item.product_id)+'&release='+r.id} className="underline">{r.id}</Link></small>
    {r.last_error && <p>{E.retry} · {r.last_error}</p>}
  </li>)}</ol>{item.history.length>20 && more && <Link href={href(item.product_id)+'&before='+encodeURIComponent(more.created_at)+'&beforeId='+more.id}>{E.nextPage}</Link>}</section>
}
export function EditorView({ item,action,archiveId,prices,waffo,publishedCurrent }: {
  item: Editor; action: CatalogAction; archiveId?: string; prices: string[]; waffo: boolean; publishedCurrent: boolean
}) {
  const request = item.request?.status === 'prepared' ? item.request.id : publishedCurrent ? archiveId : undefined
  return <div className="grid gap-6"><Link href={path} className="underline">{E.back}</Link>
    {item.request?.status !== 'prepared' && <DraftForm action={action} item={item} />}
    <Differences item={item} /><Economics item={item} /><ManualReview item={item} action={action} />
    {request && <WaffoReview item={item} enabled={waffo} action={action} request={request} />}
    {archiveId && <ArchiveReview item={item} action={action} prices={prices} id={archiveId} />}<History item={item} /></div>
}
export function CatalogNotice({ error, done }: { error?: string; done?: string }) {
  if (!error) return done ? <p role="status">{E.done}</p> : null
  const messages: Record<string,string> = { INVALID_INPUT: E.invalid,CATALOG_STALE: E.stale,NOT_ADMIN: E.denied,PRODUCT_PUBLISH_REQUIRES_V2: E.v2 }
  return <p role="alert" className="rounded border p-2">{messages[error] ?? E.failed} {error.slice(0,140)}</p>
}
