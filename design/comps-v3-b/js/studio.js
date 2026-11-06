/* Shotviva v3-b shared behaviour: template data, cards, bottom sheets, compare, the creation form + dialog,
   hover-play, reveal, framed preview chrome. */
(function () {
  const IMG = '../assets/img/';
  const q = new URLSearchParams(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const frame = () => (document.documentElement.classList.contains('framed') ? '&frame=1' : '');

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
    { id: 'pure-white',      name: 'Pure White',      cat: 'products', use: 'Marketplace',       desc: 'Clean white background, soft shadow, catalogue-ready.' },
    { id: 'lifestyle-table', name: 'Lifestyle Table', cat: 'products', use: 'Shop & social',     desc: 'Your product on a styled table in warm daylight.' },
    { id: 'bright-listing',  name: 'Bright Listing',  cat: 'rooms',    use: 'Rental listings',   desc: 'A brighter, straighter room photo for listings.' },
    { id: 'evening-glow',    name: 'Evening Glow',    cat: 'rooms',    use: 'Rooms & stays',     desc: 'Lamps on, blue hour outside, the room at its best.', media: 'video' },
    { id: 'spa-podium',      name: 'Spa Podium',      cat: 'beauty',   use: 'Beauty products',   desc: 'Skincare on a stone podium in soft spa light.' },
    { id: 'pet-studio',      name: 'Pet Studio',      cat: 'pets',     use: 'Pet portraits',     desc: 'A studio portrait of your pet on a plain backdrop.', media: 'anim' },
    { id: 'korean-manhwa',   name: 'Korean Manhwa',   cat: 'art',      use: 'Webtoon portraits', desc: 'Your photo redrawn as a Korean webtoon panel.', media: 'video' },
    { id: 'delivery-photo',  name: 'Delivery Menu',   cat: 'food',     use: 'Delivery apps',     desc: 'A bright, appetising dish photo for delivery apps.' },
    { id: 'dark-dining',     name: 'Dark Dining',     cat: 'food',     use: 'Specials & social', desc: 'Moody restaurant light for specials and social.' },
    { id: 'promo-poster',    name: 'Promo Poster',    cat: 'food',     use: 'Promos & specials', desc: 'Your dish set into a ready-to-post promo poster.' },
  ];
  const CATS = [
    { id: 'art', name: 'Art Styles' }, { id: 'food', name: 'Food & Drink' }, { id: 'products', name: 'Products & Resale' },
    { id: 'beauty', name: 'Beauty & Skincare' }, { id: 'rooms', name: 'Rooms & Spaces' }, { id: 'pets', name: 'Pets' },
  ];
  const catName = t => CATS.find(c => c.id === t.cat).name;

  const ICON = {
    play: '<svg class="i" viewBox="0 0 24 24"><path class="fill" d="M8 5.5v13l11-6.5z"/></svg>',
    anim: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
    x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    tick: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chev: '<svg class="i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    info: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 16h.01"/></svg>',
    eye: '<svg class="i" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    replace: '<svg class="i" viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/></svg>',
    camera: '<svg class="i" viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    gallery: '<svg class="i" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M3.5 15l4.5-4.5 4.5 4.5 2.5-2.5 5.5 5.5"/><circle cx="15.5" cy="9" r="1.5"/></svg>',
  };
  const typeHint = t => (t.media === 'video' ? ' · video' : t.media === 'anim' ? ' · animated' : '');   // text, never a play badge

  /* The split media (4:5, after clipped to the right half). Kept for the homepage rails. */
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

  /* The pair: phone photo left, AI result right, side by side in one frame (the rule for every template
     except art-style transfer). o.live adds the hover-play layers; o.video plays the template loop in the
     right plate; o.badge adds "Illustrative example"; o.lg is the dialog size. */
  function pair(t, o = {}) {
    const alt = `${t.name} template, illustrative example: your phone photo on the left, the AI result on the right`;
    const vid = o.video && t.media === 'video'
      ? `<video ${o.live ? 'data-hover' : ''} data-src="../assets/video/${t.id}.mp4" poster="${IMG}${t.id}-after.webp" muted loop playsinline preload="none" aria-hidden="true"></video>` : '';
    return `<span class="pair ${o.lg ? 'lg' : ''} ${o.live ? 'live' : ''}">
      <span class="pane"><img class="b" src="${IMG}${t.id}-before.webp" alt="" loading="lazy"><span class="tag l" aria-hidden="true">Phone</span></span>
      <span class="pane">${o.live ? `<img class="ph" src="${IMG}${t.id}-before.webp" alt="" loading="lazy">` : ''}<img class="a" src="${IMG}${t.id}-after.webp" alt="${alt}" loading="lazy">${vid}${o.live ? '<span class="ws" aria-hidden="true"></span>' : ''}<span class="tag r" aria-hidden="true">AI</span></span>
      ${o.badge ? '<span class="badge-illus">Illustrative example</span>' : ''}
    </span>`;
  }
  /* The drag compare, for art-style templates only. */
  function compare(t, o = {}) {
    return `<div class="compare">
      <img src="${IMG}${t.id}-before.webp" alt="Phone photo, illustrative example" loading="lazy"><img class="after" src="${IMG}${t.id}-after.webp" alt="${t.name} result, illustrative example" loading="lazy">
      <span class="handle" aria-hidden="true"></span><span class="tag l" aria-hidden="true">Phone</span><span class="tag r" aria-hidden="true">AI</span>${o.badge ? '<span class="badge-illus">Illustrative example</span>' : ''}
      <input type="range" min="0" max="100" value="50" aria-label="Compare the phone photo and the ${t.name} result"></div>`;
  }
  const metaHTML = (t, use) => `<span class="tpl-meta"><span class="name">${t.name}</span><span class="use">${use || t.use}</span><span class="cost">from 2 credits</span></span>`;
  /* Create-grid card: one button around the pair; the art card is a div (the compare's range input lives inside)
     whose meta is the button that opens. No card carries a play badge: hover / viewport play is the only signal,
     the media type is a word in the meta line. */
  function pairCard(t) {
    if (t.cat === 'art') {
      return `<div class="tpl art" data-tpl="${t.id}">
        ${compare(t)}
        <button class="tpl-open" type="button" data-open="${t.id}" aria-haspopup="dialog">${metaHTML(t, t.use + ' · drag to compare')}</button>
      </div>`;
    }
    return `<button class="tpl pr" type="button" data-tpl="${t.id}" data-open="${t.id}" aria-haspopup="dialog">
      ${pair(t, { live: true, video: true })}
      ${metaHTML(t, t.use + typeHint(t))}
    </button>`;
  }

  /* ---------- bottom sheet with drag-to-dismiss ---------- */
  function makeSheet(sheet, scrim, opts = {}) {
    let startY = 0, dy = 0, t0 = 0, dragging = false;
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
    const desktop = matchMedia('(min-width: 768px)');
    function down(e) {
      // phone only: drag from the grab handle, or from anywhere while the content is scrolled to top
      if (desktop.matches) return;
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

  /* ---------- template preview sheet (homepage): sample + price strip + "Use this template" ---------- */
  function previewSheet(onUse) {
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.hidden = true;
    const sh = document.createElement('section');
    sh.className = 'sheet pv'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'pv-title'); sh.tabIndex = -1; sh.hidden = true;
    sh.innerHTML = `<div class="sheet-grab" aria-hidden="true"></div>
      <button class="sheet-x" type="button" data-close aria-label="Close"><span>${ICON.x}</span></button>
      <div class="sheet-body">
                <h2 id="pv-title" class="sheet-title"></h2>
        <p class="muted" id="pv-use"></p>
        <div id="pv-media"></div>
        <p class="muted" id="pv-hint"></p>
        <dl class="pv-spec">
          <div class="pv-c"><dt>Standard</dt><dd class="mono">2 credits</dd></div>
          <div class="pv-c"><dt>HD</dt><dd class="mono">4 credits</dd></div>
          <div class="pv-c"><dt>Max</dt><dd class="mono">6 credits</dd></div>
        </dl>
        <button class="btn btn-primary" type="button" id="pv-use-btn">Use this template</button>
      </div>`;
    document.body.append(scrim, sh);
    const style = document.createElement('style');
    /* the .pair rules below mirror css/app.css for pages that do not load it (home) */
    style.textContent = `#pv-use{font-size:14px;margin-bottom:12px}#pv-hint{font-size:14px;margin:8px 2px 0}
      .pv-spec{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0 16px}
      .pv-c{margin:0;padding:8px 12px;border-radius:12px;background:var(--bone-4);box-shadow:inset 0 0 0 1px var(--border)}.pv-c dt{font-size:14px;color:var(--muted-foreground)}.pv-c dd{margin:4px 0 0;font-size:14px}
      .pv .pair{position:relative;display:grid;grid-template-columns:1fr 1fr;aspect-ratio:8/5;border-radius:20px;overflow:hidden;background:var(--muted);box-shadow:inset 0 0 0 1px var(--border);isolation:isolate}
      .pv .pair .pane{position:relative;overflow:hidden}.pv .pair .pane+.pane{box-shadow:inset 1px 0 0 var(--input)}
      .pv .pair img,.pv .pair video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.pv .pair .b{filter:saturate(.85)}
      .pv .pair .tag{position:absolute;z-index:3;bottom:12px;height:28px;padding:0 10px;border-radius:8px;display:inline-flex;align-items:center;font:600 14px/1 var(--font-sans);color:var(--foreground);background:var(--photo-scrim);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
      .pv .pair .tag.l{left:12px}.pv .pair .tag.r{right:12px;background:color-mix(in srgb,var(--primary) 88%,transparent);color:var(--primary-foreground)}
      .pv .pair .badge-illus{left:12px;top:12px;bottom:auto}
      @media (min-width:768px){.sheet.pv{--dialog-w:880px}.pv .sheet-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto auto auto auto auto 1fr;column-gap:32px;align-items:start}
      .pv #pv-media{grid-column:1;grid-row:1 / span 6}.pv .sheet-body>:not(#pv-media){grid-column:2}.pv #pv-use{margin-bottom:0}.pv #pv-hint{margin-top:16px}.pv .pv-spec{margin:24px 0 24px}}`;
    document.head.append(style);
    const api = makeSheet(sh, scrim, { onClose: () => { const v = sh.querySelector('video'); v && v.pause(); } });
    let current = null;
    sh.querySelector('#pv-use-btn').addEventListener('click', () => { api.close(); onUse && onUse(current); });
    return function show(id) {
      const t = T.find(x => x.id === id); current = t;
      sh.querySelector('#pv-title').textContent = t.name;
      sh.querySelector('#pv-use').textContent = catName(t) + ' · ' + t.use;
      const m = sh.querySelector('#pv-media');
      if (t.cat === 'art') {
        m.innerHTML = compare(t, { badge: true });
        sh.querySelector('#pv-hint').textContent = 'Drag across the photo to compare.';
        bindCompare(m);
      } else {
        m.innerHTML = pair(t, { lg: true, badge: true, video: true });
        sh.querySelector('#pv-hint').textContent = t.media === 'video' ? 'The right side plays as a short muted loop.' : t.media === 'anim' ? 'Delivered as a short animated image.' : 'Phone photo on the left, the AI result on the right.';
      }
      api.open();
    };
  }

  /* ---------- the creation form: one source for the dialog (create.html) and the page (workspace.html) ---------- */
  const SIZES = [['Original', 'as shot', 0, 0], ['Banner', '16:9', 16, 9], ['Post', '4:5', 4, 5], ['Listing', '1:1', 1, 1], ['Story', '9:16', 9, 16], ['Rental', '3:2', 3, 2], ['Website', '4:3', 4, 3], ['Pin', '2:3', 2, 3]];
  function formHTML(t, p) {
    const sizes = SIZES.map(([n, r, w, h], i) => {
      let gw = 22, gh = 28;
      if (w) { const s = Math.min(34 / w, 30 / h); gw = Math.round(w * s); gh = Math.round(h * s); }
      return `<label class="opt"><input type="radio" name="${p}-size" value="${n}" ${i ? '' : 'checked'}><span class="size-tile"><span class="glyph"><i class="${w ? '' : 'orig'}" style="width:${gw}px;height:${gh}px"></i></span><b>${n}</b><small>${r}</small></span></label>`;
    }).join('');
    return `<div class="form" data-show="empty ready">
      <section class="sec" aria-labelledby="${p}-ph">
        <div class="sec-h"><h2 id="${p}-ph">Your photo</h2><span class="meas">4:5 · as shot</span></div>
        <div class="panel photo" data-show="ready">
          <div class="thumb"><img src="${IMG}${t.id}-before.webp" alt="Your uploaded photo (illustrative example)"></div>
          <div class="meta">
            <span class="ok"><span class="dot">${ICON.tick}</span>Uploaded</span>
            <p class="size">Compressed · 0.9 MB</p>
            <button class="btn btn-ghost btn-pill" type="button" data-go="empty">${ICON.replace}Replace photo</button>
          </div>
        </div>
        <div class="panel empty" data-show="empty">
          <div class="frame"><b>Add the photo you shot</b><span>JPG, PNG or WebP · up to 20MB</span></div>
          <div class="two">
            <button class="btn btn-ghost" type="button" data-go="ready">${ICON.camera}Take photo</button>
            <button class="btn btn-ghost" type="button" data-go="ready">${ICON.gallery}Choose from gallery</button>
          </div>
        </div>
      </section>
      <section class="sec">
        <label class="field-label" for="${p}-note">Anything to change? <span class="opt">(optional)</span></label>
        <textarea class="textarea" id="${p}-note" maxlength="300" rows="3" placeholder="e.g. keep the chain gold, soften the shadow" enterkeyhint="done" autocapitalize="sentences"></textarea>
        <p class="counter"><span data-cnt>0</span> / 300</p>
      </section>
      <section class="sec" aria-labelledby="${p}-sz">
        <div class="sec-h"><h2 id="${p}-sz">Size</h2><span class="meas" data-sz-now>Original</span></div>
        <div class="sizes" role="radiogroup" aria-labelledby="${p}-sz">${sizes}</div>
      </section>
      <section class="sec" aria-labelledby="${p}-rs">
        <div class="sec-h"><h2 id="${p}-rs">Resolution</h2></div>
        <div class="ress" role="radiogroup" aria-labelledby="${p}-rs">
          <label class="opt"><input type="radio" name="${p}-res" value="2" checked><span class="res"><span class="n">Standard <span class="px">1024 px</span></span><span class="u">Social &amp; delivery apps</span><span class="c">2<small>credits</small></span></span></label>
          <label class="opt"><input type="radio" name="${p}-res" value="4"><span class="res"><span class="n">HD <span class="px">2048 px</span></span><span class="u">Websites &amp; online stores</span><span class="c">4<small>credits</small></span></span></label>
          <label class="opt"><input type="radio" name="${p}-res" value="6"><span class="res"><span class="n">Max <span class="px">2880 px</span></span><span class="u">Print &amp; zoom</span><span class="c">6<small>credits</small></span></span></label>
        </div>
      </section>
      <p class="foot">${ICON.info}<span data-foot>You have 6 free credits.</span></p>
    </div>`;
  }
  /* The one primary and its notice line (the "empty ready" branch of the action bar). */
  function barHTML() {
    return `<p class="notice" data-notice>${ICON.eye}<span>This photo uses free credits: it's shown publicly with a watermark. <b>Paid credits make it private and watermark-free.</b></span></p>
      <a class="btn btn-primary" data-cta href="#">Generate <span class="cost">· 2 credits</span></a>`;
  }
  /* Wires a rendered form + bar inside root. o.state(s) switches the state root; o.onGenerate() runs when the
     primary is pressed with enough credits; o.onCost(n) hears every cost change; o.balance is the credit balance. */
  function bindForm(root, p, o = {}) {
    const bal = o.balance ?? 6;
    const cta = root.querySelector('[data-cta]'), notice = root.querySelector('[data-notice] span'), foot = root.querySelector('[data-foot]');
    const cost = () => +root.querySelector(`input[name="${p}-res"]:checked`).value;
    function update() {
      const c = cost();
      if (c > bal) {
        cta.classList.add('need');
        cta.innerHTML = `Get credits <span class="cost">· ${c - bal} needed</span>`;
        cta.href = 'paywall.html' + (frame() ? '?frame=1' : '');
        notice.innerHTML = `This needs ${c} credits and you have ${bal}. <b>Paid credits make photos private and watermark-free.</b>`;
      } else {
        cta.classList.remove('need');
        cta.innerHTML = `Generate <span class="cost">· ${c} credits</span>`;
        cta.href = '#';
        notice.innerHTML = `This photo uses free credits: it's shown publicly with a watermark. <b>Paid credits make it private and watermark-free.</b>`;
      }
      foot.textContent = bal > 0 ? `You have ${bal} free credits.` : 'You have 0 credits left.';
      o.onCost && o.onCost(c);
    }
    root.querySelectorAll(`input[name="${p}-res"]`).forEach(r => r.addEventListener('change', update));
    root.querySelectorAll(`input[name="${p}-size"]`).forEach(r => r.addEventListener('change', e => { root.querySelector('[data-sz-now]').textContent = e.target.value + ' · ' + SIZES.find(s => s[0] === e.target.value)[1]; }));
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => o.state && o.state(b.dataset.go)));
    const note = root.querySelector(`#${p}-note`);
    note.addEventListener('input', () => root.querySelector('[data-cnt]').textContent = note.value.length);
    cta.addEventListener('click', e => { if (!cta.classList.contains('need')) { e.preventDefault(); o.onGenerate && o.onGenerate(cost()); } });
    update();
    return { update, cost };
  }

  /* ---------- creation dialog: sample left, make right; a full-height sheet on the phone ---------- */
  function createDialog(o = {}) {
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.hidden = true;
    const sh = document.createElement('section');
    sh.className = 'sheet cd'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'cd-title'); sh.tabIndex = -1; sh.hidden = true;
    sh.dataset.state = 'empty';
    sh.innerHTML = `<div class="sheet-grab" aria-hidden="true"></div>
      <button class="sheet-x" type="button" data-close aria-label="Close"><span>${ICON.x}</span></button>
      <div class="cd-body">
        <div class="cd-sample">
          <div class="cd-head"><h2 id="cd-title" class="sheet-title"></h2></div>
          <p class="cd-use" id="cd-use"></p>
          <div class="cd-media" id="cd-media"></div>
          <p class="cd-hint" id="cd-hint"></p>
        </div>
        <div class="cd-form">
          <div class="sheet-body" id="cd-scroll"></div>
          <div class="cd-bar" id="cd-bar"></div>
        </div>
      </div>`;
    document.body.append(scrim, sh);
    const api = makeSheet(sh, scrim, { onClose: () => { sh.querySelectorAll('video').forEach(v => v.pause()); o.onClose && o.onClose(); } });
    let current = null;
    const setState = s => { sh.dataset.state = s; sh.querySelector('#cd-scroll').scrollTop = 0; };
    function show(id, state) {
      const t = T.find(x => x.id === id); current = t;
      sh.querySelector('#cd-title').textContent = t.name;
      sh.querySelector('#cd-use').textContent = catName(t) + ' · ' + t.desc;
      const m = sh.querySelector('#cd-media');
      m.classList.toggle('is-compare', t.cat === 'art');
      m.innerHTML = t.cat === 'art' ? compare(t, { badge: true }) : pair(t, { lg: true, badge: true, video: true });
      sh.querySelector('#cd-hint').textContent = t.cat === 'art' ? 'Drag across the photo to compare.' : t.media === 'video' ? 'The right side plays as a short muted loop.' : 'Phone photo on the left, the AI result on the right.';
      if (t.cat === 'art') bindCompare(m);
      sh.querySelector('#cd-scroll').innerHTML = formHTML(t, 'cd');
      sh.querySelector('#cd-bar').innerHTML = barHTML();
      bindForm(sh, 'cd', { balance: o.balance, state: setState, onGenerate: () => { api.close(); o.onGenerate && o.onGenerate(t); } });
      setState(state === 'ready' ? 'ready' : 'empty');
      api.open();
    }
    return { show, close: api.close, get current() { return current; } };
  }

  /* ---------- edit panel (ARCHITECTURE §5.2 "作品编辑"): one required field, the resolution, the size fixed to the original.
     Same component as the creation dialog: a bottom sheet on the phone, the two-column dialog from 768 up. ---------- */
  const EDIT_TRIES = ['Put it on a café chair by the window', 'Make the background pale blue', 'Remove the chain strap'];
  function editFormHTML(ph, p) {
    const tries = EDIT_TRIES.map(t => `<button class="chip try" type="button" data-try="${t}">${t}</button>`).join('');
    const res = [['2', 'Standard', '1024 px', 'Social &amp; delivery apps'], ['4', 'HD', '2048 px', 'Websites &amp; online stores'], ['6', 'Max', '2880 px', 'Print &amp; zoom']]
      .map(([c, n, px, u]) => `<label class="opt"><input type="radio" name="${p}-res" value="${c}" ${c === String(ph.cost) ? 'checked' : ''}><span class="res"><span class="n">${n} <span class="px">${px}</span></span><span class="u">${u}</span><span class="c">${c}<small>credits</small></span></span></label>`).join('');
    return `<div class="form ed-form">
      <section class="sec">
        <label class="field-label" for="${p}-change">What would you like to change?</label>
        <textarea class="textarea" id="${p}-change" maxlength="500" rows="3" required placeholder="e.g. Make the sofa blue, put it on a beach, remove the price tag" enterkeyhint="done" autocapitalize="sentences" data-autofocus></textarea>
        <p class="counter"><span data-cnt>0</span> / 500</p>
        <p class="req" data-req hidden>Say what to change first.</p>
        <div class="tries" aria-label="Examples">${tries}</div>
      </section>
      <section class="sec" aria-labelledby="${p}-sz">
        <div class="sec-h"><h2 id="${p}-sz">Size</h2><span class="meas">${ph.size}</span></div>
        <p class="fixed">Same as the original. The framing stays; only what you ask for changes.</p>
      </section>
      <section class="sec" aria-labelledby="${p}-rs">
        <div class="sec-h"><h2 id="${p}-rs">Resolution</h2><span class="meas">${ph.resName}</span></div>
        <div class="ress" role="radiogroup" aria-labelledby="${p}-rs">${res}</div>
      </section>
      <p class="foot">${ICON.info}<span data-foot>You have 6 free credits.</span></p>
    </div>`;
  }
  /* The field is required: the primary stays dim until there is text; pressing it empty only points at the field. */
  function bindEditForm(root, p, o = {}) {
    const bal = o.balance ?? 6;
    const cta = root.querySelector('[data-cta]'), notice = root.querySelector('[data-notice] span'), foot = root.querySelector('[data-foot]');
    const field = root.querySelector(`#${p}-change`), cnt = root.querySelector('[data-cnt]'), req = root.querySelector('[data-req]');
    const cost = () => +root.querySelector(`input[name="${p}-res"]:checked`).value;
    const text = () => field.value.trim();
    function update() {
      const c = cost(), has = text().length > 0;
      cnt.textContent = field.value.length;
      if (has) req.hidden = true;
      if (c > bal) {
        cta.classList.add('need'); cta.setAttribute('aria-disabled', 'false');
        cta.innerHTML = `Get credits <span class="cost">· ${c - bal} needed</span>`;
        cta.href = 'paywall.html' + (frame() ? '?frame=1' : '');
        notice.innerHTML = `This needs ${c} credits and you have ${bal}. <b>Paid credits make photos private and watermark-free.</b>`;
      } else {
        cta.classList.remove('need'); cta.setAttribute('aria-disabled', has ? 'false' : 'true');
        cta.innerHTML = `Generate <span class="cost">· ${c} credits</span>`;
        cta.href = '#';
        notice.innerHTML = has ? `Makes a new photo; the original stays in Photos. <b>Uses free credits: public with a watermark.</b>` : `Write what to change, in any language. <b>The original is kept.</b>`;
      }
      foot.textContent = bal > 0 ? `You have ${bal} free credits.` : 'You have 0 credits left.';
    }
    root.querySelectorAll(`input[name="${p}-res"]`).forEach(r => r.addEventListener('change', update));
    field.addEventListener('input', update);
    root.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => { field.value = b.dataset.try; update(); field.focus(); }));
    cta.addEventListener('click', e => {
      if (cta.classList.contains('need')) return;
      e.preventDefault();
      if (!text()) { req.hidden = false; field.focus(); return; }
      o.onGenerate && o.onGenerate({ change: text(), cost: cost() });
    });
    update();
    return { update, cost, text, set(v) { field.value = v; update(); } };
  }
  function editDialog(o = {}) {
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.hidden = true;
    const sh = document.createElement('section');
    sh.className = 'sheet cd ed'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'ed-title'); sh.tabIndex = -1; sh.hidden = true;
    sh.innerHTML = `<div class="sheet-grab" aria-hidden="true"></div>
      <button class="sheet-x" type="button" data-close aria-label="Close"><span>${ICON.x}</span></button>
      <div class="cd-body">
        <div class="cd-sample">
          <div class="cd-head"><h2 id="ed-title" class="sheet-title">Edit this photo</h2></div>
          <p class="cd-use" id="ed-use"></p>
          <div class="cd-media" id="ed-media"></div>
          <p class="cd-hint">Say what to change. Everything else stays as it is.</p>
        </div>
        <div class="cd-form">
          <div class="sheet-body" id="ed-scroll"></div>
          <div class="cd-bar" id="ed-bar"></div>
        </div>
      </div>`;
    document.body.append(scrim, sh);
    const api = makeSheet(sh, scrim, { onClose: () => o.onClose && o.onClose() });
    /* ph: { name, meta, src, alt, size, resName, cost }; state 'typing' pre-fills the field for review */
    function show(ph, state, prefill) {
      sh.querySelector('#ed-use').textContent = ph.name + ' · ' + ph.meta;
      sh.querySelector('#ed-media').innerHTML = `<div class="ed-photo"><img src="${ph.src}" alt="${ph.alt}"><span class="tag l">This photo</span><span class="badge-illus">Illustrative example</span></div>`;
      sh.querySelector('#ed-scroll').innerHTML = editFormHTML(ph, 'ed');
      sh.querySelector('#ed-bar').innerHTML = barHTML();
      const f = bindEditForm(sh, 'ed', { balance: o.balance, onGenerate: r => { api.close(); o.onGenerate && o.onGenerate(r); } });
      if (state === 'typing') f.set(prefill || EDIT_TRIES[0]);
      sh.querySelector('#ed-scroll').scrollTop = 0;
      api.open();
    }
    return { show, close: api.close };
  }

  /* ---------- hover-play: the right plate develops from the phone photo to the AI result while hovered ---------- */
  const WIPE = { duration: 2900 }; // 1.6s wipe · .6s hold · .4s fade back · .3s reset
  const wipeFrames = {
    a: [
      { clipPath: 'inset(0 100% 0 0)', opacity: 1, offset: 0, easing: 'cubic-bezier(.45,0,.2,1)' },
      { clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: .55 },
      { clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: .76 },
      { clipPath: 'inset(0 0% 0 0)', opacity: 0, offset: .9 },
      { clipPath: 'inset(0 100% 0 0)', opacity: 0, offset: 1 },
    ],
    seam: [
      { left: '0%', opacity: 0, offset: 0, easing: 'cubic-bezier(.45,0,.2,1)' },
      { left: '0%', opacity: 1, offset: .02, easing: 'cubic-bezier(.45,0,.2,1)' },
      { left: '100%', opacity: 1, offset: .55 },
      { left: '100%', opacity: 0, offset: .58 },
      { left: '100%', opacity: 0, offset: 1 },
    ],
  };
  function hoverPlay(root, o = {}) {
    const hoverable = matchMedia('(hover: hover)');
    const running = new Map();
    function start(card, once, pauseAt) {
      if (reduce.matches || running.has(card)) return;
      const pr = card.querySelector('.pair.live'); if (!pr) return;
      const v = pr.querySelector('video[data-hover]');
      card.classList.add('playing');
      if (v) { // video templates: the loop itself, loaded on first hover, paused on leave (Quiet Loop rules)
        if (!v.src) { v.src = v.dataset.src; v.load(); }
        v.currentTime = 0; v.play().catch(() => {});
        running.set(card, { v, once });
        if (once) v.addEventListener('ended', () => stop(card), { once: true }), v.loop = false;
        return;
      }
      const a = pr.querySelector('.a'), s = pr.querySelector('.ws');
      const opt = { duration: WIPE.duration, iterations: once ? 1 : Infinity, fill: 'none' };
      const anims = [a.animate(wipeFrames.a, opt), s.animate(wipeFrames.seam, opt)];
      if (pauseAt != null) anims.forEach(x => { x.pause(); x.currentTime = pauseAt; });
      running.set(card, { anims, a, once });
      if (once) anims[0].onfinish = () => stop(card);
    }
    function stop(card) {
      const r = running.get(card); if (!r) return;
      running.delete(card); card.classList.remove('playing');
      if (r.v) { r.v.pause(); r.v.loop = true; return; }
      // settle back to rest from wherever the wipe was: a short fade, not a snap
      const cur = getComputedStyle(r.a);
      const from = { clipPath: cur.clipPath === 'none' ? 'inset(0 0% 0 0)' : cur.clipPath, opacity: cur.opacity };
      r.anims.forEach(x => x.cancel());
      r.a.animate([from, { clipPath: 'inset(0 0% 0 0)', opacity: 1 }], { duration: 350, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    const isCard = e => e.target.matches && e.target.matches('.tpl.pr');   // enter/leave fire per element; only the card itself counts
    root.addEventListener('pointerenter', e => { if (hoverable.matches && isCard(e)) start(e.target, false); }, true);
    root.addEventListener('pointerleave', e => { if (isCard(e)) stop(e.target); }, true);
    root.addEventListener('focusin', e => { if (hoverable.matches) { const c = e.target.closest('.tpl.pr'); if (c) start(c, false); } });
    root.addEventListener('focusout', e => { const c = e.target.closest('.tpl.pr'); if (c) stop(c); });
    // a tap always opens; the wipe is decorative, nothing depends on hovering
    root.addEventListener('click', e => { const c = e.target.closest('.tpl.pr'); if (c) o.onOpen && o.onOpen(c.dataset.open); });
    // touch (no hover): each card plays the change once as it enters the viewport, then rests
    if (!hoverable.matches && !reduce.matches && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); start(en.target, true); } }), { threshold: .6 });
      const watch = () => root.querySelectorAll('.tpl.pr:not([data-seen])').forEach(c => { c.dataset.seen = '1'; io.observe(c); });
      watch(); new MutationObserver(watch).observe(root, { childList: true, subtree: true });
    }
    return { start, stop };
  }

  /* ---------- reveal: once, fade-up, staggered 40ms within the batch that enters together ---------- */
  function reveal(els) {
    els = [...els];
    if (reduce.matches || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('rv', 'in')); return; }
    els.forEach(el => el.classList.add('rv'));
    const io = new IntersectionObserver(entries => {
      let i = 0;
      entries.forEach(en => { if (!en.isIntersecting) return; en.target.style.setProperty('--d', `${Math.min(i++, 8) * 40}ms`); en.target.classList.add('in'); io.unobserve(en.target); });
    }, { threshold: .06, rootMargin: '0px 0px -6% 0px' });
    els.forEach(el => io.observe(el));
  }

  window.SV = { T, CATS, ICON, SIZES, catName, typeHint, card, media, pair, compare, pairCard, makeSheet, previewSheet, bindCompare, formHTML, barHTML, bindForm, createDialog, editFormHTML, bindEditForm, editDialog, hoverPlay, reveal, q, frame };
})();

// Quiet Loop: muted, looping, inline, no controls. The file loads after page load and only once the
// video is at least half in view; it pauses when it leaves. Reduced motion keeps the poster only.
// Hover-play videos ([data-hover]) are driven by SV.hoverPlay instead: load on first hover, pause on leave.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const loaded = new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
  const io = new IntersectionObserver(es => es.forEach(async ({ target: v, isIntersecting }) => {
    if (!isIntersecting || reduce.matches) { v.pause(); return; }
    await loaded;
    if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.load(); }
    v.play().catch(() => { v.removeAttribute('src'); v.load(); });
  }), { threshold: 0.5 });
  const watch = root => root.querySelectorAll('video[data-src]:not([data-hover])').forEach(v => { if (!v.dataset.watched) { v.dataset.watched = '1'; v.muted = true; io.observe(v); } });
  const start = () => { watch(document); new MutationObserver(() => watch(document)).observe(document.body, { childList: true, subtree: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  reduce.addEventListener('change', () => { if (reduce.matches) document.querySelectorAll('video').forEach(v => v.pause()); });
})();
