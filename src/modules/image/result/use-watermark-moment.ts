'use client'

import { useRef } from 'react'

import { usePaywall } from '@/core/billing/paywall/provider'

// The "saved a watermarked photo" moment (T107 「下载带水印的免费图 → Starter」): the free photo
// is saved as asked, then the paywall opens on Starter, once per result page. The pause lets the
// download or the system share sheet go first; the paywall never stands between the user and
// their photo.
const AFTER_SAVE_MS = 900

export function useWatermarkMoment(watermarked: boolean) {
  const paywall = usePaywall()
  const shown = useRef(false)
  return () => {
    if (!watermarked || shown.current) return
    shown.current = true
    window.setTimeout(() => paywall.open('watermark_download', { step: 'period', tier: 'starter', moment: 'watermark' }), AFTER_SAVE_MS)
  }
}
