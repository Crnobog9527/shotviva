import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import jsQR from 'jsqr'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { pasteUserQr, readUserQr } from './qr-paste'
import { fallbackBox, findPlaceholder, isPlaceholderPixel } from './qr-placeholder'

const FIXTURE = readFileSync(join(__dirname, 'fixtures/qr-fixture.png'))
const CREAM = { r: 250, g: 244, b: 232 }

// A 720×1440 poster (1K at 1:2) with, optionally, the model's magenta square in the footer: a
// slightly off colour and a blurred edge, as an image model draws it.
async function poster(square?: { left: number; top: number; side: number }) {
  const layers = square ? [{
    input: await sharp({ create: { width: square.side, height: square.side, channels: 3, background: { r: 246, g: 12, b: 238 } } }).png().toBuffer(),
    left: square.left, top: square.top,
  }] : []
  return sharp({ create: { width: 720, height: 1440, channels: 3, background: CREAM } }).composite(layers).blur(0.8).png().toBuffer()
}

async function readAll(bytes: Buffer) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { code: jsQR(new Uint8ClampedArray(data), info.width, info.height), data, info }
}

function magentaLeft(raw: Buffer, channels: number): number {
  let count = 0
  for (let i = 0; i < raw.length; i += channels) if (isPlaceholderPixel(raw[i]!, raw[i + 1]!, raw[i + 2]!)) count++
  return count
}

describe('readUserQr', () => {
  it('reads an uploaded code and cuts it out of a bigger picture', async () => {
    const card = await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 40, g: 120, b: 60 } } })
      .composite([{ input: await sharp(FIXTURE).resize(500).png().toBuffer(), left: 200, top: 500 }]).png().toBuffer()
    const qr = await readUserQr(card)
    expect(qr?.data).toBe('SHOTVIVA-QR-FIXTURE')
    const { width = 0 } = await sharp(qr!.png).metadata()
    expect(width).toBeGreaterThan(400)
    expect(width).toBeLessThan(560)
  })

  it('returns null for a picture without a code', async () => {
    expect(await readUserQr(await poster())).toBeNull()
  })
})

describe('pasteUserQr', () => {
  const spot = { x: 0.05, y: 0.86, size: 0.12 }

  it('pastes into the magenta square, leaves no magenta and reads back', async () => {
    const qr = (await readUserQr(FIXTURE))!
    const result = await pasteUserQr(await poster({ left: 60, top: 1230, side: 110 }), qr, spot)
    expect(result.placed).toBe('placeholder')
    const { code, data, info } = await readAll(result.bytes)
    expect(code?.data).toBe('SHOTVIVA-QR-FIXTURE')
    expect(code!.location.topLeftCorner.y).toBeGreaterThan(1200)
    expect(magentaLeft(data, info.channels)).toBe(0)
  })

  it('falls back to the template spot when the model drew no square', async () => {
    const qr = (await readUserQr(FIXTURE))!
    const result = await pasteUserQr(await poster(), qr, spot)
    expect(result.placed).toBe('fallback')
    const { code } = await readAll(result.bytes)
    expect(code?.data).toBe('SHOTVIVA-QR-FIXTURE')
    expect(code!.location.topLeftCorner.x).toBeLessThan(140)
  })

  it('refuses when there is neither a square nor a spot', async () => {
    const qr = (await readUserQr(FIXTURE))!
    await expect(pasteUserQr(await poster(), qr, null)).rejects.toThrow()
  })
})

describe('findPlaceholder', () => {
  const raster = (width: number, height: number, paint: (x: number, y: number) => boolean) => {
    const data = new Uint8Array(width * height * 3).fill(240)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (paint(x, y)) data.set([255, 0, 255], (y * width + x) * 3)
    }
    return { data, width, height, channels: 3 }
  }

  it('finds a filled square', () => {
    expect(findPlaceholder(raster(100, 200, (x, y) => x >= 10 && x < 30 && y >= 150 && y < 170))).toEqual({ left: 10, top: 150, width: 20, height: 20 })
  })

  it('ignores a long bar, a thin outline and specks', () => {
    expect(findPlaceholder(raster(100, 200, (x, y) => y >= 100 && y < 110))).toBeNull()
    expect(findPlaceholder(raster(100, 200, (x, y) => x >= 10 && x < 40 && y >= 10 && y < 40 && (x < 12 || x > 37 || y < 12 || y > 37)))).toBeNull()
    expect(findPlaceholder(raster(100, 200, (x, y) => x === 50 && y === 50))).toBeNull()
  })
})

describe('fallbackBox', () => {
  it('turns the template spot into a square inside the poster', () => {
    expect(fallbackBox({ x: 0.05, y: 0.86, size: 0.12 }, 1440, 2880)).toEqual({ left: 72, top: 2477, width: 173, height: 173 })
    expect(fallbackBox({ x: 0.95, y: 0.99, size: 0.2 }, 100, 100)).toEqual({ left: 80, top: 80, width: 20, height: 20 })
  })
})
