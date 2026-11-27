import type { Metadata } from 'next'

import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { loadHomeDisplay, LocaleTab } from '../home-display'

// 首页展示 › 中文站 (Owner 2026-11-27). Admin-only and request-time; the proxy 404s non-admins first.
export const instant = false

export const metadata: Metadata = { title: '首页展示 · 中文站' }

export default async function AdminHomeZhPage() {
  await requireAdmin()
  return <LocaleTab locale="zh" data={await loadHomeDisplay(createAdminSupabase())} />
}
