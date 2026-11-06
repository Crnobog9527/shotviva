import { Link } from '@/core/i18n/ui'

import type { LegalBlock, LegalLink, LegalText } from './legal-page'

// Files such as /fonts/misans/LICENSE.pdf are plain downloads, not pages for the router. Pages go
// through the site's Link, which adds /zh on a Chinese page.
const isFile = (href: string) => /\.[a-z0-9]+$/i.test(href)

function InlineLink({ link }: { link: LegalLink }) {
  if (link.href.startsWith('/') && !isFile(link.href)) {
    return (
      <Link href={link.href}>
        {link.label}
      </Link>
    )
  }
  return (
    <a href={link.href}>
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
      <ul>
        {block.list.map((item, i) => (
          <li key={i}>
            <LegalInline text={item} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <address>
      {block.lines.map((line) => (
        <span key={line}>
          {line}
        </span>
      ))}
    </address>
  )
}
