import type { WorkUserInput } from '../support/view-work-input'
import { SUPPORT_COPY } from './copy'

const COPY = SUPPORT_COPY.view

// What the user typed and chose, exactly as entered. Rendered as React text (never as HTML) and
// with line breaks kept, so a pasted prompt reads the way the user wrote it.
export function UserInputSection({ input }: { input: WorkUserInput }) {
  const empty = input.entries.length === 0 && input.options.length === 0
  return (
    <section className="grid gap-2" aria-label={COPY.userInput}>
      <h3 className="text-sm font-medium">{COPY.userInput}</h3>
      {empty ? <p className="text-sm text-muted-foreground">{COPY.userInputNone}</p> : null}
      {input.entries.map((entry, index) => (
        <div key={index} className="grid gap-1">
          <div className="text-xs text-muted-foreground">{entry.kind === 'copy' ? entry.label : COPY[entry.kind]}</div>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{entry.value}</p>
        </div>
      ))}
      {input.options.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {input.options.map((option) => `${option.label} ${option.on ? COPY.optionOn : COPY.optionOff}`).join(' · ')}
        </p>
      ) : null}
    </section>
  )
}
