import { describe, expect, it } from 'vitest'

import { homeCta, type HomeViewer } from './home-cta'

const viewer = (free: number, paid: number, limit = 1): HomeViewer => ({ balance: { free, paid }, concurrency: { limit, runningIds: [] }, favoriteIds: [] })
const base = { cost: 2, running: 0, needsCopy: false }

// DESIGN §6.9 item 9: the home bar charges the same way as the workspace.
describe('homeCta', () => {
  it('asks a signed-out visitor for a photo, then for an account; never for credits', () => {
    expect(homeCta({ ...base, viewer: null, photo: 'none' })).toEqual({ kind: 'pick-photo', cost: 2 })
    expect(homeCta({ ...base, viewer: null, photo: 'ready' })).toEqual({ kind: 'sign-up', cost: 2 })
  })

  it('allows an explicitly empty optional photo and still waits for a chosen upload', () => {
    const optional = { ...base, photoOptional: true, viewer: viewer(6, 0) }
    expect(homeCta({ ...optional, photo: 'none' })).toMatchObject({ kind: 'generate', pool: 'free', count: 1 })
    expect(homeCta({ ...optional, viewer: null, photo: 'none' })).toEqual({ kind: 'sign-up', cost: 2 })
    expect(homeCta({ ...optional, photo: 'uploading' })).toEqual({ kind: 'uploading' })
    expect(homeCta({ ...optional, photo: 'error' })).toEqual({ kind: 'pick-photo', cost: 2 })
    expect(homeCta({ ...optional, photo: 'none', needsCopy: true })).toEqual({ kind: 'needs-copy' })
  })

  it('uses the free credits of a new account like the workspace does', () => {
    expect(homeCta({ ...base, viewer: viewer(6, 0), photo: 'ready' })).toMatchObject({ kind: 'generate', pool: 'free', cost: 2 })
  })

  it('opens the paywall with the shortfall when the balance is too low, before asking for a photo', () => {
    expect(homeCta({ ...base, viewer: viewer(0, 1), photo: 'none' })).toMatchObject({ kind: 'get-credits', needed: 1 })
  })

  it('asks for a photo, waits for the upload, then generates', () => {
    expect(homeCta({ ...base, viewer: viewer(0, 10), photo: 'none' })).toEqual({ kind: 'pick-photo', cost: 2 })
    expect(homeCta({ ...base, viewer: viewer(0, 10), photo: 'uploading' })).toEqual({ kind: 'uploading' })
    expect(homeCta({ ...base, viewer: viewer(0, 10), photo: 'ready' })).toMatchObject({ kind: 'generate', pool: 'paid' })
  })

  it('waits when the account already has as many photos developing as its tier allows', () => {
    expect(homeCta({ ...base, viewer: viewer(0, 10), photo: 'ready', running: 1 })).toEqual({ kind: 'wait', limit: 1 })
  })

  it('sends templates that need text to the workspace, and says so when nothing is live', () => {
    expect(homeCta({ ...base, viewer: viewer(0, 10), photo: 'ready', needsCopy: true })).toEqual({ kind: 'needs-copy' })
    expect(homeCta({ ...base, cost: null, viewer: null, photo: 'none' })).toEqual({ kind: 'no-template' })
  })
})
