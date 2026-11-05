import type { Fact } from '../page-content'

export function FactsSection({ facts }: { facts: readonly Fact[] }) {
  return (
    <section>
      <h2>Key facts</h2>
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
