'use client'

import { useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy } from 'lucide-react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/replay'
import { Button } from '@/core/ui/button'

const subscribeNothing = () => () => undefined

// A link shown whole with a copy button. `path` is site-relative; the origin is the page's own,
// known only in the browser, so the server render shows the path and the real URL replaces it.
// `url` is an already absolute link (the owner's customer link) and is shown as is.
export function InviteLinkBox({ path, url: absolute }: { path: string; url?: never } | { path?: never; url: string }) {
  const t = useTranslations('app.org.invite')
  // The page's own origin: '' while rendering on the server, the real one in the browser.
  const origin = useSyncExternalStore(subscribeNothing, () => window.location.origin, () => '')
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null)
  const url = absolute ?? origin + path
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('copied')
    } catch {
      setNotice('failed')
    }
  }
  return (
    <div className="space-y-2">
      <p className={`${REPLAY_BLOCK_CLASS} select-all break-all font-mono text-label`}>{url}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="glass" size="touch" disabled={!absolute && !origin} onClick={copy}>
          {notice === 'copied' ? <Check /> : <Copy />}{t('copy')}
        </Button>
        <span role="status" className="text-caption text-muted-foreground">{notice && t(notice === 'copied' ? 'copied' : 'copyFailed')}</span>
      </div>
    </div>
  )
}
