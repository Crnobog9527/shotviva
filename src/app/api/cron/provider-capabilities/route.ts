

import { revalidateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { refreshAllCapabilities } from '@/core/admin/providers'
import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { authorizedCron } from '@/core/cron/authorized'
import { PROVIDERS_CACHE_TAG } from '@/core/providers'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

// Authenticated by Vercel's cron bearer secret. No provider credentials enter this route.
export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  const { updated, failures } = await refreshAllCapabilities({ db: createAdminSupabase() })
  if (updated) {
    await revalidateCatalogueTag(PROVIDERS_CACHE_TAG)
    warmPublicPagesSoon()
  }
  return Response.json({ updated, failures }, { status: failures ? 502 : 200 })
}
