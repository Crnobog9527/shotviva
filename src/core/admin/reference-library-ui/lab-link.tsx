import { useState } from 'react'
import { useRouter } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'
import { labRequest, labError } from '../prompt-lab-ui/api'
import { copy } from './copy'

export function LabLink({ assetId }: { assetId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function open() {
    setBusy(true)
    try {
      const { sessionId } = await labRequest<{ sessionId: string }>('workspace', { op: 'open', assetId })
      router.push('/admin/references/lab/' + encodeURIComponent(sessionId))
    } catch (e) { setError(labError(e)); setBusy(false) }
  }
  return <><Button disabled={busy} onClick={open}>{copy.openLab}</Button>{error && <span role="alert">{error}</span>}</>
}
