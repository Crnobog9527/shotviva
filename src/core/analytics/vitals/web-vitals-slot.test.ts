import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { VITAL_ROUTES } from './fields'
import { vitalsRouteRoot } from './route-root'
import { APP_ROOT_PATH } from './web-vitals-slot'

// The eager path test stands in for vitalsRouteRoot, which lives in the lazy chunk.
describe('APP_ROOT_PATH', () => {
  it('starts the reporter on exactly the pages vitalsRouteRoot accepts', () => {
    const paths = [
      ...VITAL_ROUTES.flatMap((root) => [`/${root}`, `/zh/${root}`, `/${root}/x`, `/zh/${root}/x/y`, `/${root}x`, `/zh/${root}-x`, `/en/${root}`]),
      '/',
      '/zh',
      '/admin',
      '/zh/admin/users',
      '/checkout',
      '/join/abc',
      '/connect/graylum',
      '/pricing',
      '/zh/zh/generate',
      '',
    ]
    for (const path of paths) expect([path, APP_ROOT_PATH.test(path)]).toEqual([path, vitalsRouteRoot(path) !== null])
  })
})

// start-vitals.ts calls Next's own compiled copy by its internal path: a Next upgrade that moves
// or renames it fails here, not silently in the field. payload.ts files each metric under the URL
// it was measured on (navigationURL), which only the soft-navigation build sets; a plain
// web-vitals build at the same path would silently file metrics under the page at report time.
it('finds the web-vitals functions Next ships, in the build that sets navigationURL', async () => {
  const vitals = await import('next/dist/compiled/web-vitals')
  for (const name of ['onCLS', 'onLCP', 'onINP', 'onFCP', 'onTTFB'] as const) expect(typeof vitals[name]).toBe('function')
  const source = readFileSync(createRequire(import.meta.url).resolve('next/dist/compiled/web-vitals'), 'utf8')
  expect(source).toMatch(/navigationURL:/)
})
