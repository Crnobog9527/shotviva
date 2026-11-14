import { useState } from 'react'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/core/ui/dialog'
import { Link } from '@/core/i18n/navigation'
import type { LabPage, LabPublishOptions, LabRun } from '../prompt-lab/types'
import { labError, labRequest } from './api'
import { copy as c, publishCopy, usd } from './copy'
import { executeCells } from './matrix-submit'
import { PublishDialog } from './publish-dialog'

const src = (id: string) => '/admin-media/prompt-lab/' + id
type Props = { sessionId: string; page: LabPage<LabRun>; publish: LabPublishOptions; archived: boolean; changed(): Promise<void>; more(): Promise<void> }

export function Results({ sessionId, page, publish, archived, changed, more }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState<LabRun | null>(null)
  async function act(action: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await action() } catch (e) { setError(labError(e)) } finally { setBusy(false) }
  }
  const mark = (run: LabRun, best: boolean) => act(async () => {
    await labRequest('workspace', { op: 'mark', sessionId, runId: run.id, starred: best ? null : !run.starred, best: best ? !run.is_best : null })
    await changed()
  })
  const groups = Map.groupBy(page.items, r => r.batch_id)
  return <section className="grid min-w-0 gap-3"><h2 className="font-medium">{c.results}</h2>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => act(changed)}>{c.reload}</Button>
      <Button variant="outline" disabled={selected.length !== 2} onClick={() => setPreview(selected)}>{c.compare} ({selected.length}/2)</Button>
      {page.items.some(r => r.status === 'queued') && <Button disabled={busy} onClick={() => act(() => executeCells(page.items, changed))}>{c.retryQueued}</Button>}</div>
    {!page.items.length && <p>{c.noResults}</p>}
    {[...groups.entries()].map(([id, runs]) => <ResultTable key={id} runs={runs} selected={selected}
      onSelect={run => setSelected(prev => prev.includes(run) ? prev.filter(x => x !== run) : [...prev.slice(-1), run])}
      onZoom={run => setPreview([run])} onMark={mark} busy={busy}
      sources={publish.sources} onPublish={archived ? undefined : setPublishing} />)}
    {page.next && <Button variant="outline" disabled={busy} onClick={() => act(more)}>{c.more}</Button>}
    {error && <p role="alert">{error}</p>}
    {publishing && <PublishDialog run={publishing} options={publish} onClose={() => setPublishing(null)} />}
    {!!preview.length && <Dialog open onOpenChange={open => { if (!open) setPreview([]) }}><DialogContent className="sm:max-w-[90vw]" aria-describedby={undefined}>
      <DialogTitle>{preview.length === 2 ? c.compare : c.zoom}</DialogTitle><div className="flex items-center gap-2">
      {preview.map(id => <div key={id} className="min-w-0 flex-1"><Output id={id} /></div>)}</div></DialogContent></Dialog>}
  </section>
}

type TableProps = { runs: LabRun[]; selected: string[]; onSelect(id: string): void; onZoom(id: string): void
  onMark(run: LabRun, best: boolean): void; busy: boolean
  sources: Record<string, string>; onPublish?: (run: LabRun) => void }
function ResultTable({ runs, ...controls }: TableProps) {
  const byPhoto = Map.groupBy(runs, r => r.photo_id)
  const versions = [...new Set(runs.map(r => r.prompt_lab_versions.version_no))].sort((a,b) => a-b)
  const model = runs[0].model.split('/').slice(1).join('/') || runs[0].model
  return <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm">
    <caption className="p-2 text-left">{new Date(runs[0].started_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · {model} · {runs[0].resolution} · {runs[0].quality}</caption>
    <thead><tr><th className="p-2">{c.onePhoto}</th>{versions.map(v => <th key={v}>v{v}</th>)}</tr></thead>
    <tbody>{[...byPhoto].map(([id, rows]) => <tr key={id}><th className="p-2" title={id}>
      {/* eslint-disable-next-line @next/next/no-img-element -- T85 checks the admin session before returning a thumbnail. */}
      <img loading="lazy" className="size-16 rounded object-cover" src={'/api/admin/test-thumbnail?kind=photo&id=' + id} alt={c.onePhoto} />
    </th>
      {versions.map(v => { const r = rows.find(x => x.prompt_lab_versions.version_no === v)
        return <td key={v} className="min-w-40 border p-2 align-top">{r && <Cell run={r} {...controls} />}</td> })}</tr>)}</tbody>
  </table></div>
}

function Cell({ run, selected, onSelect, onZoom, onMark, busy, sources, onPublish }: Omit<TableProps, 'runs'> & { run: LabRun }) {
  return <div className="grid gap-1"><span>{c.statuses[run.status]} {run.error_code}</span>
    <span>{c.estimated} {usd(run.estimate_usd)} · {c.actual} {run.cost_usd === null ? c.pendingCost : usd(run.cost_usd)}</span>
    {run.status === 'succeeded' && <><button onClick={() => onZoom(run.id)} aria-label={c.zoom}><Output id={run.id} /></button>
      <label><input type="checkbox" checked={selected.includes(run.id)} onChange={() => onSelect(run.id)} /> {c.comparePick}</label>
      <div className="flex flex-wrap gap-1"><Button size="xs" variant="outline" disabled={busy} aria-pressed={run.starred} onClick={() => onMark(run, false)}>{run.starred ? c.unstar : c.star}</Button>
      <Button size="xs" variant="outline" disabled={busy} aria-pressed={run.is_best} onClick={() => onMark(run, true)}>{run.is_best ? c.unbest : c.best}</Button></div>
      <PublishAction run={run} template={sources[run.id]} busy={busy} onPublish={onPublish} /></>}</div>
}
function Output({ id }: { id: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- The same-origin gateway authenticates each private request.
  return <img src={src(id)} loading="lazy" alt={c.outputAlt} className="max-h-[65vh] w-full rounded object-contain" />
}

// An archived reference cannot be published (the server refuses too), so the button is hidden.
function PublishAction({ run, template, busy, onPublish }: { run: LabRun; template?: string; busy: boolean; onPublish?: (run: LabRun) => void }) {
  if (template) return <p className="text-xs">{publishCopy.published} ·{' '}
    <Link className="underline underline-offset-4" href={'/admin/templates?edit=' + encodeURIComponent(template)}>{publishCopy.openDraft}</Link></p>
  if (!onPublish) return null
  return <Button size="xs" variant={run.is_best ? 'default' : 'outline'} disabled={busy} onClick={() => onPublish(run)}>{publishCopy.open}</Button>
}
