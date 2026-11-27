import { describe, expect, it } from 'vitest'

import { nextReadyScene, trackFailed, trackLoaded, trackPick, type PickTrack } from './use-scene-rotation'

describe('hero scene rotation', () => {
  it('skips scenes that are loading or failed instead of stalling before them', () => {
    const ready = new Set([0, 2])
    expect(nextReadyScene(0, 3, (index) => ready.has(index))).toBe(2)
    expect(nextReadyScene(2, 3, (index) => ready.has(index))).toBe(0)
    // Nothing else ready: stay.
    expect(nextReadyScene(0, 3, (index) => index === 0)).toBe(0)
  })

  it('falls back to the last scene shown whole when overlapping picks fail, never to one still loading', () => {
    // A (0) shown, then B (1) and C (2) picked while both load.
    let track: PickTrack = { waiting: -1, settled: 0 }
    track = trackPick(track, 1, false)
    track = trackPick(track, 2, false)
    const failedC = trackFailed(track, 2)
    expect(failedC.fallback).toBe(0)
    // B finishing later does not take over: nothing waits on it any more.
    expect(trackLoaded(failedC.track, 1, true)).toEqual({ waiting: -1, settled: 0 })
  })

  it('settles on a pick once its pictures load, so a later failed pick goes back there', () => {
    let track: PickTrack = { waiting: -1, settled: 0 }
    track = trackPick(track, 1, false)
    track = trackLoaded(track, 1, true)
    expect(track).toEqual({ waiting: -1, settled: 1 })
    track = trackPick(track, 2, false)
    expect(trackFailed(track, 2).fallback).toBe(1)
    // A failure nobody waits on changes nothing.
    expect(trackFailed({ waiting: -1, settled: 1 }, 2)).toEqual({ track: { waiting: -1, settled: 1 }, fallback: null })
  })
})
