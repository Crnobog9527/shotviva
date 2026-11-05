import type { FaqItem } from '../page-content'

// <h3> + <p>, never div soup, so crawlers read each Q&A (建站规格 G11).
export function FaqSection({ faq }: { faq: readonly FaqItem[] }) {
  return (
    <section>
      <h2>Frequently asked questions</h2>
      {faq.map((item) => (
        <div key={item.question}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </div>
      ))}
    </section>
  )
}
