import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MANIFEST_PATHS, rootMetadata, startupImages, webManifest } from '@/core/seo'
import { MISANS_STYLESHEET } from '@/core/ui/misans-stylesheet'
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

// ARCHITECTURE §17: the MiSans files are the official, unmodified subsets; T65 changes how they
// load, never their bytes.
describe('MiSans files', () => {
  it('still match manifest.json byte for byte', () => {
    const dir = join(process.cwd(), 'public/fonts/misans')
    const files: { file: string; sha256: string; bytes: number }[] = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(files).toHaveLength(168)
    for (const { file, sha256, bytes } of files) {
      const data = readFileSync(join(dir, file))
      expect(data.length).toBe(bytes)
      expect(createHash('sha256').update(data).digest('hex')).toBe(sha256)
    }
  })

  // T67: headings only, so the linked stylesheet declares one weight (400) alone, copied verbatim.
  it('links a stylesheet that is exactly the 400 rules of the official one', () => {
    const dir = join(process.cwd(), 'public/fonts/misans')
    const rules = (css: string) => css.match(/@font-face\{[^}]*\}/g) ?? []
    const official = rules(readFileSync(join(dir, 'misans-4bf5d8a22f58eaab.css'), 'utf8')).filter((rule) => rule.includes('font-weight:400'))
    const linked = readFileSync(join(process.cwd(), 'public', MISANS_STYLESHEET), 'utf8')
    expect(rules(linked)).toEqual(official)
    expect(official).toHaveLength(56)
    const weights = new Map((JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { file: string; weight: string }[]).map((f) => [f.file, f.weight]))
    for (const rule of rules(linked)) expect(weights.get(rule.match(/url\("\.\/([^"]+)"\)/)?.[1] ?? '')).toBe('400')
  })
})
