'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy, Share2 } from 'lucide-react'

import { REPLAY_BLOCK_CLASS, track } from '../../analytics/browser'
import { Button } from '../../ui/button'
import { useMediaQuery } from '../../ui/use-media-query'

export function InviteLink({ url }: { url: string }) {
  const t = useTranslations('app.accountCodes.invite')
  const mobile = useMediaQuery('(pointer: coarse)')
  const [notice, setNotice] = useState<'copied' | 'copyFailed' | 'shareFailed' | null>(null)
  async function act(action: 'copy' | 'share') {
    try {
      if (action === 'copy') await navigator.clipboard.writeText(url)
      else await navigator.share({ url })
      track('invite_share', { action, surface: 'account' })
      setNotice(action === 'copy' ? 'copied' : null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(action === 'copy' ? 'copyFailed' : 'shareFailed')
    }
  }
  return (
    <div className="space-y-2">
      <p className={`${REPLAY_BLOCK_CLASS} select-all break-all font-mono text-label`}>{url}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="glass" size="touch" onClick={() => act('copy')}>
          {notice === 'copied' ? <Check /> : <Copy />}{t('copy')}
        </Button>
        {mobile && typeof navigator.share === 'function' && (
          <Button variant="glass" size="touch" onClick={() => act('share')}><Share2 />{t('share')}</Button>
        )}
      </div>
      <span role="status" className="text-caption text-muted-foreground">{notice && t(notice)}</span>
    </div>
  )
}
