import { describe, expect, it } from 'vitest'

import { demoCard } from './guide-demo-card'

const copy = { description: 'A promo poster', author: 'M***', template: 'Half Price Poster' }

describe('the teaching sheet example card', () => {
  it('is a live wish at 51 votes, then 52 with the vote in', () => {
    expect(demoCard('say', false, copy)).toMatchObject({ status: 'live', votesCount: 51, voted: false, template: null })
    expect(demoCard('vote', false, copy)).toMatchObject({ status: 'live', votesCount: 51, voted: false })
    expect(demoCard('vote', true, copy)).toMatchObject({ status: 'live', votesCount: 52, voted: true })
  })

  it('ships as a template, keeping the vote', () => {
    expect(demoCard('ship', false, copy)).toMatchObject({
      status: 'shipped',
      votesCount: 52,
      template: { name: 'Half Price Poster' },
      imageUrls: ['/home/wish-tea-light.webp'],
    })
  })
})
