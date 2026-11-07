import Image from 'next/image'

import type { ShootDemo } from '../page-content'

const RESULT_SIZES = '(min-width: 1024px) 236px, (min-width: 768px) 33vw, 50vw'

// "One phone photo → a full shoot" (ARCHITECTURE §13 item 2): the phone snapshot as large as a
// result, the three results from three templates, and the two-line bill under them.
export function ShootSection({ shoot }: { shoot: ShootDemo }) {
  const { phone, bill } = shoot
  return (
    <section className="mk-block mk-reveal" id="shoot" aria-labelledby="shoot-h">
      <h2 className="mk-h2 mk-hot" id="shoot-h">
        {shoot.heading.lead}
        <em>{shoot.heading.emphasis}</em>
      </h2>
      <p className="mk-intro">{shoot.intro}</p>
      <div className="mk-shoot">
        <figure className="mk-src">
          <div className="mk-phone mk-lift">
            <Image className="mk-zoom" src={phone.image.src} alt={phone.image.alt} width={phone.image.width} height={phone.image.height} sizes={RESULT_SIZES} />
            <span className="mk-file" aria-hidden>
              {phone.file}
            </span>
          </div>
          <figcaption className="mk-src-meta">
            <span className="sr-only">{phone.file}. </span>
            <p>{phone.caption}</p>
          </figcaption>
        </figure>
        <div className="mk-develop" aria-hidden>
          <span className="mk-line" />
          <svg className="mk-arrow" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h31M26 11l9 9-9 9" />
          </svg>
          <span className="mk-lbl">{shoot.arrow}</span>
        </div>
        <ol className="mk-outs">
          {shoot.results.map((result) => (
            <li key={result.title} className="mk-lift">
              <Image className="mk-zoom" src={result.image.src} alt={result.image.alt} width={result.image.width} height={result.image.height} sizes={RESULT_SIZES} />
              <span className="mk-out-cap">
                <b>{result.title}</b>
                <small>{result.template}</small>
              </span>
            </li>
          ))}
        </ol>
        <div className="mk-bill">
          <div className="mk-them">
            <span className="mk-who">{bill.photographer.who}</span>
            <p className="mk-amt">{bill.photographer.amount}</p>
            <small>{bill.photographer.note}</small>
          </div>
          <div className="mk-us">
            <span className="mk-who">{bill.site.who}</span>
            <p className="mk-amt">{bill.site.amount}</p>
            <small>{bill.site.note}</small>
          </div>
        </div>
        <p className="mk-bill-line">{bill.line}</p>
      </div>
    </section>
  )
}
