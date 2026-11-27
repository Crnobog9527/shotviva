import { redirect } from 'next/navigation'

import { requireAdmin } from '@/core/auth'

// The 模板调试台 went with 素材参考库 (Owner 2026-11-27); old links land on the template list.
export const instant = false

export default async function LabPage() {
  await requireAdmin()
  redirect('/admin/templates')
}
