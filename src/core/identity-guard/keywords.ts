// Step one of ARCHITECTURE §5.1a: the obvious face-swap requests, caught without a model call.
// The list only holds phrases that mean "put another face or identity on this person" in every
// reading we could think of; anything that also reads as an expression, makeup or hair change
// ("把脸换成笑脸", "change her face to a smile") is left to the decision model. Edit freely: each
// pattern is one line, and keywords.test.ts holds the sentences it must and must not catch.

// Matched against the text lowercased, NFKC-folded (full-width letters, 換/换 stay distinct) and
// with runs of whitespace collapsed to one space.
const LATIN_PATTERNS: readonly RegExp[] = [
  /\bface[ -]?swap/,
  /\bswap(?:ping|ped)? (?:the |their |his |her |my |our |your |two |both )?(?:faces?|heads?)\b/,
  /\bhead[ -]?swap/,
  /\bdeep[ -]?fakes?\b/,
  /\breplace (?:the |his |her |their |my |our |your |this )?(?:face|head)s? (?:with|by)\b/,
  /\bput (?:my |his |her |their |our |your |this |the |a |another )?(?:own )?face (?:on|onto)\b/,
  /\bface (?:replacement|transplant)/,
  /\b(?:merge|blend|morph|combine|fuse) (?:our |their |the |two |both |these |those )?(?:two )?faces\b/,
]

// Matched against the same text with all whitespace removed, so "换 脸" is caught too.
const CJK_PATTERNS: readonly RegExp[] = [
  // Not 换脸色 (complexion), 换脸上的妆 (the makeup on the face), 换脸型 (face shape).
  /[换換](?:脸|臉)(?!色|上|部|颊|頰|蛋|型)/,
  /[换換][个個]?[头頭](?!发|發|饰|飾|巾|盔|像|型|纱|紗)/,
  /深度伪造|深度偽造/,
  // 把…脸换成 / 脸替换成 another person, but not an expression ("换成笑脸", "换成微笑").
  /(?:脸|臉)(?:替?[换換]|替换|替換)成(?!.{0,2}(?:笑|微笑|表情|开心|開心|严肃|嚴肅|惊讶|驚訝|哭|生气|生氣))/,
  // Faces of different people merged: 融合两个人的脸, 两张脸合成, 把我们的脸融合.
  /(?:融合|合成|合并|合併)(?:两|兩|二|俩|倆|多)?(?:个|個|张|張)?人?的?(?:脸|臉)|(?:脸|臉)部?(?:融合|合成|合并|合併)/,
  // 变成 / 换成 / 改成 someone 本人: a specific real person.
  /(?:变成|變成|换成|換成|改成|弄成|p成).{1,12}本人/,
]

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

// The first pattern that matched, as its source (for the log), or null.
export function matchIdentitySwapKeyword(text: string): string | null {
  const latin = normalize(text)
  const compact = latin.replace(/ /g, '')
  for (const pattern of LATIN_PATTERNS) if (pattern.test(latin)) return pattern.source
  for (const pattern of CJK_PATTERNS) if (pattern.test(compact)) return pattern.source
  return null
}
