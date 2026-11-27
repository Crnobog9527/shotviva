import type { Metadata } from 'next'

import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { DefaultTab, loadHomeDisplay } from './home-display'

// 首页展示 › 默认 (Owner 2026-11-27). Admin-only and request-time; the proxy 404s non-admins first.
export const instant = false

export const metadata: Metadata = { title: '首页展示 · 默认' }

export default async function AdminHomeDefaultPage() {
  await requireAdmin()
  return <DefaultTab data={await loadHomeDisplay(createAdminSupabase())} />
}
