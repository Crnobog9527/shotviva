// The lab page's browser script, sent inline as plain ES2017 (no bundler for this page).
//
// How it measures, per run:
// - "热" (warm CDN): a URL with a per-run ?lab=w… parameter is first fetched once with
//   cache:'no-store' (fills the CDN, not the browser cache, not timed), then loaded as an <img>,
//   so the timed load is a CDN hit over the network.
// - "冷" (cold): a fresh ?lab=c… parameter, so a CDN that keys on the query goes to the origin.
// - Loads run one at a time; for each image the origins are shuffled, so a slow minute on the
//   line hits every origin alike. The first load of each origin carries its DNS + TCP + TLS and
//   is reported apart ("首张"); medians and P90 use the rest.
// - The small-image rows (o.small) load the card-sized AVIF/WebP from /_next/image. Vercel's
//   optimiser ignores the extra lab parameter in its cache key (checked 2026-11-13), so its
//   "冷" is still a Vercel hit and costs no new transformation; on the CDN it is a CDN miss.
// - Time = the Resource Timing duration (fetch start → last byte; no Timing-Allow-Origin needed),
//   falling back to onload time. TTFB only where the origin sends Timing-Allow-Origin.
export const CLIENT_SCRIPT = String.raw`(function () {
  var C = JSON.parse(document.getElementById('lab-config').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var TIMEOUT = 20000;
  var results = [];
  if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(1000);

  function url(o, key, tag) {
    if (o.hero) return o.base + '/_next/image?url=' + encodeURIComponent('/home/' + C.heroFiles[C.keys.indexOf(key) % C.heroFiles.length]) + '&w=' + C.heroWidth + '&q=75&lab=' + tag;
    if (o.font) return o.base + '/fonts/misans/' + C.fontFiles[C.keys.indexOf(key) % C.fontFiles.length] + '?lab=' + tag;
    if (o.small) return o.base + '/_next/image?url=' + encodeURIComponent(C.assetsBase + '/' + key) + '&w=' + C.smallWidth + '&q=75&lab=' + tag;
    return o.base + '/' + key + '?lab=' + tag;
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function q(sorted, p) { if (!sorted.length) return null; var i = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1); return Math.round(sorted[Math.max(0, i)]); }

  function prewarm(u) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
    return fetch(u, { mode: 'no-cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.blob ? r.blob() : null; }).catch(function () {}).then(function () { clearTimeout(timer); });
  }

  // A static file (font row): fetched, not decoded as an image; timed the same way.
  function fetchTimed(u) {
    var t0 = performance.now();
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
    return fetch(u, { mode: 'no-cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.blob(); }).then(function () { return true; }, function () { return false; })
      .then(function (ok) {
        clearTimeout(timer);
        var e = performance.getEntriesByName(u).pop();
        var ms = e && e.duration > 0 ? e.duration : performance.now() - t0;
        var ttfb = e && e.responseStart > 0 ? e.responseStart - e.startTime : null;
        return { ok: ok, ms: Math.round(ms), ttfb: ttfb === null ? null : Math.round(ttfb), kb: null };
      });
  }

  function load(u, o) {
    if (o && o.font) return fetchTimed(u);
    return new Promise(function (resolve) {
      var img = new Image(); var t0 = performance.now(); var done = false;
      function finish(ok) {
        if (done) return; done = true; clearTimeout(timer);
        var e = performance.getEntriesByName(img.src).pop();
        var ms = e && e.duration > 0 ? e.duration : performance.now() - t0;
        var ttfb = e && e.responseStart > 0 ? e.responseStart - e.startTime : null;
        resolve({ ok: ok, ms: Math.round(ms), ttfb: ttfb === null ? null : Math.round(ttfb), kb: e && e.encodedBodySize ? Math.round(e.encodedBodySize / 1024) : null });
      }
      var timer = setTimeout(function () { img.src = ''; finish(false); }, TIMEOUT);
      img.onload = function () { finish(true); }; img.onerror = function () { finish(false); };
      img.src = u;
    });
  }

  function summarize() {
    return C.origins.map(function (o) {
      var mine = results.filter(function (r) { return r.o === o.id; });
      var first = mine.filter(function (r) { return r.first; })[0];
      var row = { id: o.id, label: o.label, first: first && first.ok ? first.ms : null };
      ['w', 'c'].forEach(function (m) {
        var rs = mine.filter(function (r) { return r.m === m; });
        var ok = rs.filter(function (r) { return r.ok && !r.first; }).map(function (r) { return r.ms; }).sort(function (a, b) { return a - b; });
        row[m] = { ok: rs.filter(function (r) { return r.ok; }).length, n: rs.length, p50: q(ok, 0.5), p90: q(ok, 0.9) };
      });
      return row;
    });
  }

  function fmt(v) { return v === null || v === undefined ? '—' : v; }
  function render() {
    var rows = summarize().map(function (s) {
      return '<tr><td>' + s.label + '</td><td>' + fmt(s.first) + '</td><td>' + fmt(s.w.p50) + '</td><td>' + fmt(s.w.p90) + '</td><td>' + s.w.ok + '/' + s.w.n +
        '</td><td>' + fmt(s.c.p50) + '</td><td>' + fmt(s.c.p90) + '</td><td>' + s.c.ok + '/' + s.c.n + '</td></tr>';
    }).join('');
    $('rows').innerHTML = rows;
  }

  function report() {
    var conn = navigator.connection || {};
    var head = ['Shotviva图片测速v1', new Date().toISOString(), $('carrier').value, $('net').value, $('note').value || '-',
      'eff=' + (conn.effectiveType || '-'), 'rtt=' + (conn.rtt === undefined ? '-' : conn.rtt), location.host].join(' | ');
    var lines = summarize().map(function (s) {
      return s.id + ' 首张' + fmt(s.first) + ' 热中位' + fmt(s.w.p50) + ' 热P90' + fmt(s.w.p90) + ' 热成功' + s.w.ok + '/' + s.w.n +
        ' 冷中位' + fmt(s.c.p50) + ' 冷P90' + fmt(s.c.p90) + ' 冷成功' + s.c.ok + '/' + s.c.n;
    });
    var raw = results.map(function (r) { return [r.o, r.k, r.m, r.ok ? r.ms : -1, r.ttfb === null ? '' : r.ttfb, r.first ? 1 : 0].join(','); }).join(';');
    return head + '\n' + lines.join('\n') + '\nRAW ' + raw + '\nUA ' + navigator.userAgent;
  }

  function copy() {
    var text = $('out').value = report();
    var ok = function () { $('copied').textContent = '已复制，粘贴发回即可'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
    function fallback() { $('out').select(); try { document.execCommand('copy'); ok(); } catch (e) { $('copied').textContent = '请长按下面的文字手动复制'; } }
  }

  async function run() {
    $('start').disabled = true; results = []; render();
    var token = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var seen = {};
    $('status').textContent = '预热中（这一步不计时）…';
    var warmUrls = []; C.origins.forEach(function (o) { C.keys.forEach(function (k) { warmUrls.push(url(o, k, 'w' + token)); }); });
    for (var i = 0; i < warmUrls.length; i += 4) await Promise.all(warmUrls.slice(i, i + 4).map(prewarm));
    var total = C.keys.length * C.origins.length * 2; var n = 0;
    for (var k = 0; k < C.keys.length; k++) {
      var order = shuffle(C.origins);
      for (var j = 0; j < order.length; j++) {
        var o = order[j];
        var modes = Math.random() < 0.5 ? ['w', 'c'] : ['c', 'w'];
        for (var m = 0; m < 2; m++) {
          n++; $('status').textContent = '测速中 ' + n + ' / ' + total + '（请保持页面在前台）';
          var r = await load(url(o, C.keys[k], modes[m] + token), o);
          r.o = o.id; r.k = k; r.m = modes[m]; r.first = !seen[o.id]; seen[o.id] = true;
          results.push(r); render();
        }
      }
    }
    $('status').textContent = '完成。点「复制结果」发回。可以换网络再测一次。';
    $('start').disabled = false; $('out').value = report();
  }

  $('start').onclick = run;
  $('copy').onclick = copy;
})();`
