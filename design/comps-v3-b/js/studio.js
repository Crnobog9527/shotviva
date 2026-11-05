/* Shotviva v3-b shared behaviour: template data, cards, bottom sheets, compare, framed preview chrome. */
(function () {
  const IMG = '../assets/img/';
  const q = new URLSearchParams(location.search);

  /* Board / capture framing: draws an iOS status bar + home indicator and sets safe-area insets. */
  if (q.get('frame') === '2') document.documentElement.classList.add('inset'); // insets only, no faux chrome (page shown behind a sheet)
  if (q.get('frame') === '1') {
    document.documentElement.classList.add('framed');
    document.addEventListener('DOMContentLoaded', () => {
      const sb = document.createElement('div');
      sb.className = 'statusbar'; sb.setAttribute('aria-hidden', 'true');
      sb.innerHTML = '<span>9:41</span><span class="island"></span><span class="sys">' +
        '<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
        '<svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.6c2.3 0 4.4.9 6 2.4l1.1-1.2A10.2 10.2 0 0 0 8 1 10.2 10.2 0 0 0 .9 3.8L2 5c1.6-1.5 3.7-2.4 6-2.4Zm0 3.3c1.4 0 2.6.5 3.6 1.4l1.1-1.2A7 7 0 0 0 8 4.3a7 7 0 0 0-4.7 1.8l1.1 1.2c1-.9 2.2-1.4 3.6-1.4Zm0 3.3c.5 0 1 .2 1.3.5L8 11 6.7 9.7c.3-.3.8-.5 1.3-.5Z"/></svg>' +
        '<svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x=".5" y=".5" width="23" height="12" rx="3.5" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".4"/></svg></span>';
      document.body.prepend(sb);
      const hb = document.createElement('div'); hb.className = 'homebar'; hb.setAttribute('aria-hidden', 'true');
      document.body.append(hb);
    });
  }

  const T = [
    { id: 'pure-white',      name: 'Pure White',      cat: 'products', use: 'Marketplace' },
    { id: 'lifestyle-table', name: 'Lifestyle Table', cat: 'products', use: 'Shop & social' },
    { id: 'bright-listing',  name: 'Bright Listing',  cat: 'rooms',    use: 'Rental listings' },
    { id: 'evening-glow',    name: 'Evening Glow',    cat: 'rooms',    use: 'Rooms & stays', media: 'video' },
    { id: 'spa-podium',      name: 'Spa Podium',      cat: 'beauty',   use: 'Beauty products' },
    { id: 'pet-studio',      name: 'Pet Studio',      cat: 'pets',     use: 'Pet portraits', media: 'anim' },
    { id: 'korean-manhwa',   name: 'Korean Manhwa',   cat: 'art',      use: 'Webtoon portraits', media: 'video' },
    { id: 'delivery-photo',  name: 'Delivery Menu',   cat: 'food',     use: 'Delivery apps' },
    { id: 'dark-dining',     name: 'Dark Dining',     cat: 'food',     use: 'Specials & social' },
    { id: 'promo-poster',    name: 'Promo Poster',    cat: 'food',     use: 'Promos & specials' },
  ];
  const CATS = [
    { id: 'art', name: 'Art Styles' }, { id: 'food', name: 'Food & Drink' }, { id: 'products', name: 'Products & Resale' },
    { id: 'beauty', name: 'Beauty & Skincare' }, { id: 'rooms', name: 'Rooms & Spaces' }, { id: 'pets', name: 'Pets' },
  ];

  const ICON = {
    play: '<svg class="i" viewBox="0 0 24 24"><path class="fill" d="M8 5.5v13l11-6.5z"/></svg>',
    anim: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
    x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  function media(t, cls) {
    const motion = t.media ? `<span class="type" aria-label="${t.media === 'video' ? 'Video template' : 'Animated template'}">${t.media === 'video' ? ICON.play : ICON.anim}</span>` : '';
    return `<span class="tpl-media ${cls || ''}">
      <img class="b" src="${IMG}${t.id}-before.webp" alt="" loading="lazy">
      <img class="a" src="${IMG}${t.id}-after.webp" alt="${t.name} template, illustrative example: phone photo on the left, AI result on the right" loading="lazy">
      <span class="seam" aria-hidden="true"></span>
      <span class="tag l" aria-hidden="true">Phone</span><span class="tag r" aria-hidden="true">AI</span>${motion}
    </span>`;
  }
  function card(t) {
    return `<button class="tpl" type="button" data-tpl="${t.id}" aria-haspopup="dialog">
      ${media(t)}
      <span class="tpl-meta"><span class="name">${t.name}</span><span class="use">${t.use}</span><span class="cost">from 2 credits</span></span>
    </button>`;
  }

  /* ---------- bottom sheet with drag-to-dismiss ---------- */
  function makeSheet(sheet, scrim, opts = {}) {
    let startY = 0, dy = 0, t0 = 0, dragging = false;
    const grab = sheet.querySelector('.sheet-grab');
    const body = sheet.querySelector('.sheet-body');
    let lastFocus = null;
    function open() {
      lastFocus = document.activeElement;
      sheet.hidden = false; scrim.hidden = false; sheet.inert = false;
      requestAnimationFrame(() => { sheet.classList.add('open'); scrim.classList.add('open'); });
      sheet.setAttribute('aria-hidden', 'false');
      setTimeout(() => (sheet.querySelector('[data-autofocus]') || sheet).focus({ preventScroll: true }), 50);
    }
    function close() {
      sheet.style.transform = ''; sheet.classList.remove('open'); scrim.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true'); sheet.inert = true;
      if (opts.onClose) opts.onClose();
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    function down(e) {
      // drag from the grab handle, or from anywhere while the content is scrolled to top
      if (e.target.closest('input, textarea, .compare, .rail, button, label, a') && !e.target.closest('.sheet-grab')) return;
      if (!e.target.closest('.sheet-grab') && body && body.scrollTop > 0) return;
      dragging = true; startY = e.clientY; dy = 0; t0 = performance.now();
      sheet.classList.add('dragging');
      sheet.setPointerCapture && sheet.setPointerCapture(e.pointerId);
    }
    function move(e) {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      if (dy < 4) return;
      sheet.style.transform = `translateY(${dy}px)`;
      scrim.style.opacity = String(Math.max(0, 1 - dy / 500));
    }
    function up() {
      if (!dragging) return;
      dragging = false; sheet.classList.remove('dragging'); scrim.style.opacity = '';
      const v = dy / Math.max(1, performance.now() - t0);
      if (dy > 120 || v > 0.6) close(); else sheet.style.transform = '';
    }
    sheet.addEventListener('pointerdown', down);
    sheet.addEventListener('pointermove', move);
    sheet.addEventListener('pointerup', up);
    sheet.addEventListener('pointercancel', up);
    if (grab) grab.addEventListener('click', () => {});
    scrim.addEventListener('click', () => !opts.sticky && close());
    sheet.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) close(); });
    return { open, close };
  }

  function bindCompare(root) {
    root.querySelectorAll('.compare input[type=range]').forEach(r => {
      const c = r.closest('.compare');
      const set = () => c.style.setProperty('--x', r.value + '%');
      r.addEventListener('input', set); set();
    });
  }

  /* ---------- template preview sheet ---------- */
  function previewSheet(onUse) {
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.hidden = true;
    const sh = document.createElement('section');
    sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'pv-title'); sh.tabIndex = -1; sh.hidden = true;
    sh.innerHTML = `<div class="sheet-grab" aria-hidden="true"></div>
      <button class="sheet-x" type="button" data-close aria-label="Close"><span>${ICON.x}</span></button>
      <div class="sheet-body">
                <h2 id="pv-title" style="font:400 32px/1.05 var(--font-display);margin:2px 48px 4px 0"></h2>
        <p class="muted" id="pv-use" style="font-size:14px;margin-bottom:14px"></p>
        <div id="pv-media"></div>
        <p class="muted" id="pv-hint" style="font-size:14px;margin:10px 2px 0"></p>
        <dl class="pv-spec" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0 18px">
          <div class="pv-c"><dt>Standard</dt><dd class="mono">2 credits</dd></div>
          <div class="pv-c"><dt>HD</dt><dd class="mono">4 credits</dd></div>
          <div class="pv-c"><dt>Max</dt><dd class="mono">6 credits</dd></div>
        </dl>
        <button class="btn btn-primary" type="button" id="pv-use-btn">Use this template</button>
      </div>`;
    document.body.append(scrim, sh);
    const style = document.createElement('style');
    style.textContent = `.pv-c{margin:0;padding:10px 12px;border-radius:12px;background:rgba(242,236,227,.04);box-shadow:inset 0 0 0 1px var(--border)}.pv-c dt{font-size:14px;color:var(--muted-foreground)}.pv-c dd{margin:5px 0 0;font-size:14px}`;
    document.head.append(style);
    const api = makeSheet(sh, scrim, { onClose: () => { const v = sh.querySelector('video'); v && v.pause(); } });
    let current = null;
    sh.querySelector('#pv-use-btn').addEventListener('click', () => { api.close(); onUse && onUse(current); });
    return function show(id) {
      const t = T.find(x => x.id === id); current = t;
      sh.querySelector('#pv-title').textContent = t.name;
      sh.querySelector('#pv-use').textContent = CATS.find(c => c.id === t.cat).name + ' · ' + t.use;
      const m = sh.querySelector('#pv-media');
      if (t.media === 'video') {
        m.innerHTML = `<div class="compare"><video data-src="../assets/video/${t.id}.mp4" poster="${IMG}${t.id}-split.webp" muted loop playsinline preload="none" aria-label="${t.name} example video: phone photo wiping to the AI result"></video>
          <span class="badge-illus">Illustrative example</span></div>`;
        sh.querySelector('#pv-hint').textContent = 'Video template: the photo plays as a short muted loop.';
      } else if (t.media === 'anim') {
        m.innerHTML = `<div class="compare"><img src="${IMG}${t.id}-anim.webp" alt="${t.name} example animation, illustrative"><span class="badge-illus">Illustrative example</span></div>`;
        sh.querySelector('#pv-hint').textContent = 'Animated template: delivered as a short animated image.';
      } else {
        m.innerHTML = `<div class="compare"><img src="${IMG}${t.id}-before.webp" alt="Phone photo, illustrative example"><img class="after" src="${IMG}${t.id}-after.webp" alt="${t.name} result, illustrative example">
          <span class="handle" aria-hidden="true"></span><span class="tag l">Phone</span><span class="tag r">AI</span><span class="badge-illus">Illustrative example</span>
          <input type="range" min="0" max="100" value="50" aria-label="Compare phone photo and AI result"></div>`;
        sh.querySelector('#pv-hint').textContent = 'Drag across the photo to compare.';
        bindCompare(m);
      }
      api.open();
    };
  }

  window.SV = { T, CATS, ICON, card, media, makeSheet, previewSheet, bindCompare, q };
})();

// Quiet Loop: muted, looping, inline, no controls. The file loads after page load and only once the
// video is at least half in view; it pauses when it leaves. Reduced motion keeps the poster only.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const loaded = new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
  const io = new IntersectionObserver(es => es.forEach(async ({ target: v, isIntersecting }) => {
    if (!isIntersecting || reduce.matches) { v.pause(); return; }
    await loaded;
    if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.load(); }
    v.play().catch(() => { v.removeAttribute('src'); v.load(); });
  }), { threshold: 0.5 });
  const watch = root => root.querySelectorAll('video[data-src]').forEach(v => { if (!v.dataset.watched) { v.dataset.watched = '1'; v.muted = true; io.observe(v); } });
  const start = () => { watch(document); new MutationObserver(() => watch(document)).observe(document.body, { childList: true, subtree: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  reduce.addEventListener('change', () => { if (reduce.matches) document.querySelectorAll('video').forEach(v => v.pause()); });
})();
