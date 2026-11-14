// Writes the stub's model output (1024x1024 PNG, about the size of a real 1K result) and the
// photo k6 uploads (a 1600px JPEG) to loadtest/.stub/. Synthetic pixels, no real photos.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '.stub')
mkdirSync(dir, { recursive: true })
function noise(size, seed) {
  const pixels = Buffer.alloc(size * size * 3)
  let x = seed
  for (let i = 0; i < pixels.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; pixels[i] = ((i / 3) % size) / size * 200 + (x % 56) }
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
}
await noise(1024, 7).png().toFile(join(dir, 'output.png'))
await noise(1600, 11).jpeg({ quality: 85 }).toFile(join(dir, 'input.jpg'))
console.log('wrote', dir)
