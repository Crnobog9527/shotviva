import { readFileSync } from 'node:fs'

import sharp, { type Sharp } from 'sharp'
import { describe, expect, it } from 'vitest'

import { protectImage } from './protect'
import { decodePayload, encodePayload, prefixRange } from './tracking-code'
import { readTrackingMark } from './tracking-decode'

const JOB = '3f2a9c1e-7b4d-4e21-9a0f-5c6d7e8f9a0b'
const PREFIX = '3f2a9c1e7b4d'
const photo = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../public/cases/${name}`, import.meta.url)))

async function served(name: string) {
  return protectImage(photo(name), { jobId: JOB, size: { kind: 'cap' }, format: 'jpeg', background: 'white' })
}

const jpeg = async (image: Sharp, quality = 75) => new Uint8Array(await image.jpeg({ quality }).toBuffer())

describe('tracking payload', () => {
  it('round-trips the first 48 bits of the id and rejects a flipped bit', () => {
    const bits = encodePayload(JOB)
    expect(bits).toHaveLength(64)
    expect(decodePayload(bits)).toBe(PREFIX)
    expect(decodePayload(bits.map((bit, i) => (i === 5 ? bit ^ 1 : bit)))).toBeNull()
  })

  it('maps a prefix to the uuid range the decoder reads', () => {
    expect(prefixRange(PREFIX)).toEqual({ from: '3f2a9c1e-7b4d-0000-0000-000000000000', to: '3f2a9c1e-7b4d-ffff-ffff-ffffffffffff' })
  })
})

// Best effort (tracking-decode.ts): what a free copy usually goes through after it leaves.
describe('tracking mark round trip', { timeout: 60_000 }, () => {
  it('reads the id from the copy as served, dark and light pictures', async () => {
    for (const name of ['menu-fish-dark.webp', 'drink-after.webp']) {
      expect((await readTrackingMark(await served(name)))?.prefix).toBe(PREFIX)
    }
  })

  it('survives a JPEG re-save at quality 70', async () => {
    const copy = await served('drink-after.webp')
    expect((await readTrackingMark(await jpeg(sharp(copy), 70)))?.prefix).toBe(PREFIX)
  })

  it('survives resizing down and up, then a JPEG save', async () => {
    const copy = await served('menu-fish-dark.webp')
    const { width = 0 } = await sharp(copy).metadata()
    for (const factor of [0.62, 1.37]) {
      const resized = await jpeg(sharp(copy).resize(Math.round(width * factor)), 80)
      expect((await readTrackingMark(resized))?.prefix, `×${factor}`).toBe(PREFIX)
    }
  })

  it('survives cropping away the label and most of the picture', async () => {
    const copy = await served('drink-after.webp')
    const { width = 0, height = 0 } = await sharp(copy).metadata()
    const cropped = await jpeg(sharp(copy).extract({ left: 37, top: 101, width: Math.round(width * 0.55), height: Math.round(height * 0.5) }), 80)
    expect((await readTrackingMark(cropped))?.prefix).toBe(PREFIX)
  })

  it('survives a crop and a resize together', async () => {
    const copy = await served('menu-fish-dark.webp')
    const { width = 0, height = 0 } = await sharp(copy).metadata()
    const piece = sharp(copy).extract({ left: 90, top: 213, width: Math.round(width * 0.7), height: Math.round(height * 0.6) })
    const shrunk = await jpeg(sharp(await piece.toBuffer()).resize(Math.round(width * 0.7 * 0.8)), 80)
    expect((await readTrackingMark(shrunk))?.prefix).toBe(PREFIX)
  })

  it('reports nothing for a picture that never had the mark', async () => {
    expect(await readTrackingMark(await jpeg(sharp(photo('drink-after.webp')), 85))).toBeNull()
  })
})
