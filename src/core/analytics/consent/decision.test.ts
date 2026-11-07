import { describe, expect, it } from 'vitest'

import { barWanted, isReplayBlockedPath, parseChoice, persistenceFor, replayAllowed, type Consent } from './decision'

const open: Consent = { regionOpen: true, choice: null }
const asked: Consent = { regionOpen: false, choice: null }

describe('persistence by region and answer (ARCHITECTURE §16.1, T70)', () => {
  it('uses cookies outside Europe without asking', () => {
    expect(persistenceFor(open)).toBe('localStorage+cookie')
    expect(barWanted(open)).toBe(false)
  })

  it('keeps a European visitor in memory and asks until they answer', () => {
    expect(persistenceFor(asked)).toBe('memory')
    expect(barWanted(asked)).toBe(true)
    expect(persistenceFor({ ...asked, choice: 'accepted' })).toBe('localStorage+cookie')
    expect(persistenceFor({ ...asked, choice: 'necessary' })).toBe('memory')
    expect(barWanted({ ...asked, choice: 'necessary' })).toBe(false)
  })

  it('honours "Necessary only" from anyone', () => {
    expect(persistenceFor({ ...open, choice: 'necessary' })).toBe('memory')
  })

  it('reads only the two stored answers', () => {
    expect(parseChoice('accepted')).toBe('accepted')
    expect(parseChoice('necessary')).toBe('necessary')
    expect(parseChoice('yes')).toBeNull()
    expect(parseChoice(null)).toBeNull()
  })
})

describe('replay is held off where it must be', () => {
  it('blocks /admin and /checkout in both languages', () => {
    for (const path of ['/admin', '/admin/users', '/zh/admin', '/checkout', '/checkout?session=1', '/zh/checkout', 'https://shotviva.com/checkout#x']) {
      expect(isReplayBlockedPath(path)).toBe(true)
    }
    for (const path of ['/', '/zh', '/pricing', '/generate', '/checkouts', '/photos/admin']) expect(isReplayBlockedPath(path)).toBe(false)
  })

  it('needs cookie consent too', () => {
    expect(replayAllowed(open, '/generate')).toBe(true)
    expect(replayAllowed(asked, '/generate')).toBe(false)
    expect(replayAllowed({ ...asked, choice: 'accepted' }, '/generate')).toBe(true)
    expect(replayAllowed(open, '/checkout')).toBe(false)
  })
})
