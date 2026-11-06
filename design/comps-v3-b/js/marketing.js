/* Shotviva v3-b · marketing behaviour (home, pricing). Round 3.
   Reveal on enter, pointer hover helpers, the side-by-side pair markup, the template picker dialog, the sign-up opener.
   Depends on window.SV (studio.js) for template data and makeSheet. */
(function () {
  document.documentElement.classList.add('js');
  const IMG = '../assets/img/';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- reveal: fade-up once; children of [data-reveal-group] stagger 40ms ---------- */
  function reveal(root = document) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target; io.unobserve(el);
      el.classList.add('is-in');
      el.addEventListener('transitionend', () => el.classList.add('settled'), { once: true });
      if (reduce.matches) el.classList.add('settled');
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    root.querySelectorAll('[data-reveal-group]').forEach(g => {
      [...g.children].forEach((c, i) => { if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', ''); if (!reduce.matches) c.style.setProperty('--d', (i * 40) + 'ms'); });
    });
    root.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
    // anything already settled or hidden (e.g. a sheet) must not stay invisible
    setTimeout(() => root.querySelectorAll('[data-reveal]:not(.is-in)').forEach(el => { const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top < innerHeight) el.classList.add('is-in', 'settled'); }), 1200);   // above, or already on screen but inside the observer's bottom margin (tall capture viewports)
  }

  /* ---------- the pair: phone photo left, AI result right ---------- */
  const ICON = window.SV.ICON;
  /* no media-type badge on any card (round 3): a template's type is words in its meta line, never a glyph on the photo */
  function pair(t, cls = '', opts = {}) {
    const motion = '';
    return `<span class="pair ${cls}">
      <img class="b" src="${IMG}${t.id}-before.webp" alt="" loading="lazy" width="900" height="1125">
      <img class="a" src="${IMG}${t.id}-after.webp" alt="${t.name} template, illustrative example: phone photo on the left, AI result on the right" loading="lazy" width="900" height="1125">
      <span class="hl" aria-hidden="true"></span>
      <span class="tag l" aria-hidden="true">Phone</span><span class="tag r" aria-hidden="true">AI</span>${motion}${opts.badge ? '<span class="badge-illus">Illustrative example</span>' : ''}
    </span>`;
  }
  function pairCard(t) {
    return `<button class="tpl" type="button" data-pick="${t.id}" aria-label="${t.name}, ${t.use}. Pick this template">
      ${pair(t)}
      <span class="tpl-meta"><span class="name">${t.name}</span><span class="use">${t.use}</span><span class="cost">from 2 credits</span></span>
    </button>`;
  }
  /* the one draggable compare on the site: art-style transfer */
  function compare(t) {
    return `<div class="compare nudge"><img src="${IMG}${t.id}-before.webp" alt="Phone photo, illustrative example"><img class="after" src="${IMG}${t.id}-after.webp" alt="${t.name} result, illustrative example">
      <span class="handle" aria-hidden="true"></span><span class="tag l">Phone</span><span class="tag r">AI</span><span class="badge-illus">Illustrative example</span>
      <input type="range" min="0" max="100" value="50" aria-label="Compare phone photo and AI result"></div>`;
  }

  /* ---------- template picker: sample left, list right, one primary ---------- */
  function picker(onPick) {
    const { T, CATS, makeSheet, bindCompare } = window.SV;
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.hidden = true;
    const sh = document.createElement('section');
    sh.className = 'sheet picker'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'pk-title'); sh.tabIndex = -1; sh.hidden = true;
    const rows = CATS.map(c => `<div class="pk-cat">${c.name}</div>` + T.filter(t => t.cat === c.id).map(t =>
      `<label class="pk-row"><input type="radio" name="pk" value="${t.id}"><img class="th" src="${IMG}${t.id}-after.webp" alt="" loading="lazy"><span class="t"><b>${t.name}</b><small>${t.use}</small></span><span class="cost">from 2 credits</span></label>`).join('')).join('');
    sh.innerHTML = `<div class="sheet-grab" aria-hidden="true"></div>
      <button class="sheet-x" type="button" data-close aria-label="Close"><span>${ICON.x}</span></button>
      <div class="sheet-body">
        <div class="pk-sample" id="pk-sample"></div>
        <div class="pk-side">
          <h2 id="pk-title" class="sheet-title">Pick a template</h2>
          <p class="muted">Phone photo on the left, the AI result on the right. Your subject stays as shot.</p>
          <div class="pk-list" role="radiogroup" aria-label="Templates">${rows}</div>
          <div class="pk-go"><button class="btn btn-primary" type="button" id="pk-use"></button></div>
        </div>
      </div>`;
    document.body.append(scrim, sh);
    const api = makeSheet(sh, scrim);
    let current = null;
    function paint(t) {
      current = t;
      const m = sh.querySelector('#pk-sample');
      const cat = CATS.find(c => c.id === t.cat).name;
      if (t.cat === 'art') { m.innerHTML = compare(t) + `<p class="cap">${cat} · drag across the photo to compare</p>`; bindCompare(m); }
      else m.innerHTML = pair(t, 'lg', { badge: true }) + `<p class="cap">${cat} · ${t.use} · Illustrative example</p>`;
      sh.querySelector('#pk-use').textContent = `Pick ${t.name}`;
    }
    sh.querySelector('.pk-list').addEventListener('change', e => { const t = T.find(x => x.id === e.target.value); if (t) paint(t); });
    sh.querySelector('#pk-use').addEventListener('click', () => { api.close(); onPick && onPick(current); });
    return function open(id) {
      const t = T.find(x => x.id === id) || T[0];
      const r = sh.querySelector(`input[value="${t.id}"]`); if (r) r.checked = true;
      paint(t); api.open();
      // bring the chosen row into view by scrolling only its own scroll box (the list on desktop, the side column on the phone)
      setTimeout(() => {
        if (!r) return;
        const row = r.closest('.pk-row'), box = matchMedia('(min-width: 768px)').matches ? sh.querySelector('.pk-list') : sh.querySelector('.pk-side');
        const b = box.getBoundingClientRect(), rr = row.getBoundingClientRect(), pad = 72;
        if (rr.bottom > b.bottom - pad) box.scrollTop += rr.bottom - (b.bottom - pad);
        else if (rr.top < b.top) box.scrollTop -= b.top - rr.top;
      }, 60);
    };
  }

  /* ---------- sign-up sheet: any [data-signup] opens it ---------- */
  function signup() {
    const el = document.getElementById('su'), sc = document.getElementById('su-scrim');
    if (!el || !sc) return null;
    const su = window.SV.makeSheet(el, sc);
    document.querySelectorAll('[data-signup]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); su.open(); }));
    if (window.SV.q.get('signup') === '1') setTimeout(() => su.open(), 300);
    return su;
  }


  /* language suggestion: one line above the nav when the browser prefers Chinese (never a redirect); the × remembers the choice.
     Comp: ?lang=zh shows it. */
  function langBanner() {
    const bar = document.createElement('div');
    bar.className = 'lang-bar'; bar.setAttribute('role', 'status'); bar.setAttribute('lang', 'zh-CN');
    bar.innerHTML = `<span>Shotviva 有简体中文版。</span><a href="/zh" hreflang="zh-CN">切换到中文</a><button type="button" aria-label="关闭"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    const appbar = document.querySelector('.appbar');
    appbar.parentNode.insertBefore(bar, appbar);
    document.body.classList.add('has-bar');
    const onScroll = () => appbar.classList.toggle('stuck', scrollY > bar.offsetHeight - 1);
    addEventListener('scroll', onScroll, { passive: true });
    bar.querySelector('button').addEventListener('click', () => { bar.remove(); document.body.classList.remove('has-bar'); appbar.classList.remove('stuck'); removeEventListener('scroll', onScroll); });
  }
  if (new URLSearchParams(location.search).get('lang') === 'zh') document.addEventListener('DOMContentLoaded', langBanner);

  /* the globe menu: toggles, closes on outside click or Escape, arrow keys move between the two items; ?menu=lang opens it for review */
  function langMenu() {
    document.querySelectorAll('.lang-menu').forEach(wrap => {
      const btn = wrap.querySelector('[data-lang-btn]'), menu = wrap.querySelector('[role="menu"]');
      const items = () => [...menu.querySelectorAll('[role="menuitemradio"]')];
      const set = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) items()[0].focus(); };
      btn.addEventListener('click', () => set(menu.hidden));
      document.addEventListener('click', e => { if (!wrap.contains(e.target)) set(false); });
      wrap.addEventListener('keydown', e => {
        if (e.key === 'Escape') { set(false); btn.focus(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const it = items(), i = it.indexOf(document.activeElement); it[(i + (e.key === 'ArrowDown' ? 1 : it.length - 1)) % it.length].focus(); }
      });
      if (new URLSearchParams(location.search).get('menu') === 'lang') set(true);
    });
  }
  document.addEventListener('DOMContentLoaded', langMenu);
  window.MK = { reveal, pair, pairCard, compare, picker, signup, langBanner, langMenu };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => reveal()) : reveal();
})();
