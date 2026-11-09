'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { normalizeCode, percentZh } from '../../codes'
import type { ProductId } from '../../config'

type Preview = {
  credits: number; pool: 'free' | 'paid' | null; percent: number | null
  products: ProductId[] | null; duration: 'once' | 'repeating' | 'forever' | null; months: number | null
}
type Reply = { code: string; preview: Preview | null; unavailable?: boolean }

function useCodePreview(code: string | null) {
  const [reply, setReply] = useState<Reply | null>(null)
  useEffect(() => {
    if (!code) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/codes/preview?code=${encodeURIComponent(code)}`, { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) throw new Error()
        const { preview } = await res.json() as { preview: Preview | null }
        if (!controller.signal.aborted) setReply({ code, preview })
      } catch {
        if (!controller.signal.aborted) setReply({ code, preview: null, unavailable: true })
      }
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [code])
  return reply
}

export function SignupCodePreview({ raw }: { raw: string }) {
  const t = useTranslations('app.signupCodes')
  const code = normalizeCode(raw)
  const reply = useCodePreview(code)
  if (!raw) return null
  if (code && reply?.code === code && reply.preview) return <PreviewEffects preview={reply.preview} />
  const message = previewMessage(code, reply)
  return <p className="mt-1 text-muted-foreground">{t(message)}</p>
}

function previewMessage(code: string | null, reply: Reply | null) {
  if (!code) return 'invalid'
  if (reply?.code !== code) return 'checking'
  return reply.unavailable ? 'unavailable' : 'invalid'
}

function PreviewEffects({ preview }: { preview: Preview }) {
  const t = useTranslations('app.signupCodes')
  const format = useFormatter()
  const locale = useLocale()
  const { credits, pool, percent, products, duration, months } = preview
  const targets = format.list((products ?? []).map(id => t(`products.${id}`)), { type: 'conjunction' })
  return (
    <div className="mt-1 space-y-1 text-success">
      {credits > 0 && <p>{t('gift', { credits, pool: pool ?? 'free' })}</p>}
      {percent && <p>{t('discount', { percent: locale === 'zh' ? percentZh(percent) : percent, targets })}{' '}
        {t(`period.${products?.every(id => id.startsWith('pack_')) ? 'once' : duration ?? 'once'}`, { months: months ?? 0 })}</p>}
    </div>
  )
}
