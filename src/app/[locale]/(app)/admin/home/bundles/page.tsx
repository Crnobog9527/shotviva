import type { Metadata } from 'next'

import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { BundlesTab, loadHomeDisplay } from '../home-display'

// 首页展示 › 组合库 (Owner 2026-11-27). Admin-only and request-time; the proxy 404s non-admins first.
export const instant = false

export const metadata: Metadata = { title: '首页展示 · 组合库' }

export default async function AdminHomeBundlesPage() {
  await requireAdmin()
  return <BundlesTab data={await loadHomeDisplay(createAdminSupabase())} />
}
