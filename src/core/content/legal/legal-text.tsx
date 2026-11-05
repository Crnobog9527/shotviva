import Link from 'next/link'

import type { LegalBlock, LegalLink, LegalText } from './legal-page'

const linkClass = 'underline underline-offset-4 hover:text-foreground'

function InlineLink({ link }: { link: LegalLink }) {
  if (link.href.startsWith('/')) {
    return (
      <Link href={link.href} className={linkClass}>
        {link.label}
      </Link>
    )
  }
  return (
    <a href={link.href} className={linkClass}>
      {link.label}
    </a>
  )
}

export function LegalInline({ text }: { text: LegalText }) {
  if (typeof text === 'string') return text
  return text.map((part, i) =>
    typeof part === 'string' ? part : <InlineLink key={`${part.href}-${i}`} link={part} />,
  )
}

// Array.isArray does not narrow readonly tuples, hence the explicit guard.
function isText(block: LegalBlock): block is LegalText {
  return typeof block === 'string' || Array.isArray(block)
}

export function LegalBlockView({ block }: { block: LegalBlock }) {
  if (isText(block)) {
    return (
      <p>
        <LegalInline text={block} />
      </p>
    )
  }
  if ('list' in block) {
    return (
      <ul className="flex list-disc flex-col gap-2 pl-6">
        {block.list.map((item, i) => (
          <li key={i}>
            <LegalInline text={item} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <address className="not-italic">
      {block.lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </address>
  )
}
