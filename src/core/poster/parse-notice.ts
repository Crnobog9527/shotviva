import { cleanPosterLine, posterContentSchema, type PosterContent } from './content'
import { unverifiedPaths } from './verbatim'

// 整理内容 without the model (ARCHITECTURE §5.3): a notice already laid out the usual way, as
// paragraphs separated by blank lines (a header, 「冠军 CHAMPION：…」 prize lines, titled rule
// blocks, a 「1 / 100 / 200」 level table, 「热线：…」 contact lines), is sorted here in a few
// milliseconds instead of waiting on the model. Every value is a piece of the pasted text as it
// stands, nothing is rewritten. When any line does not fit a known shape the whole notice goes to
// the model instead: a half-sorted notice would be harder to check than a fully sorted one.

const CJK = '\\u3400-\\u9fff\\uf900-\\ufaff'
// 「星澜杯 XINGLAN CUP」: Chinese first, then capitalised English words.
const BILINGUAL = new RegExp(`^(.*[${CJK}）)》」])\\s+([A-Z][A-Z0-9 &'’.,·-]*)$`)
const RANK = '冠军|亚军|季军|殿军|第[一二三四五六七八九十百零〇两\\d]+名'
// 「冠军 CHAMPION：旗舰手机」, 「第四名：平板」, 「季军 旗舰手机（256G）」.
const PRIZE_LINE = new RegExp(`^(${RANK})(?:\\s*([A-Z][A-Z ]*[A-Z]))?\\s*(?:[：:]\\s*|\\s+)(\\S.*)$`)
const NUMBERED = /^(?:\d{1,2}|[一二三四五六七八九十]{1,2})\s*[.、．)）]\s*(\S.*)$/
const KV = /^([^：:]{1,12}?)\s*[：:]\s*(\S.*)$/
const PHONE = /^\+?[\d\s-]{7,20}$/
const TABLE_SPLIT = /\s*[/／|｜\t]\s*/
const FOOTNOTE = /^[*＊※注]/

const max = (value: string, limit: number) => [...value].length <= limit

type Draft = {
  header: Record<string, string>
  prizes: { headline: string; note: string; rows: { rank: string; rankEn: string; prize: string }[] } | null
  sections: { title: string; style: 'kv' | 'numbered' | 'plain'; lines: string[] }[]
  table: { title: string; titleEn: string; columns: string[]; rows: (string[] | { break: string })[]; footnote: string } | null
  footer: { phones: string[]; phonesLabel: string; addressLabel: string; address: string; qrLabel: string }
}

function paragraphs(text: string): string[][] {
  return text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
    .map((block) => block.split('\n').map(cleanPosterLine).filter(Boolean))
    .filter((lines) => lines.length > 0)
}

// The header block: a few short lines, each one known field (two with its English), each field
// filled once. A rule takes the line when it matches and its fields are still empty.
type HeaderRule = (line: string, zh: string, en: string) => Record<string, string> | null
const HEADER_RULES: HeaderRule[] = [
  (line) => {
    const time = /^(\S*时间)\s*[：:]?\s*(\d.*)$/.exec(line)
    return time ? { datetimeLabel: time[1]!, datetime: time[2]! } : null
  },
  (_, zh, en) => {
    const both = /^(\S+杯)\s+(\S+赛)$/.exec(zh)
    return both ? { cup: both[1]!, title: both[2]!, subtitle: en } : null
  },
  (_, zh, en) => (/杯$/.test(zh) ? { cup: zh, cupEn: en } : null),
  (_, zh, en) => (/赛$/.test(zh) ? { title: zh, subtitle: en } : null),
  (line) => (/^\S{1,6}[·・]\S{1,8}$/.test(line) ? { city: line } : null),
]

function readHeader(lines: string[], header: Record<string, string>): boolean {
  for (const line of lines) {
    const [, zh = line, en = ''] = BILINGUAL.exec(line) ?? []
    const free = (fields: Record<string, string> | null) => fields && Object.keys(fields).every((key) => !header[key])
    // The organiser comes first, before the cup or the title.
    const fields = HEADER_RULES.map((rule) => rule(line, zh, en)).find(free)
      ?? (header.brand || header.cup || header.title ? null : { brand: zh, brandEn: en })
    if (!fields) return false
    Object.assign(header, fields)
  }
  return true
}

function readPrizes(lines: string[]): Draft['prizes'] {
  const rows: NonNullable<Draft['prizes']>['rows'] = []
  let headline = ''
  let note = ''
  for (const [index, line] of lines.entries()) {
    const prize = PRIZE_LINE.exec(line)
    if (prize) {
      rows.push({ rank: prize[1]!, rankEn: prize[2] ?? '', prize: prize[3]! })
    } else if (index === 0 && /奖/.test(line)) {
      // 「奖励前10名，满员追加奖励」 or 「奖励前5名 满员追加奖励」: the headline, then the note.
      const [, first = line, rest = ''] = /^(\S+?)(?:[，,；;]\s*|\s+)(\S.*)$/.exec(line) ?? []
      headline = first
      note = rest
    } else {
      return null
    }
  }
  return rows.length > 0 ? { headline, note, rows } : null
}

const cellsOf = (line: string) => line.split(TABLE_SPLIT).map((cell) => cell.trim())

// The table's title and columns: 「级别结构（级别 / 半基础分 / 基础分 / 预置分）」, a column line,
// or a title line (with its English) then a column line. The rest are its rows.
function tableHead([first = '', ...rest]: string[]) {
  const inline = /^(.+?)\s*[（(](.+)[）)]$/.exec(first)
  if (inline && cellsOf(inline[2]!).length >= 2) return { title: inline[1]!, titleEn: '', columns: cellsOf(inline[2]!), rest }
  if (cellsOf(first).length >= 2) return { title: '', titleEn: '', columns: cellsOf(first), rest }
  const [, zh = first, en = ''] = BILINGUAL.exec(first) ?? []
  return { title: zh, titleEn: en, columns: cellsOf(rest[0] ?? ''), rest: rest.slice(1) }
}

// One line per level; a line that does not split into the column count is a break row
// (「休息 用餐30分钟」, 「休息10分钟/截止报名」). A last line starting with * is the footnote.
function readTable(lines: string[]): Draft['table'] {
  const { title, titleEn, columns, rest } = tableHead(lines)
  if (columns.length < 2 || columns.length > 5 || columns.some((cell) => !cell)) return null
  const footnote = rest.length > 0 && FOOTNOTE.test(rest.at(-1)!) ? rest.pop()! : ''
  const rows = rest.map((line) => {
    const cells = cellsOf(line)
    return cells.length === columns.length && cells.every(Boolean) ? cells : { break: line }
  })
  const data = rows.filter(Array.isArray).length
  if (data < 2 || data < rows.length / 2) return null
  return { title, titleEn, columns, rows, footnote }
}

const tableLike = (lines: string[]) => lines.filter((line) => cellsOf(line).length >= 2 && !KV.test(line)).length >= 3

// 「赛事热线：188 0000 1234、188 0000 5678」, 「客服微信：见二维码」, 「赛事地址：…」.
function readFooter(lines: string[], footer: Draft['footer']): boolean {
  for (const line of lines) {
    const kv = KV.exec(line)
    if (!kv) return false
    const [, label, value] = kv as unknown as [string, string, string]
    const phones = value.split(/\s*[、，,;；/]\s*/)
    if (phones.every((phone) => PHONE.test(phone)) && !footer.phones.length) Object.assign(footer, { phones, phonesLabel: label })
    else if (/地址|地点|场地/.test(label) && !footer.address) Object.assign(footer, { addressLabel: label, address: value })
    else if (/二维码|扫码/.test(value + label) && !footer.qrLabel) footer.qrLabel = label
    else return false
  }
  return true
}

const isFooter = (lines: string[]) => lines.some((line) => /热线|电话|地址|二维码/.test(line)) && lines.every((line) => KV.test(line))

function readSection(lines: string[]): Draft['sections'][number] | null {
  const [title = '', ...body] = lines
  if (body.length === 0 || KV.test(title) || NUMBERED.test(title) || !max(title, 12)) return null
  const numbered = body.map((line) => NUMBERED.exec(line)?.[1])
  if (numbered.every(Boolean)) return { title, style: 'numbered', lines: numbered as string[] }
  return { title, style: body.some((line) => KV.test(line)) ? 'kv' : 'plain', lines: body }
}

// Files one paragraph where it belongs; false when it fits nowhere.
function readBlock(draft: Draft, lines: string[], first: boolean): boolean {
  const prizes = draft.prizes ? null : readPrizes(lines)
  if (prizes) {
    draft.prizes = prizes
    return true
  }
  if (first && readHeader(lines, draft.header)) return true
  if (!draft.table && tableLike(lines)) {
    draft.table = readTable(lines)
    return draft.table !== null
  }
  if (isFooter(lines)) return readFooter(lines, draft.footer)
  const section = readSection(lines)
  if (section) draft.sections.push(section)
  return section !== null
}

// The sorted content when every line of the notice found its place and every value is found
// verbatim in it; null sends the notice to the model.
export function parsePosterNotice(text: string): PosterContent | null {
  const blocks = paragraphs(text)
  if (blocks.length < 2) return null
  const draft: Draft = {
    header: {}, prizes: null, sections: [], table: null,
    footer: { phones: [], phonesLabel: '', addressLabel: '', address: '', qrLabel: '' },
  }
  if (!blocks.every((lines, index) => readBlock(draft, lines, index === 0))) return null
  if (!draft.header.title && !draft.header.cup) return null
  const parsed = posterContentSchema.safeParse(draft)
  if (!parsed.success || unverifiedPaths(parsed.data, text).length > 0) return null
  return parsed.data
}
