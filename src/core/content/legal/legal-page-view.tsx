import { formatLegalDate, type LegalPage, type LegalSection } from './legal-page'
import { LegalBlockView } from './legal-text'

// Server-rendered, plain semantic HTML: headings, paragraphs and lists, readable without JS.
function TableOfContents({ sections }: { sections: LegalPage['sections'] }) {
  return (
    <nav aria-labelledby="legal-contents" className="flex flex-col gap-3">
      <h2 id="legal-contents" className="text-lg font-semibold text-foreground">
        Contents
      </h2>
      <ol className="flex list-decimal flex-col gap-1 pl-6">
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
              {section.heading}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function SectionView({ section, index }: { section: LegalSection; index: number }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className="flex scroll-mt-20 flex-col gap-4">
      <h2 id={`${section.id}-heading`} className="text-xl font-semibold text-foreground">
        {index + 1}. {section.heading}
      </h2>
      {section.blocks.map((block, i) => (
        <LegalBlockView key={i} block={block} />
      ))}
    </section>
  )
}

export function LegalPageView({ page }: { page: LegalPage }) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 leading-7 text-muted-foreground">
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-foreground md:text-5xl">{page.h1}</h1>
        <p className="text-sm">
          Last updated <time dateTime={page.lastUpdated}>{formatLegalDate(page.lastUpdated)}</time>
        </p>
        {page.intro.map((block, i) => (
          <LegalBlockView key={i} block={block} />
        ))}
      </header>
      <TableOfContents sections={page.sections} />
      {page.sections.map((section, i) => (
        <SectionView key={section.id} section={section} index={i} />
      ))}
    </article>
  )
}
