// My Khata - login, sync, offline queue, WhatsApp share. script.js loads after this file.
(function () {
  const C = window.KHATA_CFG, ls = localStorage;
  const p = (new URLSearchParams(location.search).get('p') || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const sfx = p ? '-' + p : '', KEY = 'khata-data' + sfx, K = n => 'kh_' + n + sfx;
  let sb = null, uid = null, email = '', timer = null, busy = false;
  const T = (pr, ms) => Promise.race([pr, new Promise((_, j) => setTimeout(() => j(new Error('timeout')), ms || 8000))]);
  const read = () => { try { return JSON.parse(ls.getItem(KEY)); } catch (e) { return null; } };

  function boot() {
    const s = document.createElement('script'); s.src = 'script.js'; document.body.appendChild(s);
  }
  function uniq(a, b, k) { const m = new Map(); (b || []).concat(a || []).forEach(x => m.set(k(x), x)); return [...m.values()]; }
  const key = x => (x && x.id != null) ? 'i' + x.id : JSON.stringify(x);
  function merge(L, S) { // conflict: combine data from both sides (deleted items may reappear)
    const o = Object.assign({}, S, L);
    ['inventory', 'capitalEntries', 'expenses', 'stockPurchases'].forEach(f => o[f] = uniq(L[f], S[f], key));
    const cm = new Map((S.customers || []).map(c => [c.id, c]));
    (L.customers || []).forEach(c => { const s = cm.get(c.id); cm.set(c.id, s ? Object.assign({}, s, c, { entries: uniq(c.entries, s.entries, e => JSON.stringify(e)) }) : c); });
    o.customers = [...cm.values()];
    return o;
  }

  // ---------- login screen ----------
  function gate() {
    return new Promise(res => {
      let mode = 'up'; // default view: create a new account
      const inp = 'width:100%;padding:12px;border:1px solid rgba(184,134,62,.35);border-radius:10px;font:inherit;font-size:15px;box-sizing:border-box';
      const btn = 'width:100%;border:0;border-radius:10px;padding:12px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;margin-top:6px;';
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#F3E9D6;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,sans-serif;overflow:auto';
      d.innerHTML = `<style>
#g-w:focus-within,#g-p:focus{border-color:#8B2635!important;box-shadow:0 0 0 3px rgba(139,38,53,.15)}
#g-e:focus,#g-p:focus{outline:none}
</style>
<div style="max-width:380px;width:100%;background:#fff8ea;border:1px solid rgba(184,134,62,.35);border-radius:18px;padding:22px;box-shadow:0 2px 8px rgba(43,27,18,.15);color:#2B1B12">
<h1 style="margin:0 0 4px;color:#8B2635;font-size:22px">📒 My Khata</h1>
<div id="g-sub" style="font-size:12px;color:#5B4636;margin-bottom:14px"></div>
<div id="g-w" style="display:flex;align-items:center;margin-bottom:10px;border:1px solid rgba(184,134,62,.35);border-radius:10px;background:#fff;overflow:hidden">
  <input id="g-e" type="text" placeholder="Username" autocomplete="username" autocapitalize="none" style="${inp};border:0;border-radius:0;flex:1;min-width:0;outline:none">
  <span id="g-dom" style="padding:0 12px;color:#5B4636;font-size:14px"></span>
</div>
<input id="g-p" type="password" placeholder="Password" autocomplete="new-password" style="${inp};margin-bottom:10px;outline:none">
<div id="g-m" style="color:#8B2635;font-size:12px;font-weight:700;min-height:18px"></div>
<button id="g-fp" hidden style="background:none;border:0;color:#8B2635;font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:0 0 8px;text-decoration:underline"></button>
<button id="g-go" style="${btn}background:#8B2635;color:#fff"></button>
<button id="g-sw" style="${btn}background:transparent;color:#5B4636;border:1px solid rgba(184,134,62,.35)"></button></div>`;
      document.body.appendChild(d);
      const $ = id => d.querySelector('#' + id), msg = (t, ok) => { $('g-m').style.color = ok ? '#3F6F52' : '#8B2635'; $('g-m').textContent = t; };
      // Username only -> append @gmail.com; a full email (contains @) is used as typed
      const getEmail = () => {
        const v = $('g-e').value.trim().toLowerCase();
        if (!v) return '';
        return v.includes('@') ? v : v + '@gmail.com';
      };
      function paint() {
        $('g-sub').textContent = mode === 'in' ? 'Sign in to your account' : 'Create a new free account';
        $('g-go').textContent = mode === 'in' ? 'Login' : 'Create Account';
        $('g-sw').textContent = mode === 'in' ? 'Create a new account' : 'Login with existing account';
        $('g-fp').hidden = mode !== 'in';
        $('g-p').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
      }
      paint();
      // Hide the @gmail.com suffix once the user types a full email address
      $('g-e').oninput = () => { $('g-dom').style.display = $('g-e').value.includes('@') ? 'none' : ''; };
      $('g-sw').onclick = () => { mode = mode === 'in' ? 'up' : 'in'; msg(''); paint(); };
      $('g-fp').onclick = async () => {
        const e = getEmail(); if (!e) return msg('Please enter your email first');
        const r = await sb.auth.resetPasswordForEmail(e, { redirectTo: location.href.split('?')[0] });
        msg(r.error ? r.error.message : 'A password reset link has been sent to your email.', !r.error);
      };
      $('g-go').onclick = async () => {
        const e = getEmail(), pw = $('g-p').value;
        if (!e || pw.length < 6) return msg('Please enter your email and a password of at least 6 characters');
        $('g-go').disabled = true; msg('Please wait...', true);
        const r = mode === 'in' ? await sb.auth.signInWithPassword({ email: e, password: pw }) : await sb.auth.signUp({ email: e, password: pw });
        $('g-go').disabled = false;
        if (r.error) return msg(r.error.message);
        if (!r.data.session) return msg('A confirmation link has been sent to your email. Please confirm it, then log in.', true);
        d.remove(); res(r.data.session);
      };
    });
  }

  // ---------- pull: fetch data from the server ----------
  async function pull() {
    const [dr, pr] = await T(Promise.all([
      sb.from('khata_data').select('data,version').eq('user_id', uid).maybeSingle(),
      sb.from('profiles').select('plan,plan_expires_at').eq('id', uid).maybeSingle()
    ]));
    if (dr.error) throw dr.error;
    const owner = ls.getItem(K('owner'));
    if (owner && owner !== uid) { [KEY, K('ver'), K('dirty')].forEach(k => ls.removeItem(k)); }
    let local = read(), dirty = !!ls.getItem(K('dirty')), data = local;
    if (dr.data) {
      const S = dr.data.data;
      if (local && (dirty || !owner)) { data = merge(local, S); ls.setItem(K('dirty'), Date.now()); }
      else data = S;
      ls.setItem(K('ver'), dr.data.version);
    } else if (local) ls.setItem(K('dirty'), Date.now());
    if (data) {
      if (!pr.error && pr.data) {
        const ex = pr.data.plan_expires_at ? new Date(pr.data.plan_expires_at).getTime() : 0;
        data.subscription = ex > Date.now() ? { plan: pr.data.plan, activatedAt: ex, expiresAt: ex } : { plan: null, activatedAt: null, expiresAt: null };
      }
      ls.setItem(KEY, JSON.stringify(data));
    }
    ls.setItem(K('owner'), uid);
  }

  // ---------- push: send data to the server (stays queued as dirty while offline) ----------
  async function flush() {
    if (busy || !sb || !uid || !navigator.onLine || !ls.getItem(K('dirty'))) return;
    busy = true;
    try {
      const mark = ls.getItem(K('dirty')), d = read(); if (!d) return;
      const out = Object.assign({}, d); delete out.subscription;
      const r = await T(sb.rpc('push_data', { p_data: out, p_base: +ls.getItem(K('ver')) || 0, p_shop: (d.shop && d.shop.shopName) || '' }), 20000);
      if (r.error) throw r.error;
      if (!r.data.ok) { // another device changed the data too: merge and reload
        const m = merge(d, r.data.data); m.subscription = d.subscription;
        ls.setItem(KEY, JSON.stringify(m)); ls.setItem(K('ver'), r.data.version); ls.setItem(K('dirty'), Date.now());
        location.reload(); return;
      }
      ls.setItem(K('ver'), r.data.version);
      if (ls.getItem(K('dirty')) === mark) ls.removeItem(K('dirty'));
    } catch (e) { /* offline or server error: data stays dirty and will be retried */ }
    finally { busy = false; }
  }
  async function resync() {
    if (!sb || !uid || !navigator.onLine) return;
    if (ls.getItem(K('dirty'))) return flush();
    try {
      const r = await sb.from('khata_data').select('version').eq('user_id', uid).maybeSingle();
      if (r.data && r.data.version > (+ls.getItem(K('ver')) || 0)) location.reload();
    } catch (e) {}
  }

  // ---------- public helpers ----------
  const api = {
    rpc(fn, args) { return sb ? sb.rpc(fn, args) : Promise.resolve({ error: { message: 'Not connected' } }); },
    email: '',
    push() { ls.setItem(K('dirty'), Date.now()); clearTimeout(timer); timer = setTimeout(flush, 1500); },
    wa(c, bal, shop) {
      let ph = (c.phone || '').replace(/\D/g, '');
      if (ph.startsWith('0')) ph = '92' + ph.slice(1);
      const R = n => 'Rs ' + Math.round(n).toLocaleString('en-US');
      const D = ms => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const E = (c.entries || []).slice().sort((a, b) => a.time - b.time);
      let paid = 0, credit = 0;
      const L = E.map(x => {
        if (x.type === 'item') { credit += x.total; return D(x.time) + ': ' + x.item + ' ' + x.qty + ' x ' + R(x.rate) + ' = ' + R(x.total); }
        paid += x.amount; return D(x.time) + ': Payment mili ' + R(x.amount);
      });
      const head = 'Assalam o Alaikum ' + c.name + ',\n' + shop + ' ka poora hisab:\n-----------------\n';
      const foot = '-----------------\nKul udhaar: ' + R(credit) + '\nPayment mili: ' + R(paid) + '\n*Baqaya: ' + R(bal) + '*';
      let lines = L, note = '';
      const build = () => head + note + lines.join('\n') + (lines.length ? '\n' : '') + foot;
      while (lines.length > 1 && encodeURIComponent(build()).length > 6500) { // WhatsApp link ki lambai ki hadd
        lines = lines.slice(1); note = '(Purani ' + (L.length - lines.length) + ' entries chhodi gayi, baqaya poora sahi hai)\n';
      }
      window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(build()), '_blank');
    }
  };
  window.__ks = api;

  async function signOut() {
    await flush();
    if (ls.getItem(K('dirty')) && !confirm('Some changes have not been saved online yet. Log out anyway? (Those changes may be lost.)')) return;
    await sb.auth.signOut();
    [KEY, K('ver'), K('dirty'), K('owner')].forEach(k => ls.removeItem(k));
    location.reload();
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#cloud-out-btn')) signOut(); });
  window.addEventListener('online', resync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
  setInterval(() => { if (!document.hidden) resync(); }, 60000);


  // ---------- PWA: service worker, update notice, install button ----------
  function pill(txt, fn) {
    document.getElementById('kh-pill') && document.getElementById('kh-pill').remove();
    const b = document.createElement('div'); b.id = 'kh-pill';
    b.style.cssText = 'position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:9997;background:#2B1B12;color:#F3E9D6;border-radius:999px;padding:10px 14px;font:600 13px Inter,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;max-width:90vw';
    b.innerHTML = '<span style="cursor:pointer">' + txt + '</span><span style="opacity:.6;cursor:pointer">✕</span>';
    b.firstChild.onclick = () => { fn && fn(); b.remove(); }; b.lastChild.onclick = () => b.remove();
    document.body.appendChild(b);
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if ('serviceWorker' in navigator) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) pill('🔄 Naya version tayyar — Refresh karein', () => location.reload()); });
  }
  let dip = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); dip = e;
    if (!standalone && !ls.getItem('kh_noinst')) setTimeout(() => pill('📲 App install karein', async () => { dip.prompt(); await dip.userChoice; dip = null; }), 4000);
  });
  window.addEventListener('appinstalled', () => { const p2 = document.getElementById('kh-pill'); p2 && p2.remove(); });
  if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent) && !ls.getItem('kh_ios'))
    setTimeout(() => { pill('📲 Install: Share ⬆️ → Add to Home Screen', () => ls.setItem('kh_ios', 1)); }, 5000);

  // ---------- start ----------
  async function start() {
    const offlineOK = !!ls.getItem(K('owner'));
    if (!window.supabase || !C || C.URL.includes('YOUR-')) {
      if (offlineOK) return boot();
      document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">An internet connection is required on first use. Please add your Supabase URL/KEY in config.js.</p>'; return;
    }
    sb = window.supabase.createClient(C.URL, C.KEY, { auth: { storageKey: 'sb-khata' + sfx, persistSession: true, autoRefreshToken: true } });
    let session = null;
    try { session = (await T(sb.auth.getSession(), 4000)).data.session; } catch (e) {}
    if (!session) {
      if (offlineOK && !navigator.onLine) return boot();
      session = await gate();
    }
    uid = session.user.id; email = session.user.email; api.email = email;
    try { await pull(); } catch (e) { /* offline: continue with local data */ }
    boot(); flush();
  }
  start();
})();
