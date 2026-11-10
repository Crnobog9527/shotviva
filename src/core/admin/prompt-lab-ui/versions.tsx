import { useId, useRef, useState } from 'react'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'
import { Input } from '@/core/ui/input'
import type { LabPage, LabVersion } from '../prompt-lab/types'
import { labError, labRequest } from './api'
import { copy as c } from './copy'

type Editor = { id: string | null; prompt: string; note: string }
type Props = { sessionId: string; versions: LabPage<LabVersion>; refresh(): Promise<void>; more(): Promise<void>; archived: boolean }
export function Versions({ sessionId, versions, refresh, more, archived }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const reverseId = useRef<string | null>(null)
  const submit = async (action: () => Promise<unknown>) => {
    setBusy(true); setMessage('')
    try { await action() } catch (e) { setMessage(labError(e)) } finally { setBusy(false) }
  }
  const edit = (id: string) => submit(async () => {
    const row = await labRequest<Editor>(`workspace?view=version&sessionId=${sessionId}&id=${id}`)
    setEditor({ ...row, note: row.note ?? '' })
  })
  const save = (value: Editor, mode: 'create' | 'edit' | 'copy') => submit(async () => {
    await labRequest('workspace', { op: 'version', mode, sessionId, versionId: value.id,
      prompt: mode === 'copy' ? null : value.prompt, note: mode === 'copy' ? null : value.note })
    setEditor(null); await refresh()
  })
  const reverse = () => submit(async () => {
    reverseId.current ??= crypto.randomUUID()
    const reply = await labRequest<{ status: string; versionId: string | null }>('reverse', { sessionId, requestId: reverseId.current })
    if (reply.status !== 'running') reverseId.current = null
    setMessage(reply.versionId ? c.saved : reply.status === 'failed' ? c.statuses.failed : c.waiting)
    await refresh()
  })
  return <section className="grid gap-3 rounded border p-4"><h2 className="font-medium">{c.versions}</h2>
    <div className="flex flex-wrap gap-2"><Button disabled={busy || archived} onClick={() => setEditor({ id: null, prompt: '', note: '' })}>{c.newVersion}</Button>
      <Button variant="outline" disabled={busy || archived} onClick={reverse}>{c.reverse}</Button></div>
    <small>{c.archivedReverse}</small>
    {!versions.items.length && <p>{c.emptyVersions}</p>}
    <ul className="divide-y">{versions.items.map(v => <li key={v.id} className="flex items-center gap-2 py-1">
      <span className="min-w-0 flex-1 truncate">v{v.version_no} {v.note}</span>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => edit(v.id)}>{c.edit}</Button>
      <Button size="sm" variant="ghost" disabled={busy || archived} onClick={() => save({ id: v.id, prompt: '', note: '' }, 'copy')}>{c.duplicate}</Button>
    </li>)}</ul>
    {versions.next && <Button variant="outline" disabled={busy} onClick={() => submit(more)}>{c.moreVersions}</Button>}
    {editor && <VersionForm key={editor.id ?? 'new'} value={editor} disabled={busy || archived} cancel={() => setEditor(null)}
      save={value => save(value, value.id ? 'edit' : 'create')} />}
    {message && <p role="status">{message}</p>}
  </section>
}

function VersionForm({ value, disabled, cancel, save }: { value: Editor; disabled: boolean; cancel(): void; save(v: Editor): void }) {
  const [prompt, setPrompt] = useState(value.prompt)
  const [note, setNote] = useState(value.note)
  const id = useId()
  return <form className="grid gap-2" onSubmit={e => { e.preventDefault(); save({ ...value, prompt, note }) }}>
    <label htmlFor={id}>{c.prompt}</label><Textarea id={id} required readOnly={disabled} maxLength={32000}
      rows={8} value={prompt} onChange={e => setPrompt(e.target.value)} />
    <label>{c.note}<Input value={note} maxLength={2000} readOnly={disabled} onChange={e => setNote(e.target.value)} /></label>
    <div className="flex gap-2"><Button disabled={disabled || !prompt.trim()}>{c.save}</Button>
      <Button variant="outline" type="button" onClick={cancel}>{c.cancel}</Button></div></form>
}
