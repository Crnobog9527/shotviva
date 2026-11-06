import type { Bill, CostBills } from '../page-content'

function BillCard({ bill, side }: { bill: Bill; side: 'them' | 'us' }) {
  const { total } = bill
  return (
    <article className={`mk-bill-card mk-${side}`}>
      <h3>{bill.title}</h3>
      <p className="mk-total">
        <span className="mk-n">
          {total.prefix ? <span className="mk-from">{total.prefix}</span> : null}
          {total.amount}
          {total.suffix ? <small>{total.suffix}</small> : null}
        </span>
        <span className="mk-when">{total.when}</span>
      </p>
      <ul className="mk-lines">
        {bill.lines.map((line) => (
          <li key={line.label}>
            <span>{line.label}</span>
            <span className="mk-n">{line.value}</span>
          </li>
        ))}
      </ul>
      <p className="mk-fine">{bill.fine}</p>
    </article>
  )
}

// Block ③ on the home page: the same job as two bills, a photographer's quote and ours
// (DESIGN §6.9 item 6, 建站规格 R10 ③). The figures come from site.config through the content.
export function CostBillsSection({ bills }: { bills: CostBills }) {
  return (
    <section className="mk-block mk-reveal" id="cost" aria-labelledby="cost-h">
      <h2 className="mk-h2" id="cost-h">
        {bills.heading}
      </h2>
      <p className="mk-intro">{bills.intro}</p>
      <div className="mk-bills">
        <BillCard bill={bills.photographer} side="them" />
        <BillCard bill={bills.site} side="us" />
      </div>
    </section>
  )
}
