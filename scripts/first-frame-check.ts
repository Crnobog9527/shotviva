/**
 * After `next build`: the hero's first frame is in each prerendered marketing page exactly once.
 *
 * The frame is about 10 KB of base64 that does not compress. It reaches the markup through a
 * server-side store (src/core/ui/first-frame-store.ts) instead of a prop, so that it is not
 * repeated in the page data. Two ways this can break without any test noticing: the frame goes
 * missing (the store was empty when the HTML was written, and the first screen waits for an image
 * request again), or it comes back as a prop (twice in every document).
 *
 *   pnpm build && pnpm check:first-frame
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGES = ['en.html', 'zh.html', 'en/image-to-image-generator.html', 'en/commercial-photography.html', 'en/ai-restaurant-menu.html']
const FRAME = /data:image\/avif;base64,[A-Za-z0-9+/=]{200,}/g

const problems: string[] = []
for (const page of PAGES) {
  const file = join(process.cwd(), '.next/server/app', page)
  if (!existsSync(file)) {
    problems.push(`${page}: no prerendered HTML (run next build first)`)
    continue
  }
  const html = readFileSync(file, 'utf8')
  const frames = html.match(FRAME) ?? []
  const inHero = /<img[^>]*class="mk-ff"[^>]*src="data:image\/avif;base64,|<img[^>]*src="data:image\/avif;base64,[^"]*"[^>]*class="mk-ff"/.test(html)
  if (!inHero) problems.push(`${page}: the hero's first frame is not in the markup`)
  for (const frame of new Set(frames)) {
    const count = frames.filter((other) => other === frame).length
    if (count > 1) problems.push(`${page}: a first frame (${(frame.length / 1024).toFixed(1)} KB) is in the document ${count} times`)
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`First frames: once in each of ${PAGES.length} prerendered pages.\n`)
