'use server'

import { refresh, updateTag } from 'next/cache'
import { after } from 'next/server'

import { runAdminQuery, type ActionValue } from '@/core/admin'
import { decideWorks } from '@/core/admin/gallery-review'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { GALLERY_CACHE_TAG } from '@/core/gallery'
import { r2Store } from '@/core/storage'

// A server action is a public endpoint, so it re-checks the admin role (the SQL function checks
// again). A decision expires the gallery's cache, so a rejected work leaves the pages at once; the
// works' gallery copies are made or removed after the response.
export async function decideWorksAction(input: unknown): Promise<ActionValue<number>> {
  const admin = await requireAdmin()
  return runAdminQuery(() =>
    decideWorks(
      {
        db: createAdminSupabase(),
        store: r2Store(),
        defer: (task) => after(task),
        invalidate: () => {
          updateTag(GALLERY_CACHE_TAG)
          refresh()
        },
      },
      admin.id,
      input,
    ),
  )
}
