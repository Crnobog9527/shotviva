import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  ASSETS_CACHE_CONTROL,
  assetsEnvShape,
  assetsHeaders,
  assetsRemotePatterns,
  assetsRewrites,
  checkAssetsEnv,
  readAssetsEnv,
  servesAssetsOnSite,
} from './assets-env'

const R2 = 'https://pub-0123456789abcdef.r2.dev'
const schema = z.object(assetsEnvShape).superRefine(checkAssetsEnv)

// ARCHITECTURE §8.3「公开读」, T51.
describe('covers on the site\'s own /assets', () => {
  it('rewrites /assets/* to the public bucket when R2_PUBLIC_ORIGIN is set, and not otherwise', () => {
    expect(assetsRewrites(R2)).toEqual([{ source: '/assets/:path*', destination: `${R2}/:path*` }])
    expect(assetsRewrites(undefined)).toEqual([])
  })

  it('caches /assets/* for a year, immutable, in browsers and on the Vercel CDN (cover names carry a content hash)', () => {
    expect(ASSETS_CACHE_CONTROL).toBe('public, max-age=31536000, immutable')
    expect(assetsHeaders()).toEqual([
      {
        source: '/assets/:path*',
        headers: [
          { key: 'Cache-Control', value: ASSETS_CACHE_CONTROL },
          { key: 'CDN-Cache-Control', value: ASSETS_CACHE_CONTROL },
          { key: 'x-vercel-enable-rewrite-caching', value: '1' },
        ],
      },
    ])
  })

  it('never fails the build: an unset or invalid origin just leaves the rewrite out', () => {
    expect(readAssetsEnv({})).toEqual({})
    expect(readAssetsEnv({ R2_PUBLIC_ORIGIN: '' })).toEqual({})
    expect(readAssetsEnv({ R2_PUBLIC_ORIGIN: 'not a url' })).toEqual({})
    expect(readAssetsEnv({ R2_PUBLIC_ORIGIN: `${R2}/` }).R2_PUBLIC_ORIGIN).toBe(R2)
  })

  it('requires R2_PUBLIC_ORIGIN only when the cover base is the site\'s own /assets', () => {
    expect(servesAssetsOnSite('https://shotviva.com/assets')).toBe(true)
    expect(servesAssetsOnSite('https://shotviva.com/assets/')).toBe(true)
    expect(servesAssetsOnSite(R2)).toBe(false)
    expect(schema.safeParse({ NEXT_PUBLIC_ASSETS_BASE_URL: 'https://shotviva.com/assets' }).success).toBe(false)
    expect(schema.safeParse({ NEXT_PUBLIC_ASSETS_BASE_URL: 'https://shotviva.com/assets', R2_PUBLIC_ORIGIN: R2 }).success).toBe(true)
    expect(schema.safeParse({ NEXT_PUBLIC_ASSETS_BASE_URL: R2 }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(true)
    // Only https origins are accepted for the bucket.
    expect(schema.safeParse({ R2_PUBLIC_ORIGIN: 'http://example.com' }).success).toBe(false)
  })

  it('lets next/image load covers from the configured base', () => {
    expect(assetsRemotePatterns('https://shotviva.com/assets')).toEqual([{ protocol: 'https', hostname: 'shotviva.com', pathname: '/assets/**' }])
    expect(assetsRemotePatterns(R2)).toEqual([{ protocol: 'https', hostname: 'pub-0123456789abcdef.r2.dev', pathname: '/**' }])
    expect(assetsRemotePatterns(undefined)).toEqual([])
  })
})
