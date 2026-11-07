/**
 * Expand-only guard for new migrations (AGENTS §5). Production migrations apply automatically on
 * merge to main, before the Vercel deployment is promoted, so every migration a PR adds must keep
 * the code currently live on production working. This scans only the migrations the PR ADDS
 * (merged ones are never re-scanned: many of them predate the rule) and fails on SQL that can
 * break that code or destroy data:
 *
 *   drop function / procedure (any: best effort for "a signature deployed code still calls")
 *   drop table / view / type / schema / sequence …   (not one created earlier in the same file)
 *   alter table … drop column / drop constraint / alter column … drop default
 *   rename (tables, columns, functions, types, …) and `set schema`
 *   alter column … type, alter column … set not null
 *   adding a check / unique / primary key / foreign key / exclude constraint to an existing table,
 *   `create unique index` on one, or a `not null` column without a default
 *   truncate, delete from, update … set (outside function bodies)
 *
 * Comments, string literals and the bodies of `create function` / `create procedure` (runtime
 * code) are ignored. The bodies of `do` blocks run during the migration, so they are scanned.
 * Two shapes are let through:
 *   - a constraint dropped and re-added under the same name on the same table in one file, the
 *     way 0460 / 0560 widen payments_method_check: a warning, since the reviewer must check the
 *     new definition only widens;
 *   - `update t set … where <col> = <literal> [and …]` (or `in (<literals>)`): targeted rows such
 *     as a catalog price fix, not a bulk rewrite.
 *
 * A contract PR (the old structure is confirmed unused on production) goes through with
 * `[contract]` in the PR title, passed in as PR_TITLE.
 *
 *   node scripts/check-migrations-destructive.ts                    # HEAD against origin/main
 *   node scripts/check-migrations-destructive.ts origin/main <sha>  # what CI runs
 *
 * Best effort, not a SQL parser: dynamic SQL (`execute '…'`), functions called at the top level
 * and permission changes (`revoke`) are not inspected. Plain erasable TypeScript with no imports
 * beyond Node built-ins, so CI runs it with `node` and no install.
 */
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export type Severity = 'error' | 'warning'

export type Finding = {
  line: number
  rule: string
  severity: Severity
  message: string
  excerpt: string
}

type Statement = { text: string; line: number; bodies: string[] }

const MIGRATIONS_DIR = 'supabase/migrations/'
const CONTRACT_TAG = '[contract]'

// ---------------------------------------------------------------------------------------------
// Lexing: split into statements with comments and string literals blanked out and dollar-quoted
// bodies lifted out, so keywords inside them are never matched.

const isIdentChar = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_$]/.test(c)

export function splitStatements(sql: string): Statement[] {
  const statements: Statement[] = []
  let buf = ''
  let bodies: string[] = []
  let start = -1
  let i = 0
  const lineAt = (offset: number) => sql.slice(0, offset).split('\n').length

  const flush = () => {
    const text = normalize(buf)
    if (text) statements.push({ text, line: lineAt(start), bodies })
    buf = ''
    bodies = []
    start = -1
  }
  const mark = () => {
    if (start < 0) start = i
  }

  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i)
      i = end < 0 ? sql.length : end
      buf += ' '
      continue
    }
    if (c === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else i++
      }
      buf += ' '
      continue
    }
    if (c === "'") {
      mark()
      const prev = sql[i - 1]
      const escapes = (prev === 'e' || prev === 'E') && !isIdentChar(sql[i - 2])
      i++
      while (i < sql.length) {
        if (escapes && sql[i] === '\\') i += 2
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2
        else if (sql[i] === "'") break
        else i++
      }
      i++
      buf += " '' "
      continue
    }
    if (c === '"') {
      mark()
      const end = sql.indexOf('"', i + 1)
      const stop = end < 0 ? sql.length : end
      buf += `"${sql.slice(i + 1, stop)}"`
      i = stop + 1
      continue
    }
    if (c === '$' && !isIdentChar(sql[i - 1])) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (tag) {
        mark()
        const open = tag[0]
        const close = sql.indexOf(open, i + open.length)
        const stop = close < 0 ? sql.length : close
        bodies.push(sql.slice(i + open.length, stop))
        buf += ' $body$ '
        i = stop + open.length
        continue
      }
    }
    if (c === ';' && !insideBeginAtomic(buf)) {
      i++
      flush()
      continue
    }
    if (!/\s/.test(c)) mark()
    buf += c
    i++
  }
  flush()
  return statements
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()

// A SQL-standard function body (`begin atomic … end`) is not dollar-quoted; keep its inner
// statements in the create statement instead of splitting them out.
function insideBeginAtomic(buf: string) {
  const text = normalize(buf)
  return /^create\b.*\bbegin atomic\b/.test(text) && !/\bend$/.test(text)
}

// ---------------------------------------------------------------------------------------------
// Rules

const IDENT = String.raw`(?:"[^"]+"|[a-z_][a-z0-9_$]*)(?:\.(?:"[^"]+"|[a-z_][a-z0-9_$]*))?`

/** `public.Foo`, `"public"."foo"` and `foo` all name the same object. */
export function objectName(raw: string) {
  return raw.replace(/"/g, '').replace(/^public\./, '').trim()
}

/** Splits on commas outside parentheses. */
function splitTopLevel(text: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const c of text) {
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += c
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

const CREATED = new RegExp(
  String.raw`^create (?:or replace )?(?:(?:global |local )?(?:temp|temporary|unlogged) )?(table|view|materialized view|function|procedure|type|domain|sequence|schema|aggregate) (?:if not exists )?(${IDENT})`,
)
const DROPPABLE = 'table|view|materialized view|function|procedure|routine|type|domain|schema|sequence|aggregate'
const DROP = new RegExp(String.raw`^drop (${DROPPABLE}) (?:if exists )?(.+)$`)
const RENAMEABLE = 'view|materialized view|function|procedure|routine|type|domain|schema|sequence|aggregate'
const ALTER_RENAME = new RegExp(String.raw`^alter (${RENAMEABLE}) (?:if exists )?(${IDENT}).* (rename|set schema)\b`)
const ALTER_TABLE = new RegExp(String.raw`^alter table (?:if exists )?(?:only )?(${IDENT})\*? (.+)$`)
const UNIQUE_INDEX = new RegExp(
  String.raw`^create unique index (?:concurrently )?(?:(?:if not exists )?${IDENT} )?on (?:only )?(${IDENT})`,
)
const DELETE = new RegExp(String.raw`\bdelete from (?:only )?(${IDENT})`)
const UPDATE = new RegExp(String.raw`(?<!\bdo )\bupdate (?:only )?(${IDENT})\*?(?: (?:as )?(?!set\b)[a-z_][a-z0-9_]*)? set\b(.*)$`)
const LITERAL = String.raw`(?:''|-?\d+(?:\.\d+)?|true|false|null)`
// Matched against the where clause with the spaces around ( , = and before ) taken out.
const TARGETED_WHERE = new RegExp(
  String.raw`^(?:${IDENT}(?:=${LITERAL}| in\(${LITERAL}(?:,${LITERAL})*\))(?: and |$))+$`,
)
// Statements whose bodies are runtime code, not executed by the migration itself.
const RUNTIME_CODE = /^create (?:or replace )?(?:constraint )?(?:function|procedure|trigger|event trigger|rule|policy)\b/

const MESSAGES: Record<string, string> = {
  'drop-object': 'drops',
  'drop-column': 'drops column',
  'drop-constraint': 'drops constraint',
  'drop-default': 'drops the default of column',
  'drop-identity': 'drops identity/generation of column',
  rename: 'renames',
  'set-schema': 'moves to another schema:',
  'type-change': 'changes the type of column',
  'set-not-null': 'tightens column to not null:',
  'add-constraint': 'adds a constraint to existing table',
  'add-not-null-column': 'adds a not null column without a default:',
  'unique-index': 'adds a unique index to existing table',
  truncate: 'truncates',
  delete: 'deletes rows from',
  'bulk-update': 'updates rows (not targeted by literal keys) in',
  'domain-constraint': 'tightens domain',
  'replace-constraint': 'replaces constraint under the same name (check the new definition only widens):',
}

type Context = {
  created: Set<string>
  droppedConstraints: Set<string>
  addedConstraints: Set<string>
  /** `table:column` for every column this file adds to an existing table. */
  addedColumns: Set<string>
}

// Words in a constraint expression that are not column names. Anything else counts as a column,
// so a word missing here makes the check stricter, never looser.
const NOT_COLUMNS = new Set(
  (
    'and or not is null true false in between like ilike similar to case when then else end any all some ' +
    'array distinct from unknown as at time zone interval collate escape ' +
    'text integer int int2 int4 int8 bigint smallint numeric decimal real double precision float boolean bool ' +
    'jsonb json uuid varchar char character varying timestamptz timestamp date bytea inet citext'
  ).split(' '),
)

/** The text inside the first parenthesised group at or after `from` (balanced), or null. */
function parenthesised(text: string, from = 0) {
  const open = text.indexOf('(', from)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i)
  }
  return null
}

/** Column names an expression refers to: identifiers that are not keywords, types, functions or qualifiers. */
function columnRefs(expr: string) {
  const refs: string[] = []
  const word = /"[^"]+"|[a-z_][a-z0-9_]*/g
  let match: RegExpExecArray | null
  while ((match = word.exec(expr))) {
    const before = expr.slice(0, match.index).trimEnd()
    const after = expr.slice(match.index + match[0].length).trimStart()
    if (after.startsWith('(') || after.startsWith('.') || before.endsWith('::')) continue
    if (NOT_COLUMNS.has(match[0])) continue
    refs.push(objectName(match[0]))
  }
  return refs
}

/**
 * A constraint (or unique index) that only involves columns this same file adds cannot reject
 * anything the deployed code writes: that code never sets those columns, and the existing rows
 * had to pass it for the migration to apply at all.
 */
function onlyNewColumns(table: string, expr: string | null, context: Context) {
  if (expr === null) return false
  const refs = columnRefs(expr)
  return refs.length > 0 && refs.every((column) => context.addedColumns.has(`${table}:${column}`))
}

/** Scans one migration's SQL. Errors fail the check; warnings are for the reviewer. */
export function scanMigration(sql: string): Finding[] {
  const statements = splitStatements(sql)
  const context: Context = {
    created: new Set(),
    droppedConstraints: new Set(),
    addedConstraints: new Set(),
    addedColumns: new Set(),
  }
  for (const statement of statements) collectConstraints(statement.text, context)

  const findings: Finding[] = []
  for (const statement of statements) {
    const report = (rule: string, subject: string, severity: Severity = 'error') =>
      findings.push({
        line: statement.line,
        rule,
        severity,
        message: `${MESSAGES[rule]} ${subject}`.trim(),
        excerpt: statement.text.length > 160 ? `${statement.text.slice(0, 157)}...` : statement.text,
      })
    checkStatement(statement.text, context, report)
    // A `do` block runs now: scan each statement inside it from its first SQL keyword.
    if (/^do\b/.test(statement.text)) {
      for (const body of statement.bodies) {
        for (const inner of splitStatements(body)) {
          const at = inner.text.search(/\b(alter|drop|truncate|delete|update|create)\b/)
          if (at >= 0) checkStatement(inner.text.slice(at), context, report)
        }
      }
    }
  }
  return findings
}

function collectConstraints(text: string, context: Context) {
  const alter = ALTER_TABLE.exec(text)
  if (!alter) return
  const table = objectName(alter[1])
  for (const action of splitTopLevel(alter[2])) {
    const dropped = new RegExp(String.raw`^drop constraint (?:if exists )?(${IDENT})`).exec(action)
    if (dropped) context.droppedConstraints.add(`${table}:${objectName(dropped[1])}`)
    const added = new RegExp(String.raw`^add constraint (${IDENT})`).exec(action)
    if (added) context.addedConstraints.add(`${table}:${objectName(added[1])}`)
    const column = new RegExp(String.raw`^add (?:column )?(?:if not exists )?(${IDENT})`).exec(action)
    if (column && !/^(constraint|check|unique|primary|foreign|exclude)$/.test(column[1]))
      context.addedColumns.add(`${table}:${objectName(column[1])}`)
  }
}

function checkStatement(text: string, context: Context, report: (rule: string, subject: string, severity?: Severity) => void) {
  const { created } = context

  const create = CREATED.exec(text)
  if (create) created.add(objectName(create[2]))
  if (RUNTIME_CODE.test(text)) return

  const drop = DROP.exec(text)
  if (drop) {
    // Functions are never exempt: creating a new overload and then dropping the old signature
    // under the same name is exactly the change that breaks deployed callers.
    const routine = /^(function|procedure|routine|aggregate)$/.test(drop[1])
    for (const part of splitTopLevel(drop[2])) {
      const name = objectName(part.replace(/\(.*$/, '').replace(/ (cascade|restrict)$/, ''))
      if (routine || !created.has(name)) report('drop-object', `${drop[1]} ${name}`)
    }
    return
  }

  if (/^truncate\b/.test(text)) {
    report('truncate', text.replace(/^truncate (table )?/, '').split(/ (restart|continue|cascade|restrict)\b/)[0])
    return
  }

  const rename = ALTER_RENAME.exec(text)
  if (rename) {
    report(rename[3] === 'rename' ? 'rename' : 'set-schema', `${rename[1]} ${objectName(rename[2])}`)
    return
  }

  if (/^alter domain\b.* (add constraint|add check|set not null)\b/.test(text)) {
    report('domain-constraint', text.split(' ')[2] ?? '')
    return
  }

  const alter = ALTER_TABLE.exec(text)
  if (alter) {
    const table = objectName(alter[1])
    if (!created.has(table)) checkAlterTable(table, alter[2], context, report)
    return
  }

  const unique = UNIQUE_INDEX.exec(text)
  if (unique) {
    const table = objectName(unique[1])
    if (!created.has(table) && !onlyNewColumns(table, parenthesised(text, unique[0].length), context))
      report('unique-index', table)
    return
  }

  const del = DELETE.exec(text)
  if (del && !created.has(objectName(del[1]))) report('delete', objectName(del[1]))

  const update = UPDATE.exec(text)
  if (update) {
    const table = objectName(update[1])
    const where = / where (.+?)(?: returning .*)?$/.exec(update[2])?.[1]
    const targeted = where !== undefined && TARGETED_WHERE.test(where.replace(/ ?([(,=]) ?/g, '$1').replace(/ \)/g, ')'))
    if (!created.has(table) && !targeted) report('bulk-update', table)
  }
}

function checkAlterTable(table: string, rest: string, context: Context, report: (rule: string, subject: string, severity?: Severity) => void) {
  if (/^rename\b/.test(rest)) return report('rename', `table ${table} (${rest})`)
  if (/^set schema\b/.test(rest)) return report('set-schema', `table ${table}`)

  for (const action of splitTopLevel(rest)) {
    const constraint = new RegExp(String.raw`^drop constraint (?:if exists )?(${IDENT})`).exec(action)
    if (constraint) {
      const name = objectName(constraint[1])
      if (context.addedConstraints.has(`${table}:${name}`)) report('replace-constraint', `${table}.${name}`, 'warning')
      else report('drop-constraint', `${table}.${name}`)
      continue
    }
    const column = new RegExp(String.raw`^drop (?:column )?(?:if exists )?(${IDENT})`).exec(action)
    if (column) {
      report('drop-column', `${table}.${objectName(column[1])}`)
      continue
    }
    const alterColumn = new RegExp(String.raw`^alter (?:column )?(${IDENT}) (.+)$`).exec(action)
    if (alterColumn) {
      const name = `${table}.${objectName(alterColumn[1])}`
      const change = alterColumn[2]
      if (/^set not null\b/.test(change)) report('set-not-null', name)
      else if (/^drop default\b/.test(change)) report('drop-default', name)
      else if (/^drop (identity|expression)\b/.test(change)) report('drop-identity', name)
      else if (/^(set data )?type\b/.test(change)) report('type-change', name)
      continue
    }
    const addConstraint = new RegExp(
      String.raw`^add (?:constraint (${IDENT}) )?(check|unique|primary key|foreign key|exclude)\b`,
    ).exec(action)
    if (addConstraint) {
      const name = addConstraint[1] ? objectName(addConstraint[1]) : ''
      const kind = addConstraint[2]
      // check (expr), unique (cols), primary key (cols), foreign key (cols) references …
      const involved = kind === 'exclude' ? null : parenthesised(action, addConstraint[0].length)
      // A same-name replacement was already reported once, at its drop.
      const replaced = name !== '' && context.droppedConstraints.has(`${table}:${name}`)
      if (!replaced && !onlyNewColumns(table, involved, context))
        report('add-constraint', `${table}${name ? ` (${name})` : ''}: ${kind}`)
      continue
    }
    const addColumn = new RegExp(String.raw`^add (?:column )?(?:if not exists )?(${IDENT}) (.+)$`).exec(action)
    if (addColumn) {
      const definition = addColumn[2]
      const column = `${table}.${objectName(addColumn[1])}`
      if (/\bnot null\b/.test(definition) && !/\b(default|generated)\b/.test(definition))
        report('add-not-null-column', column)
      // An inline check on the new column may still reach into existing ones.
      const check = definition.search(/\bcheck\b/)
      if (check >= 0 && !onlyNewColumns(table, parenthesised(definition, check), context))
        report('add-constraint', `${table} (inline on ${column}): check`)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// CLI

const escapeAnnotation = (text: string) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

function git(...args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Migrations the branch adds, relative to where it left the base (files main gained since don't count). */
export function addedMigrations(base: string, head: string) {
  const mergeBase = git('merge-base', base, head).trim()
  return git('diff', '--name-only', '--diff-filter=A', '--no-renames', mergeBase, head, '--', MIGRATIONS_DIR)
    .split('\n')
    .filter((path) => path.startsWith(MIGRATIONS_DIR) && path.endsWith('.sql'))
}

function main() {
  const base = process.argv[2] ?? 'origin/main'
  const head = process.argv[3] ?? 'HEAD'
  const title = process.env.PR_TITLE ?? ''

  const files = addedMigrations(base, head)
  if (files.length === 0) {
    console.log('No migrations added: nothing to scan.')
    return 0
  }

  let errors = 0
  for (const path of files) {
    for (const finding of scanMigration(git('show', `${head}:${path}`))) {
      if (finding.severity === 'error') errors++
      const level = finding.severity === 'error' && !title.includes(CONTRACT_TAG) ? 'error' : 'warning'
      console.log(`::${level} file=${path},line=${finding.line},title=${finding.rule}::${escapeAnnotation(finding.message)}`)
      console.log(`  ${path}:${finding.line}  ${finding.excerpt}`)
    }
  }
  console.log(`Scanned ${files.length} added migration(s): ${files.join(', ')}`)

  if (errors === 0) {
    console.log('No destructive SQL: the deployed code keeps working on the migrated database.')
    return 0
  }
  if (title.includes(CONTRACT_TAG)) {
    console.log(`::warning::PR title contains ${CONTRACT_TAG}; allowing ${errors} destructive statement(s).`)
    return 0
  }
  console.log(
    `::error::${errors} destructive statement(s) in new migrations. Production migrates on merge, before ` +
      'the new code is promoted, so these would break the code that is live (AGENTS §5, expand then contract). ' +
      'Split the change: ship code that no longer needs the old structure first, then remove it in a later ' +
      `contract PR with ${CONTRACT_TAG} in its title.`,
  )
  return 1
}

// Run as a script (not imported by the tests). Node resolves symlinks in import.meta.url.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exit(main())
