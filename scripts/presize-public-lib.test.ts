import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

import { PRESIZED_WIDTHS } from '../src/core/presized'
import { planPublicCopies, writePublicCopies } from './presize-public-lib'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function publicDir() {
  const dir = mkdtempSync(join(tmpdir(), 'presize-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'home'), { recursive: true })
  mkdirSync(join(dir, 'og'), { recursive: true })
  const picture = await sharp({ create: { width: 500, height: 400, channels: 3, background: '#c96' } }).webp().toBuffer()
  writeFileSync(join(dir, 'home', 'hero.webp'), picture)
  writeFileSync(join(dir, 'home', 'logo.svg'), '<svg/>')
  writeFileSync(join(dir, 'og', 'default.webp'), picture)
  return dir
}

describe('pre-sizing public/', () => {
  it('plans every width of the pre-sized directories’ pictures only', async () => {
    const dir = await publicDir()
    const plan = planPublicCopies(dir)
    expect(plan).toHaveLength(PRESIZED_WIDTHS.length)
    expect(plan[0]?.target).toBe(join(dir, 'presized/v1/w128/home/hero.webp'))
  })

  it('writes the files the pages ask for, then keeps them until the picture changes', async () => {
    const dir = await publicDir()
    expect(await writePublicCopies(dir)).toEqual({ written: PRESIZED_WIDTHS.length, kept: 0 })
    expect((await sharp(join(dir, 'presized/v1/w256/home/hero.webp')).metadata()).width).toBe(256)
    expect((await sharp(join(dir, 'presized/v1/w1600/home/hero.webp')).metadata()).width).toBe(500)
    expect(await writePublicCopies(dir)).toEqual({ written: 0, kept: PRESIZED_WIDTHS.length })
    const later = new Date(statSync(join(dir, 'presized/v1/w128/home/hero.webp')).mtimeMs + 5000)
    utimesSync(join(dir, 'home', 'hero.webp'), later, later)
    expect((await writePublicCopies(dir)).written).toBe(PRESIZED_WIDTHS.length)
  })
})
