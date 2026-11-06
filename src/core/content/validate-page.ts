import type { Locale } from '../i18n/locales'
import type { ContentPage } from './page-content'

// Rules the type system cannot express (建站规格 R3, G1). Returns problems, empty when valid.
export const LIMITS = {
  titleMax: 60,
  descriptionMax: 155,
  answerMinWords: 40,
  answerMaxWords: 60,
} as const

// Chinese pages (建站规格 §6.1, T22 CSV): the title counts characters (letters, digits and
// punctuation count 1 each) and stays within 30; a description Google shows in full is about
// 80 characters; the direct answer is the same 40–60 English words read as roughly 70–150
// Chinese units (characters, plus Latin words).
export const ZH_LIMITS = {
  titleMax: 30,
  descriptionMax: 80,
  answerMinUnits: 70,
  answerMaxUnits: 150,
} as const

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// One per Han character, one per Latin word or number.
export function countChineseUnits(text: string): number {
  const han = text.match(/[一-鿿]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z0-9][A-Za-z0-9.'$%-]*/g)?.length ?? 0
  return han + latin
}

function startsWithKeyword(text: string, keyword: string): boolean {
  return text.trim().toLowerCase().startsWith(keyword.toLowerCase())
}

// The keyword must sit in the first half of the H1 (建站规格 R3), as one unbroken string
// (建站规格 §6.1 rule 7).
function keywordInFirstHalf(h1: string, keyword: string): boolean {
  const at = h1.toLowerCase().indexOf(keyword.toLowerCase())
  return at >= 0 && at <= h1.length / 2
}

function lengthProblems(page: ContentPage, locale: Locale): string[] {
  const problems: string[] = []
  const zh = locale === 'zh'
  const titleMax = zh ? ZH_LIMITS.titleMax : LIMITS.titleMax
  const descriptionMax = zh ? ZH_LIMITS.descriptionMax : LIMITS.descriptionMax
  if (page.title.length > titleMax) problems.push(`title is ${page.title.length} chars`)
  if (page.description.length > descriptionMax) problems.push(`description is ${page.description.length} chars`)
  const size = zh ? countChineseUnits(page.answerBlock) : countWords(page.answerBlock)
  const [min, max] = zh ? [ZH_LIMITS.answerMinUnits, ZH_LIMITS.answerMaxUnits] : [LIMITS.answerMinWords, LIMITS.answerMaxWords]
  if (size < min || size > max) problems.push(`answer block has ${size} ${zh ? 'units' : 'words'}`)
  return problems
}

export function validateContentPage(page: ContentPage, locale: Locale = 'en'): string[] {
  const problems = lengthProblems(page, locale)
  if (!startsWithKeyword(page.answerBlock, page.keyword)) {
    problems.push('answer block must start with the keyword')
  }
  if (!keywordInFirstHalf(page.h1, page.keyword)) {
    problems.push('keyword must appear in the first half of the H1')
  }
  return problems
}
