/* Shotviva v3-b · plan data and tier markup shared by paywall.html and pricing.html. Round 3.
   Perks: only live ones carry a check; everything else sits in a separate "Coming soon" group. No queue or speed claims.
   Every price, credit count and the yearly-savings badge are site.config values at build time; the numbers here are the comp's copy of them. */
(function () {
  const P = {
    /* yearly = 12 months at a discount, rounded to whole dollars: Starter and Pro 20% off, Max 40% off (Owner, 2026-11-06; spec PR #100) */
    starter: { name: 'Starter', m: [19.90, 50],  y: [191, 600, 15.92],  save: '47.80' },
    pro:     { name: 'Pro',     m: [49.90, 135], y: [479, 1620, 39.92], save: '119.80' },
    max:     { name: 'Max',     m: [99, 280],    y: [713, 3360, 59.42], save: '475' },
  };
  const PK = { p20: [20, '9.90', '0.50'], p55: [55, '24.90', '0.45'], p115: [115, '49.90', '0.43'] };
  const money = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  const tick = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const PERKS = {
    starter: { h: 'Includes', live: ['No watermark, commercial use', 'Private by default, all templates', '1 photo generating at a time', 'Email support, reply within 48 hours'], soon: [] },
    pro:     { h: 'Everything in Starter, plus', live: ['3 photos generating at a time'], soon: ['Batch upload, up to 10 photos', 'Brand kit: your logo and fonts on posters'] },
    max:     { h: 'Everything in Pro, plus', live: ['6 photos generating at a time', 'Priority email support, reply within 24 hours'], soon: ['Batch upload, up to 30 photos', 'Early access to new features', 'Brand kit: your logo and fonts on posters', 'Template requests count 3× on the Wishlist'] },
    /* spec #105 (Owner, 2026-11-06): support Starter 48 hours / Pro inherits it (no line) / Max priority 24 hours, wording = T9 #102; brand kit stays Coming soon (undecided); early access is features only; batch upload Coming soon until T28 */
  };
  const FLAG = { pro: 'Recommended', max: 'Best value per credit' };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* opts.radio: selectable cards with a check (paywall). opts.cta: a button per tier (pricing page); Pro's is the page's one primary. */
  function renderTiers(opts = {}) {
    return Object.keys(P).map(id => {
      const pk = PERKS[id];
      const perks = `<span class="perks"><span class="perks-h">${pk.h}</span>${pk.live.map(x => `<span class="perk">${tick}${x}</span>`).join('')}` +
        (pk.soon.length ? `<span class="perks-h soon-h">Coming soon</span>${pk.soon.map(x => `<span class="perk soon">${x}</span>`).join('')}` : '') + '</span>';
      const flag = FLAG[id] ? `<span class="flag">${FLAG[id]}</span>` : '';
      const head = `<span class="row"><span><span class="nm">${P[id].name}</span>${flag}</span>${opts.radio ? `<span class="check">${tick}</span>` : ''}</span>`;
      const body = `${head}<span class="price"><span class="amt" data-p></span><span class="per">/mo</span><span class="was" data-was></span></span>
        <span class="facts"><span data-cr></span><span class="mono" data-each></span></span><span class="saving" data-save></span>${perks}`;
      if (opts.radio) return `<label class="tier t-${id}"><input type="radio" name="pick" value="${id}" ${opts.checked === id ? 'checked' : ''}><span class="card">${body}</span></label>`;
      const btn = id === 'pro' ? `<a class="btn btn-primary" href="create.html" data-tier="${id}">Choose ${P[id].name}</a>` : `<a class="btn btn-ghost" href="create.html" data-tier="${id}">Choose ${P[id].name}</a>`;
      return `<article class="tier t-${id}" data-tier="${id}"><div class="card">${body}<div class="act">${btn}</div></div></article>`;
    }).join('');
  }

  /* the Yearly half of the billing toggle carries the savings badge ("up to" is the largest of the three discounts, Max's 40%) */
  function renderSegBadge(seg) {
    const y = seg.querySelector('[data-v="y"]');
    if (y && !y.querySelector('.badge')) y.insertAdjacentHTML('beforeend', '<span class="badge">Save up to <b>40%</b></span>');
  }

  function fill(v) {
    document.querySelectorAll('.tier').forEach(el => {
      const id = el.dataset.tier || el.querySelector('input').value;
      const p = P[id];
      const [usd, cr, mo] = v === 'y' ? p.y : p.m;
      el.querySelector('[data-p]').textContent = money(v === 'y' ? mo : usd);
      el.querySelector('[data-was]').textContent = v === 'y' ? money(p.m[0]) : '';
      el.querySelector('[data-cr]').textContent = v === 'y' ? `${cr.toLocaleString('en-US')} credits a year · ${money(usd)} billed yearly` : `${cr} credits a month`;
      el.querySelector('[data-each]').textContent = '$' + (usd / cr).toFixed(2) + '/credit';
      const s = el.querySelector('[data-save]');
      s.hidden = v !== 'y';
      s.innerHTML = v === 'y' ? `<span>You save<span class="vs"> vs monthly</span></span><b>$${p.save} a year</b>` : '';
    });
  }
  /* the numbers crossfade over 200ms (100 out, 100 in); the first paint is immediate */
  let painted = false;
  function paintTiers(v) {
    const roots = document.querySelectorAll('.tiers');
    if (!painted || reduce.matches) { painted = true; fill(v); return; }
    roots.forEach(r => r.classList.add('swapping'));
    setTimeout(() => { fill(v); roots.forEach(r => r.classList.remove('swapping')); }, 100);
  }

  /* motion: cards reveal with a 40ms stagger once in view; Pro and Max sweep a sheen once on reveal and once per hover */
  function sheenOnce(tier) {
    if (reduce.matches || tier.classList.contains('sheen-once')) return;
    tier.classList.add('sheen-once');
    tier.querySelector('.card').addEventListener('animationend', () => tier.classList.remove('sheen-once'), { once: true });
  }
  function motion(root = document) {
    root.querySelectorAll('.tiers, .packs').forEach(c => {
      c.classList.add('stagger');
      [...c.children].forEach((el, i) => el.style.setProperty('--d', reduce.matches ? '0ms' : (i * 40) + 'ms'));
      const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting) return; io.disconnect(); c.classList.add('in');
        c.querySelectorAll('.t-pro, .t-max').forEach((t, i) => setTimeout(() => sheenOnce(t), 420 + i * 120)); }, { threshold: 0.2 });
      io.observe(c);
    });
    if (matchMedia('(hover: hover)').matches) root.querySelectorAll('.t-pro, .t-max').forEach(t => t.addEventListener('pointerenter', () => sheenOnce(t)));
  }

  window.TIERS = { P, PK, money, renderTiers, renderSegBadge, paintTiers, motion };
})();
