import { serializeJsonLd } from './json-ld'

export function JsonLdScript({ data }: { data: Record<string, unknown>[] }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
  )
}
