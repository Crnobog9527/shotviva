import { FILE_FIELDS, TEXT_FIELDS, type LiveDispute } from '@/core/billing/stripe'

import { FILE_LABELS, TEXT_LABELS } from './view-model'

// The draft as Stripe holds it now (T82), field by field, English as the bank will read it.
// Long fields fold so the page stays scannable; the summary is edited in the form below.

const OPEN_BY_DEFAULT = new Set(['uncategorized_text', 'customer_purchase_ip', 'customer_email_address', 'service_date'])

function TextField({ field, value }: { field: (typeof TEXT_FIELDS)[number]; value: string }) {
  return (
    <details className="group rounded-md border border-border bg-background" open={OPEN_BY_DEFAULT.has(field)}>
      <summary className="flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm font-medium marker:text-muted-foreground">
        {TEXT_LABELS[field]}
        <span className="font-mono text-xs font-normal text-muted-foreground">{field}</span>
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-border px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</pre>
    </details>
  )
}

export function EvidencePreview({ live, missing }: { live: LiveDispute; missing: string }) {
  const fields = TEXT_FIELDS.filter((field) => live.text[field])
  const files = FILE_FIELDS.filter((field) => live.files[field])
  if (fields.length === 0 && files.length === 0) return <p className="text-sm text-muted-foreground">{missing}</p>
  return (
    <div className="grid gap-2">
      {fields.map((field) => (
        <TextField key={field} field={field} value={live.text[field] ?? ''} />
      ))}
      {files.length > 0 ? (
        <ul className="grid gap-1 rounded-md border border-border px-3 py-2 text-sm">
          {files.map((field) => (
            <li key={field} className="flex flex-wrap gap-2">
              <span>{FILE_LABELS[field]}</span>
              <span className="font-mono text-xs text-muted-foreground">{live.files[field]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
