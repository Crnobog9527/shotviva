type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|signature/i
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Bearer headers, JWTs, and common provider key prefixes (Stripe, OpenAI, etc.).
const TOKEN = /\b(Bearer\s+[\w.~+/-]+=*|eyJ[\w-]+\.[\w-]+\.[\w-]+|(sk|pk|rk|whsec)_[A-Za-z0-9_]{8,})/g

const MAX_DEPTH = 5

export function redactString(value: string): string {
  return value.replace(EMAIL, '[email]').replace(TOKEN, '[redacted]')
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value)
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) }
  }
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1),
    ]),
  )
}

function write(level: Level, message: string, fields?: Fields): void {
  const line = JSON.stringify({
    level,
    msg: redactString(message),
    time: new Date().toISOString(),
    ...(fields ? (redact(fields) as Fields) : {}),
  })
  // The only sanctioned console sink; everything else goes through this logger.
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](line)
}

export const logger = {
  debug: (message: string, fields?: Fields) => write('debug', message, fields),
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
}
