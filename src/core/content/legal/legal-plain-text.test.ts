import { describe, expect, it } from 'vitest'

import { defineLegalPage } from './legal-page'
import { legalPlainText } from './legal-plain-text'

// T82: the refund policy quoted in dispute evidence, links made absolute.
const page = defineLegalPage({
  path: '/refund-policy',
  title: 't',
  description: 'd',
  h1: 'Refund Policy',
  label: 'Refund Policy',
  lastUpdated: '2026-11-08',
  intro: ['Intro.'],
  sections: [
    {
      id: 'how',
      heading: 'How to request a refund',
      blocks: [['Open ', { href: '/account?help=new', label: 'Help & feedback' }, ' or email ', { href: 'mailto:a@b.test', label: 'a@b.test' }, '.'], { list: ['One;', 'Two.'] }, { lines: ['Line 1', 'Line 2'] }],
    },
  ],
})

describe('legalPlainText', () => {
  it('keeps headings, lists and links, with absolute URLs and bare email addresses', () => {
    expect(legalPlainText(page, 'https://shotviva.com')).toBe(
      [
        'Refund Policy (https://shotviva.com/refund-policy, last updated 2026-11-08)',
        'Intro.',
        'How to request a refund\nOpen Help & feedback (https://shotviva.com/account?help=new) or email a@b.test.\n- One;\n- Two.\nLine 1\nLine 2',
      ].join('\n\n'),
    )
  })
})
