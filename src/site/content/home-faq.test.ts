import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FaqSection, type FaqItem } from '@/core/content'
import type { Locale } from '@/core/i18n'
import { TranslatedPathsProvider } from '@/core/i18n/ui'
import { faqPageLd } from '@/core/seo'

import { loadMessages } from '../i18n/messages'
import { site } from '../site.config'
import { homePage } from './home'
import { creditFrom, freeImagesLabel, fromCredits, perCredit, planFrom, tierList, tierPixels, usd } from './offer'
import { pricingPage } from './pricing'
import { zhHomePage } from './zh/home'
import { zhFreeImages, zhFromCredits, zhTierPixels } from './zh/offer'

// 建站规格 G6 (nine questions, A–I) and 「首页 FAQ 的写法」; T35.
const G6_QUESTIONS = [
  'What is image to image AI?',
  'Is image to image AI free?',
  "Does image to image AI keep my photo's subject the same?",
  'How is image to image AI different from an AI image generator?',
  'Can I use the photos commercially?',
  'Do I need to write prompts?',
  'What sizes and formats can I export?',
  'Can I use Shotviva on my phone?',
  'What is Shotviva?',
]

const A_FIRST_SENTENCE =
  'Shotviva is an image to image AI tool that gives a photo you already have a new look while the subject stays as shot — in 3 steps: upload one phone photo, pick a template, choose Standard, HD or Max.'

const firstSentence = (text: string) => text.split(/(?<=[.。])\s*/)[0] ?? text
const byLetter = (faq: readonly FaqItem[], letter: string) => faq['ABCDEFGHI'.indexOf(letter)] as FaqItem

async function render(faq: readonly FaqItem[], locale: Locale) {
  const section = createElement(FaqSection, { faq, heading: 'FAQ' })
  const paths: ComponentProps<typeof TranslatedPathsProvider> = { paths: site.locales.zhPaths, children: section }
  const provider: ComponentProps<typeof NextIntlClientProvider> = {
    locale,
    messages: await loadMessages(locale),
    children: createElement(TranslatedPathsProvider, paths),
  }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
}

const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')

describe('home FAQ, English (建站规格 G6)', () => {
  const faq: readonly FaqItem[] = homePage.faq

  it('asks the nine G6 questions in order, the brand question last', () => {
    expect(faq.map((item) => item.question)).toEqual(G6_QUESTIONS)
    expect(homePage.headings.faq).toBe('Image to Image AI FAQ')
  })

  it('opens A with the fixed sentence that names the brand and the keyword together', () => {
    expect(byLetter(faq, 'A').answer.startsWith(A_FIRST_SENTENCE)).toBe(true)
  })

  it('names Shotviva or image to image AI in the first sentence of every answer', () => {
    for (const item of faq) {
      expect(firstSentence(item.answer), item.question).toMatch(/^(Shotviva|Image to image AI)\b/)
    }
  })

  it('reads every number from the config, the same as /pricing', () => {
    const b = byLetter(faq, 'B').answer
    expect(b).toContain(freeImagesLabel)
    expect(b).toContain(fromCredits)
    expect(planFrom).toBeDefined()
    expect(b).toContain(`${usd(planFrom?.priceUsd ?? 0)} a month for ${planFrom?.credits} credits`)
    expect(b).toContain(`as little as ${creditFrom}`)
    expect(creditFrom).toBe(perCredit('max_yearly'))
    expect(JSON.stringify(pricingPage.tables)).toContain(creditFrom)
    expect(byLetter(faq, 'A').answer).toContain(tierList)
    expect(byLetter(faq, 'G').answer).toContain(`PNG in 3 sizes: ${tierPixels}`)
    expect(byLetter(faq, 'I').answer).toContain(freeImagesLabel)
  })

  it('promises only what exists: no JPG export, no sizes we do not make, no home-screen install', () => {
    const text = faq.map((item) => item.answer).join(' ')
    expect(byLetter(faq, 'G').answer).not.toMatch(/JPG|1080/)
    expect(text).not.toMatch(/home screen|gallery wall|showcase|portion/i)
    expect(byLetter(faq, 'E').answer).toMatch(/not private/)
  })

  it('links D and F to the generator and follows D with the four-row comparison', () => {
    expect(byLetter(faq, 'D').link?.href).toBe('/image-to-image-generator')
    expect(byLetter(faq, 'F').link?.href).toBe('/image-to-image-generator')
    expect(byLetter(faq, 'D').table?.rows.map(([label]) => label)).toEqual(['Starts from', 'Subject', 'Best for', 'Risk'])
    expect(faq.filter((item) => item.table)).toHaveLength(1)
  })

  it('renders nine <h3> questions, every answer and the table in the server HTML', async () => {
    const html = decode(await render(faq, 'en'))
    expect(html.match(/<h3>/g)).toHaveLength(9)
    for (const item of faq) {
      expect(html).toContain(`<h3>${item.question}</h3>`)
      expect(html).toContain(`<p>${item.answer}`)
    }
    expect(html).toContain('<caption>Image to image AI vs an AI image generator</caption>')
    expect(html.match(/<th scope="row">/g)).toHaveLength(4)
    expect(html.indexOf('<table>')).toBeGreaterThan(html.indexOf(byLetter(faq, 'D').answer))
    expect(html.indexOf('<table>')).toBeLessThan(html.indexOf(byLetter(faq, 'E').question))
  })

  it('puts the same questions and answers in the FAQPage structured data, without the table', () => {
    const ld = faqPageLd(faq)
    const entities = ld.mainEntity as { name: string; acceptedAnswer: { text: string } }[]
    expect(entities.map((entity) => [entity.name, entity.acceptedAnswer.text])).toEqual(
      faq.map((item) => [item.question, item.answer]),
    )
    expect(JSON.stringify(ld)).not.toContain('Starts from')
  })
})

describe('home FAQ, Chinese (建站规格 G6, G13)', () => {
  const faq: readonly FaqItem[] = zhHomePage.faq

  it('has the same nine questions in the same order, asked the Chinese way, the brand question last', () => {
    expect(faq).toHaveLength(9)
    expect(faq.at(-1)?.question).toBe('Shotviva 是什么？')
    expect(zhHomePage.headings.faq).toBe('AI改图常见问题')
  })

  it('opens A with the Chinese form of the fixed sentence', () => {
    expect(byLetter(faq, 'A').answer.startsWith('Shotviva 是一个 AI改图工具：把你已有的照片换个样子，主体保持原样，只要 3 步——')).toBe(true)
  })

  it('names Shotviva or AI改图 at the start of every answer', () => {
    for (const item of faq) expect(item.answer, item.question).toMatch(/^(Shotviva|AI改图)/)
  })

  it('uses the same numbers as the English FAQ and /zh/pricing', () => {
    expect(byLetter(faq, 'B').answer).toContain(zhFreeImages)
    expect(byLetter(faq, 'B').answer).toContain(zhFromCredits)
    expect(byLetter(faq, 'B').answer).toContain(`每个积分最低 ${creditFrom}`)
    expect(byLetter(faq, 'G').answer).toContain(`PNG，分 3 档：${zhTierPixels}`)
    expect(byLetter(faq, 'D').table?.rows).toHaveLength(4)
    expect(byLetter(faq, 'D').link?.href).toBe('/image-to-image-generator')
    expect(byLetter(faq, 'F').link?.href).toBe('/image-to-image-generator')
  })

  it('renders nine <h3> and the comparison table, linking to the Chinese generator page', async () => {
    const html = decode(await render(faq, 'zh'))
    expect(html.match(/<h3>/g)).toHaveLength(9)
    expect(html).toContain('<caption>AI改图和 AI 生图对比</caption>')
    expect(html).toContain('href="/zh/image-to-image-generator"')
    expect(html).toContain('去描述它。<a href="/zh/image-to-image-generator"')
  })
})
