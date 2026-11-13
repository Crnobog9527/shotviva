import type { PosterContent, PosterPrizes, PosterSection, PosterTable } from './content'
import type { PosterPart } from './split'

// One poster's confirmed text as the image model receives it (ARCHITECTURE §5.3): a plain,
// labelled listing in reading order, appended after the template's private prompt (which says
// how to lay it out and that every character must match). Data only: no style words here.
// Empty values are left out, so the model never invents filler for them.

const line = (label: string, value: string) => (value ? `${label}: ${value}` : '')

function headerLines(header: PosterContent['header']): string[] {
  return [
    line('Brand', [header.brand, header.brandEn].filter(Boolean).join(' / ')),
    line('Cup', [header.cup, header.cupEn].filter(Boolean).join(' / ')),
    line('City', header.city),
    line('Title', header.title),
    line('Subtitle', header.subtitle),
    line(header.datetimeLabel || 'Time', header.datetime),
  ]
}

function prizeLines(prizes: PosterPrizes): string[] {
  return [
    line('Headline', prizes.headline),
    line('Note', prizes.note),
    `Prize list (${prizes.rows.length} rows, top to bottom):`,
    ...prizes.rows.map((row, i) => `Row ${i + 1}: ${[row.rank, row.rankEn, row.prize].filter(Boolean).join(' | ')}`),
  ]
}

function sectionLines(section: PosterSection): string[] {
  const body = section.lines.map((text, i) => (section.style === 'numbered' ? `${i + 1}. ${text}` : text))
  return [`Section "${section.title}":`, ...body]
}

function tableLines(table: PosterTable & { continued: boolean }): string[] {
  const title = [table.title, table.titleEn].filter(Boolean).join(' ')
  return [
    `Table${title ? ` "${title}"` : ''}${table.continued ? ' (continued)' : ''}, columns: ${table.columns.join(' | ')}`,
    ...table.rows.map((row) => (Array.isArray(row) ? `Row: ${row.join(' | ')}` : `Full-width row: ${row.break}`)),
    line('Note under the table', table.footnote),
  ]
}

function footerLines(footer: PosterContent['footer']): string[] {
  return [
    line(footer.phonesLabel || 'Phones', footer.phones.join('   ')),
    line(footer.addressLabel || 'Address', footer.address),
    line('Caption under the QR code', footer.qrLabel),
  ]
}

function infoLines(info: PosterContent['info']): string[] {
  return [line('Heading over the sections', [info.title, info.titleEn].filter(Boolean).join(' / '))]
}

export function partText(content: PosterContent, part: PosterPart): string {
  const pageNote = part.pages > 1 ? ` (poster ${part.page} of ${part.pages})` : ''
  const blocks = [
    ['[Header]', ...headerLines(content.header)],
    part.prizes ? ['[Prizes]', ...prizeLines(part.prizes)] : [],
    part.sections ? ['[Sections column]', ...infoLines(content.info)] : [],
    ...(part.sections ?? []).map((section) => ['[Section]', ...sectionLines(section)]),
    part.table ? ['[Table]', ...tableLines(part.table)] : [],
    ['[Footer]', ...footerLines(content.footer)],
  ]
  const listed = blocks.map((block) => block.filter(Boolean)).filter((block) => block.length > 1)
  return [`Poster text${pageNote}:`, ...listed.map((block) => block.join('\n'))].join('\n\n')
}
