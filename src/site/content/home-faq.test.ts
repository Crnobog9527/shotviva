import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { usdPerHundredCredits } from '@/core/config'
import { FaqSection, type FaqItem } from '@/core/content'
import type { Locale } from '@/core/i18n'
import { TranslatedPathsProvider } from '@/core/i18n/ui'
import { faqPageLd } from '@/core/seo'

import { loadMessages } from '../i18n/messages'
import { site } from '../site.config'
import { homePage } from './home'
import { hundredCreditsFrom, freeImagesLabel, fromCredits, perHundredCredits, planFrom, product, tierList, tierPixels, usd } from './offer'
import { zhHomePage } from './zh/home'
import { zhFromCredits, zhTierPixels } from './zh/offer'

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
  'Shotviva is an image to image AI tool that gives a photo you already have a new look while the subject stays as shot — in 3 steps: upload one phone photo, pick a template, choose 1K, 2K or 4K.'

const firstSentence = (text: string) => text.split(/(?<=[.。])\s*/)[0] ?? text
// G6 letters by position: English asks A–I in order; /zh moves the brand question I to the front
// (建站规格 G6 exception, Owner 2026-11-08).
const EN_ORDER = 'ABCDEFGHI'
const ZH_ORDER = 'IABCDEFGH'
const byLetterIn = (faq: readonly FaqItem[], letter: string, order: string) => faq[order.indexOf(letter)] as FaqItem
const byLetter = (faq: readonly FaqItem[], letter: string) => byLetterIn(faq, letter, EN_ORDER)

async function render(faq: readonly FaqItem[], locale: Locale, variant: 'list' | 'accordion' = 'list') {
  const section = createElement(FaqSection, { faq, heading: 'FAQ', variant })
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
    // SEO PATCH v4.1: the free credits, how photos are charged (on the Generate button, never a
    // count here), and where paid plans start.
    expect(b).toBe(`Shotviva gives new accounts 100 credits to try a template. Each photo uses credits based on template and size, shown on the Generate button. Free photos are public and watermarked; paid plans start at ${usd(planFrom?.priceUsd ?? 0)}/month.`)
    expect(b).not.toContain(fromCredits)
    expect(planFrom).toBeDefined()
    expect(hundredCreditsFrom).toBe(perHundredCredits('max_yearly'))
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

describe('home FAQ accordion (T36)', () => {
  it('keeps every question and answer in the HTML as an accordion, the first one open (G11, T36)', async () => {
    const faq: readonly FaqItem[] = homePage.faq
    const html = decode(await render(faq, 'en', 'accordion'))
    expect(html.match(/<details/g)).toHaveLength(9)
    expect(html.match(/<details open="">/g)).toHaveLength(1)
    for (const item of faq) {
      expect(html).toContain(`<h3>${item.question}</h3>`)
      expect(html).toContain(`<p>${item.answer}`)
    }
    expect(html.indexOf('<details open="">')).toBeLessThan(html.indexOf(byLetter(faq, 'A').question))
    expect(html).toContain('<caption>Image to image AI vs an AI image generator</caption>')
  })
})

describe('home FAQ, Chinese (建站规格 G6, G13)', () => {
  const faq: readonly FaqItem[] = zhHomePage.faq
  const byLetter = (items: readonly FaqItem[], letter: string) => byLetterIn(items, letter, ZH_ORDER)

  it('asks the brand question first, then A–H in the G6 order, then the two G9 questions', () => {
    expect(faq).toHaveLength(11)
    expect(faq[0]?.question).toBe('Shotviva 是什么？')
    expect(byLetter(faq, 'A').question).toBe('怎么把自己的照片变成 AI 图？')
    expect(byLetter(faq, 'H').question).toBe('手机上能用吗？要下载软件吗？')
    expect(faq[8]).toBe(byLetter(faq, 'H'))
    expect(faq.slice(9).map((item) => item.question)).toEqual(['AI修图和AI改图有什么区别？', '白底图能不能直接生成？'])
    expect(zhHomePage.headings.faq).toBe('AI改图常见问题')
  })

  it('opens A with the Chinese form of the fixed sentence', () => {
    expect(byLetter(faq, 'A').answer.startsWith('Shotviva 是一个 AI改图工具：把你已有的照片换个样子，主体保持原样，只要 3 步——')).toBe(true)
  })

  it('names Shotviva or AI改图 at the start of every answer', () => {
    for (const item of faq) expect(item.answer, item.question).toMatch(/^(Shotviva|AI改图)/)
  })

  it('uses the same numbers as the English FAQ and /zh/pricing', () => {
    expect(byLetter(faq, 'B').answer).toContain('给新账号 100 个积分，用来试一个模板')
    expect(byLetter(faq, 'B').answer).toContain('生成按钮上会显示')
    expect(byLetter(faq, 'B').answer).not.toContain(zhFromCredits)
    expect(byLetter(faq, 'B').answer).toContain(`付费套餐每月 ${usd(planFrom?.priceUsd ?? 0)} 起`)
    expect(byLetter(faq, 'G').answer).toContain(`PNG，分 3 档：${zhTierPixels}`)
    expect(byLetter(faq, 'D').table?.rows).toHaveLength(4)
    expect(byLetter(faq, 'D').link?.href).toBe('/image-to-image-generator')
    expect(byLetter(faq, 'F').link?.href).toBe('/image-to-image-generator')
  })

  it('renders nine <h3> and the comparison table, linking to the Chinese generator page', async () => {
    const html = decode(await render(faq, 'zh'))
    expect(html.match(/<h3>/g)).toHaveLength(11)
    expect(html).toContain('<caption>AI改图和 AI 生图对比</caption>')
    expect(html).toContain('href="/zh/image-to-image-generator"')
    expect(html).toContain('去描述它。<a href="/zh/image-to-image-generator"')
  })

  it('opens the brand question by default and keeps every question and answer in the HTML', async () => {
    const html = decode(await render(faq, 'zh', 'accordion'))
    expect(html.match(/<details/g)).toHaveLength(11)
    expect(html.match(/<details open="">/g)).toHaveLength(1)
    const open = html.indexOf('<details open="">')
    expect(open).toBeLessThan(html.indexOf('<h3>Shotviva 是什么？</h3>'))
    expect(html.indexOf('<details', open + 1)).toBeGreaterThan(html.indexOf('<h3>Shotviva 是什么？</h3>'))
    for (const item of faq) {
      expect(html).toContain(`<h3>${item.question}</h3>`)
      expect(html).toContain(`<p>${item.answer}`)
    }
  })

  it('lists the FAQPage structured data in the page order, the brand question first', () => {
    const entities = faqPageLd(faq).mainEntity as { name: string }[]
    expect(entities.map((entity) => entity.name)).toEqual(faq.map((item) => item.question))
    expect(entities[0]?.name).toBe('Shotviva 是什么？')
  })
})

describe('home FAQ and /pricing agree', () => {
  it('quotes the same lowest price per 100 credits that the /pricing Max card prints', () => {
    const maxYearly = product('max_yearly')
    expect(maxYearly && `$${usdPerHundredCredits(maxYearly).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).toBe(hundredCreditsFrom)
  })
})
