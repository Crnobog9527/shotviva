import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MANIFEST_PATHS, rootMetadata, startupImages, webManifest } from '@/core/seo'
import { site } from '@/site/site.config'

import { GET as enManifest } from './manifest.webmanifest/route'
import { GET as zhManifest } from './manifest.zh.webmanifest/route'

const inPublic = (path: string) => existsSync(join(process.cwd(), 'public', path))

// T58: every icon the manifest lists must ship in public/, or browsers drop it silently.
describe('web app manifest', () => {
  it('lists the 192 and 512 "S." icons that exist in public/', () => {
    const { icons = [], name } = webManifest(site)
    expect(name).toBe('Shotviva')
    expect(icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512'])
    for (const icon of icons) expect(inPublic(icon.src)).toBe(true)
  })

  // T65: a /zh page added to the home screen opens in Chinese; English stays at /.
  it('serves one manifest per language, the Chinese one starting at /zh', async () => {
    const en = await enManifest().json()
    const zh = await zhManifest().json()
    expect(en).toMatchObject({ start_url: '/', lang: 'en', display: 'browser' })
    expect(zh).toMatchObject({ start_url: '/zh', lang: 'zh-Hans', description: 'AI 影棚', display: 'browser' })
    expect(enManifest().headers.get('content-type')).toContain('application/manifest+json')
  })

  it('links the manifest of the page language from the root metadata', () => {
    expect(rootMetadata(site, 'en').manifest).toBe(MANIFEST_PATHS.en)
    expect(rootMetadata(site, 'zh').manifest).toBe(MANIFEST_PATHS.zh)
  })
})

// T65: iOS shows the startup image matching the device's exact screen; a missing file is a black
// screen again.
describe('iOS startup images', () => {
  it('ship in public/ for every listed screen, each with an exact portrait media query', () => {
    const images = startupImages()
    expect(images.length).toBeGreaterThanOrEqual(10)
    for (const image of images) {
      expect(inPublic(image.url)).toBe(true)
      expect(image.media).toMatch(/^\(device-width: \d+px\) and \(device-height: \d+px\) and \(-webkit-device-pixel-ratio: [23]\) and \(orientation: portrait\)$/)
    }
    expect(rootMetadata(site).appleWebApp).toMatchObject({ startupImage: images })
  })
})
