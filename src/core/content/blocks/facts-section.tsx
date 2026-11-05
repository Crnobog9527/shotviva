import type { Fact } from '../page-content'

// A two-column <table>, not a list: AI answers lift tables more reliably (建站规格 G4, G5).
export function FactsSection({ facts, heading, intro }: { facts: readonly Fact[]; heading: string; intro?: string }) {
  return (
    <section>
      <h2>{heading}</h2>
      {intro && <p>{intro}</p>}
      <table>
        <tbody>
          {facts.map((fact) => (
            <tr key={fact.label}>
              <th scope="row">{fact.label}</th>
              <td>{fact.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
