import type { ContentPage } from './page-content'

// Rules the type system cannot express (建站规格 R3, G1). Returns problems, empty when valid.
export const LIMITS = {
  titleMax: 60,
  descriptionMax: 155,
  answerMinWords: 40,
  answerMaxWords: 60,
} as const

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function startsWithKeyword(text: string, keyword: string): boolean {
  return text.trim().toLowerCase().startsWith(keyword.toLowerCase())
}

// The keyword must sit in the first half of the H1 (建站规格 R3).
function keywordInFirstHalf(h1: string, keyword: string): boolean {
  const at = h1.toLowerCase().indexOf(keyword.toLowerCase())
  return at >= 0 && at <= h1.length / 2
}

export function validateContentPage(page: ContentPage): string[] {
  const problems: string[] = []
  const words = countWords(page.answerBlock)
  if (page.title.length > LIMITS.titleMax) problems.push(`title is ${page.title.length} chars`)
  if (page.description.length > LIMITS.descriptionMax) {
    problems.push(`description is ${page.description.length} chars`)
  }
  if (words < LIMITS.answerMinWords || words > LIMITS.answerMaxWords) {
    problems.push(`answer block has ${words} words`)
  }
  if (!startsWithKeyword(page.answerBlock, page.keyword)) {
    problems.push('answer block must start with the keyword')
  }
  if (!keywordInFirstHalf(page.h1, page.keyword)) {
    problems.push('keyword must appear in the first half of the H1')
  }
  return problems
}
