import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { QueryAnswer, RunQuery } from './posthog-query'
import { fakeRun, WEEK } from './test-samples'
import { loadTraffic } from './traffic'

const eventFields = [
  'person_id', 'timestamp', 'event', 'properties.$host', 'properties.$pathname',
  'properties.$current_url', 'properties.$raw_user_agent', 'properties.$useragent', 'properties.$browser',
]
const sessionFields = [
  '$start_timestamp', '$entry_current_url', '$entry_pathname', '$pageview_count', '$entry_utm_source',
  '$entry_referring_domain', '$entry_gclid', '$entry_utm_campaign', '$entry_utm_medium',
]
const quoted = (field: string) => `"${field}"`
type Fields = Record<string, SQLInputValue>

let db: DatabaseSync

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE events (${eventFields.map(quoted)})`)
  db.exec(`CREATE TABLE sessions (${sessionFields.map(quoted)})`)
  db.function('toDateTime', (value) => value)
  db.function('toString', (value) => value === null ? null : String(value))
  db.function('notEmpty', (value) => Number(Boolean(value)))
  db.function('startsWith', (value, prefix) => Number(String(value).startsWith(String(prefix))))
  db.function('domain', (url) => URL.parse(String(url))?.hostname ?? '')
  db.function('extractURLParameter', (url, key) => URL.parse(String(url))?.searchParams.get(String(key)) ?? '')
  db.function('match', (value, regex) => Number(new RegExp(String(regex)).test(String(value ?? ''))))
  db.function('multiIf', { varargs: true }, (...args) => {
    for (let i = 0; i < args.length - 1; i += 2) if (args[i]) return args[i + 1]
    return args[args.length - 1]
  })
  db.aggregate<number>('countIf', { start: 0, step: (sum, yes) => sum + Number(Boolean(yes)) })
})

afterEach(() => db.close())

// Execute both production queries on fixtures. SQLite needs quoted property identifiers,
// an explicit expansion of ClickHouse's same-SELECT alias, and its own DISTINCT syntax.
const run: RunQuery = async ({ query }) => {
  const quotedFields = query.replace(/'[^']*'|(?:properties\.)?\$\w+/g, (token) =>
    token.startsWith("'") ? token : quoted(token))
  const uaExpression = quotedFields.match(/(lower\(coalesce\(nullIf\([^\n]+?) AS ua\b/i)?.[1]
  const sql = quotedFields.replace(/uniq\(person_id\)/g, 'count(DISTINCT person_id)')
    .replace(/match\(ua,/g, `match(${uaExpression},`)
  const statement = db.prepare(sql)
  const columns = statement.columns().map((column) => column.name)
  return { columns, results: statement.all().map((row) => columns.map((key) => row[key])) }
}

function insert(table: string, keys: string[], fields: Fields) {
  db.prepare(`INSERT INTO ${table} VALUES (${keys.map(() => '?')})`)
    .run(...keys.map((key) => fields[key] ?? null))
}

function session(fields: Fields) {
  insert('sessions', sessionFields, {
    $start_timestamp: WEEK.start, $entry_current_url: 'https://shotviva.com/',
    $entry_pathname: '/', $pageview_count: 3, ...fields,
  })
}

function page(fields: Fields) {
  insert('events', eventFields, {
    timestamp: WEEK.start, event: '$pageview', person_id: 'same-person',
    'properties.$host': 'shotviva.com', 'properties.$pathname': '/', ...fields,
  })
}

describe('public traffic from entry sessions', () => {
  it.each<[string, Fields]>([
    ['google', { $entry_referring_domain: 'www.google.co.uk' }],
    ['bing', { $entry_referring_domain: 'cn.bing.com' }],
    ['chatgpt', { $entry_referring_domain: 'chat.openai.com' }],
    ['chatgpt', { $entry_referring_domain: 'chatgpt.com' }],
    ['direct', {}],
    ['direct', { $entry_referring_domain: '$direct' }],
    ['internal', { $entry_referring_domain: 'shotviva.com' }],
    ['other', { $entry_referring_domain: 'notgoogle.com' }],
    ['other', { $entry_referring_domain: 'bing.com.example.org' }],
    ['other', { $entry_referring_domain: 'mychatgpt.com' }],
    ['other', { $entry_utm_campaign: 'newsletter' }],
    ['google', { $entry_gclid: 'example-click' }],
    ['bing', { $entry_current_url: 'https://shotviva.com/zh?msclkid=example-click' }],
    ['chatgpt', { $entry_utm_source: 'ChatGPT', $entry_referring_domain: 'www.google.com' }],
    ['other', { $entry_utm_source: 'newsletter', $entry_referring_domain: 'bing.com' }],
  ])('attributes one multi-view session to %s for %o', async (expected, fields) => {
    session({ $entry_pathname: '/zh', ...fields })
    const result = await loadTraffic(run, WEEK)
    expect(result.sessions).toBe(1)
    expect(result.channels).toMatchObject({ [expected]: 1 })
    expect(result.homeEntries).toMatchObject({ [expected]: { en: 0, zh: 1 } })
  })

  it('drops preview, redirects, admin/test landings, no-view sessions and out-of-window entries', async () => {
    for (const url of ['https://preview.vercel.app/', 'https://www.shotviva.com/', 'https://shotviva.com.evil.test/']) {
      session({ $entry_current_url: url })
    }
    for (const path of ['/admin', '/zh/admin/templates', '/generate/upload-test/child']) {
      session({ $entry_current_url: `https://shotviva.com${path}`, $entry_pathname: path })
    }
    session({ $pageview_count: 0 })
    session({ $start_timestamp: WEEK.end })
    session({})
    expect(await loadTraffic(run, WEEK)).toMatchObject({ sessions: 1, homeEntries: { direct: { en: 1, zh: 0 } } })
  })
})

it('counts public pageviews and people independently and partitions UA evidence without double counting', async () => {
  page({ 'properties.$raw_user_agent': 'Mozilla Googlebot/2.1 headless' })
  page({ 'properties.$useragent': 'GPTBot/1.0', person_id: 'second-person' })
  page({ 'properties.$browser': 'HeadlessChrome' })
  page({ 'properties.$useragent': 'independent crawler' })
  page({ 'properties.$host': '', 'properties.$current_url': 'https://shotviva.com/zh' })
  page({ 'properties.$host': null })
  page({ 'properties.$pathname': null })
  page({ 'properties.$host': 'preview.vercel.app' })
  page({ 'properties.$pathname': '/zh/admin/templates' })
  page({ 'properties.$pathname': '/zh/generate/upload-test' })
  page({ timestamp: WEEK.end })
  page({ event: 'purchase' })
  expect(await loadTraffic(run, WEEK)).toMatchObject({
    views: 5, visitors: 2, identified: 2, suspected: 2, unknown: 1, sessions: 0,
    excluded: { missing: 2, admin: 1, test: 1, nonPublicHost: 1 },
  })
})

it('accepts empty aggregates and rejects corrupt counts or unknown channels', async () => {
  expect(await loadTraffic(run, WEEK)).toMatchObject({ sessions: 0, views: 0, visitors: 0, unknown: 0 })
  const valid = { columns: ['scope','views','visitors','identified','suspected'], results: [['public',1,1,1,0]] }
  const empty = { columns: ['channel','sessions','en','zh'], results: [] }
  for (const [views, sessions] of [
    [{ ...valid, results: [['public',1,1,1,1]] }, empty],
    [{ ...valid, results: [['public','bad',1,0,0]] }, empty],
    [valid, { ...empty, results: [['invented',1,1,0]] }],
  ] satisfies [QueryAnswer, QueryAnswer][]) {
    await expect(loadTraffic(fakeRun({ 'traffic.views': views, 'traffic.sessions': sessions }), WEEK))
      .rejects.toMatchObject({ failure: 'bad_response' })
  }
})
