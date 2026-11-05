'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

const VISIBLE_MS = 4000

// "Sent for review" after posting (DESIGN §4.7). The post form returns to /wishlist?sent=1;
// the flag is dropped from the address at once so a reload does not show it again.
export function SentNotice() {
  const t = useTranslations('app.wishlist')
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [visible, setVisible] = useState(() => params.get('sent') === '1')

  useEffect(() => {
    if (!visible) return
    router.replace(pathname, { scroll: false })
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [visible, pathname, router])

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(var(--sat)+12px)] z-70 flex justify-center px-4">
      {visible && <p className="hairline-lit rounded-full bg-card px-4 py-2 text-caption font-semibold shadow-raised">{t('sent')}</p>}
    </div>
  )
}
