import type { AdminInquiry } from '@/core/inquiries'

import { formatBeijing } from '../shell/format'
import { INQUIRIES_COPY as COPY } from './copy'

// The ticked inquiries as a CSV for follow-up in a spreadsheet: every field the dialog shows,
// choices in the admin's Chinese words, times in Beijing time.

type Column = [header: string, value: (row: AdminInquiry) => string | null]

const list = (values: readonly string[], names: Record<string, string>) => values.map((value) => names[value] ?? value).join('、')

const COLUMNS: Column[] = [
  [COPY.fields.createdAt, (row) => formatBeijing(row.created_at)],
  [COPY.columns.status, (row) => COPY.statuses[row.status]],
  [COPY.fields.company, (row) => row.company],
  [COPY.fields.name, (row) => row.name],
  [COPY.fields.jobTitle, (row) => row.job_title],
  [COPY.fields.email, (row) => row.email],
  [COPY.fields.phone, (row) => row.phone],
  [COPY.fields.wechat, (row) => row.wechat],
  [COPY.fields.website, (row) => row.website],
  [COPY.fields.country, (row) => row.country],
  [COPY.fields.teamSize, (row) => (row.team_size ? COPY.teamSizes[row.team_size] : null)],
  [COPY.fields.volume, (row) => COPY.volumes[row.monthly_volume]],
  [COPY.fields.uses, (row) => list(row.uses, COPY.uses)],
  [COPY.fields.platforms, (row) => list(row.platforms, COPY.platforms)],
  [COPY.fields.needs, (row) => list(row.needs, COPY.needs)],
  [COPY.fields.startTime, (row) => (row.start_time ? COPY.startTimes[row.start_time] : null)],
  [COPY.fields.message, (row) => row.message],
  [COPY.edit.note, (row) => row.admin_note],
  [COPY.fields.source, (row) => COPY.sources[row.locale]],
  [COPY.fields.updatedAt, (row) => formatBeijing(row.updated_at)],
]

// Every cell quoted. Text a visitor typed that starts like a formula (= + - @, tab, CR) gets a
// leading apostrophe so a spreadsheet shows it instead of running it.
export function csvCell(value: string | null | undefined): string {
  const text = value ?? ''
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

// With a BOM, so Excel reads the Chinese as UTF-8; CRLF line ends as RFC 4180 asks.
export function inquiriesCsv(rows: readonly AdminInquiry[]): string {
  const lines = [COLUMNS.map(([header]) => csvCell(header)), ...rows.map((row) => COLUMNS.map(([, value]) => csvCell(value(row))))]
  return `﻿${lines.map((cells) => cells.join(',')).join('\r\n')}\r\n`
}
