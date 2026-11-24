import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

// Wishlist shows first, then fills in (Owner 2026-11-24): the wall's first page is a shared cache
// in the App Shell; the viewer's own votes and eligibility stream after it.
describe('shared wall first page (wall.ts)', () => {
  const source = read('src/core/wishlist/wall.ts')
  const shared = /export async function cachedWallFirstPage[\s\S]*?\n\}/.exec(source)?.[0] ?? ''

  it('is a cache of its own, tagged, never anyone’s votes', () => {
    expect(shared).toMatch(/^export async function cachedWallFirstPage[^{]*\{\s*'use cache'\s*cacheTag\(WISHLIST_WALL_TAG\)/)
    expect(shared).toMatch(/toCard\(row, false,/)
    expect(shared).not.toMatch(/ownVotes/)
  })

  it('stays fresh 5 minutes and is kept 30 at most, inside the 60-minute image links', () => {
    expect(shared).toMatch(/cacheLife\(\{ stale: 300, revalidate: 300, expire: 1800 \}\)/)
    expect(read('src/core/wishlist/images.ts')).toMatch(/IMAGE_URL_TTL_SECONDS = 60 \* 60/)
  })

  it('never throws: without the database key or on a failed read it is null for a minute', () => {
    expect(shared).toMatch(/if \(!serverEnv\(\)\.SUPABASE_SERVICE_ROLE_KEY\) \{\s*cacheLife\(\{ stale: 60[\s\S]*?return null/)
    expect(shared).toMatch(/catch \(error\) \{\s*cacheLife\(\{ stale: 60[\s\S]*?return null/)
  })

  it('a vote and an admin review expire it', () => {
    expect(read('src/core/wishlist/requests.ts')).toMatch(/voteRowsSchema,\s*\)\s*\/\/[^\n]*\n\s*expireWallCache\(\)/)
    // A review expires it only after the dropped images are deleted (review of #886).
    expect(read('src/core/wishlist/admin.ts')).toMatch(/'admin_review_template_request'[\s\S]*?deleteImages\(deps\.store, dropped\)[\s\S]*?\n\s*expireWallCache\(\)\n\}/)
  })

  it('names a shipped card’s template only as a signed-in viewer sees it (anonymous client, RLS)', () => {
    expect(shared).toMatch(/const rows = await withVisibleTemplateNames\(raw\)/)
    expect(read('src/core/wishlist/wall.ts')).toMatch(/bearerClient\(\{ url: publicEnv\.NEXT_PUBLIC_SUPABASE_URL, anonKey: publicEnv\.NEXT_PUBLIC_SUPABASE_ANON_KEY \}, null\)/)
  })
})

describe('the wishlist page', () => {
  const page = read('src/app/[locale]/(app)/wishlist/page.tsx')

  it('reads the viewer at request time only, and falls back to the request-time wall', () => {
    expect(page).toMatch(/async function readViewer[\s\S]*?await connection\(\)[\s\S]*?requireUser\('\/wishlist'\)/)
    expect(page).toMatch(/if \(!shared\) return <RequestTimeWall \/>/)
    expect(page).toMatch(/async function RequestTimeWall[\s\S]*?await connection\(\)/)
  })
})
