import { useState } from 'react'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'
import type { LabModels, ReverseSettings } from '../prompt-lab/types'
import { labError, labRequest } from './api'
import { copy as c } from './copy'

export function Settings({ models }: { models: LabModels['vision'] }) {
  const [value, setValue] = useState<ReverseSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function open() {
    setMessage(''); setBusy(true)
    try { setValue(await labRequest<ReverseSettings>('settings')) } catch (e) { setMessage(labError(e)) } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setMessage('')
    try { await labRequest('settings', value!); setValue(null); setMessage(c.saved) } catch (e) { setMessage(labError(e)) } finally { setBusy(false) }
  }
  return <section className="grid gap-2"><Button variant="outline" disabled={busy} onClick={() => value ? setValue(null) : open()}>{c.settings}</Button>
    {value && <form className="grid gap-3 rounded border p-3" onSubmit={e => { e.preventDefault(); void save() }}>
      <p>{c.configHint}</p><label>{c.vision}<select value={value.model} className="block w-full border p-1" onChange={e => {
        const model = e.target.value; setValue({ model, instruction: model ? value.instruction : '' })
      }}><option value="">{c.disabled}</option>{models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      {!models.length && <p>{c.noVision}</p>}
      <label>{c.instruction}<Textarea maxLength={32000} disabled={!value.model} required={!!value.model} value={value.instruction}
        onChange={e => setValue({ ...value, instruction: e.target.value })} /></label>
      <Button disabled={busy}>{c.save}</Button></form>}
    {message && <p role="status">{message}</p>}</section>
}
