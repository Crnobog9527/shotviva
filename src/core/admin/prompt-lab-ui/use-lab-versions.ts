import { useRef, useState } from 'react'
import { labError, labRequest } from './api'
import { copy as c } from './copy'

export type Editor = { id: string | null; prompt: string; note: string }

export function useLabVersions(sessionId: string, refresh: () => Promise<void>) {
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
  return { editor, setEditor, busy, message, submit, edit, save, reverse }
}
