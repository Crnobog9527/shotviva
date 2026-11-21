'use client'

import { Check, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/core/ui/button'

// The org's enterprise number with a copy button and the reminder to put it in the payment
// reference. Not a secret; only the owner's console shows it.
export function RefCodeBox({ code }: { code: string }) {
  const t = useTranslations('app.org.payment')
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setNotice('copied')
    } catch {
      setNotice('failed')
    }
  }
  return (
    <div data-slot="org-ref-code" className="space-y-2">
      <p className="text-label text-muted-foreground">{t('refLabel')}</p>
      <p className="select-all font-mono text-lg font-semibold tracking-wider">{code}</p>
      <p className="text-label text-muted-foreground">{t('refHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="glass" size="touch" onClick={copy}>
          {notice === 'copied' ? <Check /> : <Copy />}{t('refCopy')}
        </Button>
        <span role="status" className="text-caption text-muted-foreground">{notice && t(notice === 'copied' ? 'copied' : 'copyFailed')}</span>
      </div>
    </div>
  )
}
