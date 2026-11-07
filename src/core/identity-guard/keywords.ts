// Step one of ARCHITECTURE §5.1a: requests that can only mean a face swap, refused without a model
// call. A keyword hit refuses outright, so the list holds unambiguous phrases only; anything with
// a harmless reading ("换个头套", "把脸换成素颜", "put a face on the pumpkin", "replace the head
// with a brass one", "改成更像本人一点") is left to the decision model, which reads the meaning.
// Edit freely: each pattern is one line, and the example sentences (examples.test-data.ts) say
// what it must and must not catch.

// Matched against one field at a time, lowercased, NFKC-folded (full-width letters; 換/换 stay
// distinct) and with runs of whitespace collapsed to one space.
const LATIN_PATTERNS: readonly RegExp[] = [
  /\bface[ -]?swap/,
  /\bdeep[ -]?fakes?\b/,
  // People's faces only: "swap their faces", not "swap the faces" of two clocks.
  /\bswap(?:ping|ped)? (?:their|our|your|his and her|her and his) faces\b/,
  /\b(?:merge|blend|morph|fuse) (?:our|their) (?:two )?faces\b/,
]

// Matched against the same field with all whitespace removed, so "换 脸" is caught too.
const CJK_PATTERNS: readonly RegExp[] = [
  // 换脸 as a word: not 换脸盆 (washbasin), 换脸谱 (opera masks), 换脸色 (complexion), 换脸上的妆
  // (the makeup on the face), 换脸部 / 换脸颊 / 换脸蛋 / 换脸型.
  /[换換](?:脸|臉)(?!盆|谱|譜|色|上|部|颊|頰|蛋|型)/,
  /深度伪造|深度偽造/,
  // 把…的脸换成 another person: 另一个人 / 别人, or the person in another photo.
  /(?:脸|臉)替?[换換]成(?:另一?(?:个|個)人|另外一?(?:个|個)人|别人|別人|别的人|他人|.{0,6}(?:第[一二三四五1-5]张|第[一二三四五1-5]張|图[一二三四五1-5]|圖[一二三四五1-5]|照片[一二三四五1-5]).{0,6}(?:人|那位))/,
  // Faces of two or more people merged: 两张脸融合, 融合两个人的脸.
  /(?:两|兩|俩|倆|多)(?:个|個|张|張)?(?:人的)?(?:脸|臉)(?:融合|合成|合并|合併)|(?:融合|合并|合併)(?:两|兩|俩|倆|多)(?:个|個|张|張)?人?的?(?:脸|臉)/,
]

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

// The first pattern that matched one field, as its source (for the log), or null.
export function matchIdentitySwapKeyword(text: string): string | null {
  const latin = normalize(text)
  const compact = latin.replace(/ /g, '')
  for (const pattern of LATIN_PATTERNS) if (pattern.test(latin)) return pattern.source
  for (const pattern of CJK_PATTERNS) if (pattern.test(compact)) return pattern.source
  return null
}

// Each field on its own, so a pattern never spans the end of one field and the start of the next.
export function matchAnyField(texts: readonly string[]): string | null {
  for (const text of texts) {
    const hit = matchIdentitySwapKeyword(text)
    if (hit) return hit
  }
  return null
}
