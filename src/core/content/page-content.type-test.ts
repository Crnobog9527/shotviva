// Compile-time contract for ContentPage: `pnpm typecheck` fails if any block can be
// left out or under-filled. Each @ts-expect-error must stay an error.
import { defineContentPage, type ContentPage } from './page-content'

const img = { src: '/a.svg', alt: 'a', width: 1, height: 1 }
const fact = { label: 'l', value: 'v' }
const faq = { question: 'q', answer: 'a' }
const link = { href: '/x', anchor: 'x' } as const
const line = { label: 'l', value: 'v' }

const complete = {
  slug: 'x',
  keyword: 'k',
  title: 't',
  description: 'd',
  h1: 'h',
  answerBlock: 'a',
  label: 'x',
  hero: { before: img, after: img, caption: 'c', cta: { label: 'go', href: '/' } },
  facts: [fact, fact, fact],
  costBills: {
    heading: 'h',
    intro: 'i',
    photographer: { title: 't', total: { amount: 'a', when: 'w' }, lines: [line, line], fine: 'f' },
    site: { title: 't', total: { amount: 'a', when: 'w' }, lines: [line, line], fine: 'f' },
  },
  landing: { generatorTemplate: 'x', factsNote: 'n' },
  faq: [faq, faq, faq],
  related: [link, link],
} satisfies ContentPage

defineContentPage(complete)

type Complete = typeof complete
// Type-only values: this file is checked by tsc and never executed.

declare const noHero: Omit<Complete, 'hero'>
// @ts-expect-error block ① (hero) is required
defineContentPage(noHero)

declare const noFacts: Omit<Complete, 'facts'>
// @ts-expect-error block ② (facts) is required
defineContentPage(noFacts)

declare const noCost: Omit<Complete, 'costBills'>
// @ts-expect-error block ③ (the two bills) is required
defineContentPage(noCost)

declare const noFaq: Omit<Complete, 'faq'>
// @ts-expect-error block ④ (FAQ) is required
defineContentPage(noFaq)

declare const noRelated: Omit<Complete, 'related'>
// @ts-expect-error block ⑤ (related links) is required
defineContentPage(noRelated)

declare const noAnswer: Omit<Complete, 'answerBlock'>
// @ts-expect-error the direct answer is required
defineContentPage(noAnswer)

// @ts-expect-error at least three facts
defineContentPage({ ...complete, facts: [fact, fact] })

// @ts-expect-error FAQ needs at least three questions
defineContentPage({ ...complete, faq: [faq, faq] })

// @ts-expect-error FAQ allows at most five questions
defineContentPage({ ...complete, faq: [faq, faq, faq, faq, faq, faq] })

// @ts-expect-error at least two related links
defineContentPage({ ...complete, related: [link] })
