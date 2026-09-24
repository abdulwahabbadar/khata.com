/* khata-pro.js - My Khata ke upar login + subscription layer.
 * index.html mein PEHLE yeh set karein:  <script>window.KHATA_API_BASE='https://YOUR-BACKEND-DOMAIN'</script>
 * phir:  <script src="khata-pro.js"></script>
 * Server hamesha final faisla karta hai; yeh sirf UI ke liye hai. */
(function () {
  'use strict';
  const API = (window.KHATA_API_BASE || '').replace(/\/$/, '');
  const TOKEN_KEY = 'khata_token';
  const CACHE_KEY = 'khata_sub_cache';
  const FREE_STATE = {
    plan: 'FREE', status: 'FREE', isPro: false, adsEnabled: true, unlimitedCustomers: false,
    customerLimit: 100, premiumReports: false, pdfExport: false, backupSync: false, basicExport: true, expiryDate: null,
  };
  const PRICES = { PRO_MONTHLY: 'Rs.49', PRO_YEARLY: 'Rs.299' };

  let sub = Object.assign({}, FREE_STATE, readCache());
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } }

  /* ---------- central subscription state ---------- */
  function getSubscriptionState() { return Object.assign({}, sub); }
  function setSub(s) {
    sub = Object.assign({}, FREE_STATE, s || {});
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(sub)); } catch {}
    applyAds();
    document.dispatchEvent(new CustomEvent('khata:subscription', { detail: getSubscriptionState() }));
  }
  function applyAds() {
    document.documentElement.setAttribute('data-ads', sub.adsEnabled ? 'on' : 'off');
    // Android WebView wrapper: native AdMob banner ko on/off karta hai (README dekhein)
    try { if (window.KhataAndroid && window.KhataAndroid.setAdsEnabled) window.KhataAndroid.setAdsEnabled(!!sub.adsEnabled); } catch {}
  }

  /* ---------- API ---------- */
  const isLoggedIn = () => !!localStorage.getItem(TOKEN_KEY);
  function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CACHE_KEY); sub = Object.assign({}, FREE_STATE); applyAds(); }

  async function api(path, opts) {
    const { method = 'GET', body } = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) headers.Authorization = 'Bearer ' + t;
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && t) { clearSession(); document.dispatchEvent(new Event('khata:loggedout')); }
    if (!r.ok) { const e = new Error(data.error || 'REQUEST_FAILED'); e.status = r.status; e.data = data; throw e; }
    return data;
  }

  async function signup(f) { const d = await api('/api/auth/signup', { method: 'POST', body: f }); return onAuth(d); }
  async function login(identifier, password) { const d = await api('/api/auth/login', { method: 'POST', body: { identifier, password } }); return onAuth(d); }
  function onAuth(d) {
    localStorage.setItem(TOKEN_KEY, d.token);
    setSub(d.subscription);
    document.dispatchEvent(new CustomEvent('khata:loggedin', { detail: d.user }));
    return d.user;
  }
  function logout() { clearSession(); document.dispatchEvent(new Event('khata:loggedout')); }
  const forgot = (identifier) => api('/api/auth/forgot', { method: 'POST', body: { identifier } });
  const reset = (token, newPassword) => api('/api/auth/reset', { method: 'POST', body: { token, newPassword } });
  async function refresh() { if (!isLoggedIn()) return getSubscriptionState(); const d = await api('/api/me'); setSub(d.subscription); return getSubscriptionState(); }

  /* ---------- customer limit (data kabhi hide/delete nahi hota) ---------- */
  function canAddCustomer(currentCount) { return sub.isPro || currentCount < (sub.customerLimit || 100); }
  // Apne "Add Customer" button/function ko is se wrap karein:
  //   Khata.guardAddCustomer(customers.length, () => openAddCustomerForm());
  function guardAddCustomer(currentCount, onAllowed) {
    if (canAddCustomer(currentCount)) return onAllowed();
    showLimitScreen();
    return false;
  }
  // Server se FREE_LIMIT_REACHED aaye to bhi yahi screen dikhayein
  function handleApiError(e) { if (e && e.data && e.data.error === 'FREE_LIMIT_REACHED') { showLimitScreen(); return true; } return false; }

  /* ---------- tiny DOM helpers (textContent use hota hai - XSS safe) ---------- */
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    kids.forEach(k => n.append(k));
    return n;
  }
  function injectCss() {
    if (document.getElementById('khata-pro-css')) return;
    const s = el('style', { id: 'khata-pro-css' });
    s.textContent = `
    .kp-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px}
    .kp-box{background:#fff;color:#111;border-radius:14px;max-width:380px;width:100%;padding:20px;font-family:system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.3)}
    .kp-box h3{margin:0 0 8px;font-size:18px}.kp-box p{margin:0 0 14px;font-size:14px;line-height:1.45}
    .kp-box input{width:100%;box-sizing:border-box;padding:11px;margin:0 0 10px;border:1px solid #ccc;border-radius:8px;font-size:15px}
    .kp-btn{display:block;width:100%;padding:12px;margin:0 0 8px;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;background:#0a7d4f;color:#fff}
    .kp-btn.alt{background:#eee;color:#111}.kp-err{color:#c0392b;font-size:13px;min-height:16px;margin:0 0 8px}
    .kp-link{background:none;border:0;color:#0a7d4f;cursor:pointer;font-size:13px;padding:4px 0}
    .kp-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#222;color:#fff;padding:10px 16px;border-radius:8px;z-index:100000;font:14px system-ui}
    html[data-ads="off"] .kp-ad-slot{display:none!important}`;
    document.head.append(s);
  }
  function modal(build) {
    injectCss();
    const ov = el('div', { className: 'kp-ov' });
    const box = el('div', { className: 'kp-box' });
    ov.append(box);
    const close = () => ov.remove();
    build(box, close);
    document.body.append(ov);
    return close;
  }
  function toast(msg) { injectCss(); const t = el('div', { className: 'kp-toast', textContent: msg }); document.body.append(t); setTimeout(() => t.remove(), 4000); }

  /* ---------- Auth screen ---------- */
  function showAuth(mode) {
    modal((box, close) => {
      let m = mode || 'login';
      const draw = () => {
        box.textContent = '';
        const err = el('div', { className: 'kp-err' });
        const inp = (ph, type, ac) => el('input', { placeholder: ph, type: type || 'text', autocomplete: ac || 'off' });
        const title = { login: 'Login', signup: 'Sign Up', forgot: 'Password Recovery', reset: 'New Password' }[m];
        box.append(el('h3', { textContent: title }));
        const run = (fn) => async () => { err.textContent = ''; try { await fn(); } catch (e) { err.textContent = friendly(e.message); } };

        if (m === 'signup') {
          const n = inp('Name', 'text', 'name'), em = inp('Email (optional if phone given)', 'email', 'email'), ph = inp('Phone (optional if email given)', 'tel', 'tel'), pw = inp('Password (min 8 chars)', 'password', 'new-password');
          box.append(n, em, ph, pw, err, el('button', { className: 'kp-btn', textContent: 'Create Account', onclick: run(async () => { await signup({ name: n.value, email: em.value || undefined, phone: ph.value || undefined, password: pw.value }); close(); }) }));
        } else if (m === 'forgot') {
          const id = inp('Email or phone', 'text', 'username');
          box.append(id, err, el('button', { className: 'kp-btn', textContent: 'Send recovery code', onclick: run(async () => { await forgot(id.value); m = 'reset'; draw(); }) }));
        } else if (m === 'reset') {
          const tk = inp('Recovery code'), pw = inp('New password (min 8 chars)', 'password', 'new-password');
          box.append(tk, pw, err, el('button', { className: 'kp-btn', textContent: 'Set password', onclick: run(async () => { await reset(tk.value.trim(), pw.value); m = 'login'; draw(); toast('Password updated. Please login.'); }) }));
        } else {
          const id = inp('Email or phone', 'text', 'username'), pw = inp('Password', 'password', 'current-password');
          box.append(id, pw, err, el('button', { className: 'kp-btn', textContent: 'Login', onclick: run(async () => { await login(id.value, pw.value); close(); }) }));
        }
        const row = el('div');
        if (m !== 'login') row.append(el('button', { className: 'kp-link', textContent: 'Have an account? Login  ', onclick: () => { m = 'login'; draw(); } }));
        if (m !== 'signup') row.append(el('button', { className: 'kp-link', textContent: 'New here? Sign Up  ', onclick: () => { m = 'signup'; draw(); } }));
        if (m === 'login') row.append(el('button', { className: 'kp-link', textContent: 'Forgot password?', onclick: () => { m = 'forgot'; draw(); } }));
        box.append(row);
      };
      draw();
    });
  }
  function friendly(code) {
    return ({
      INVALID_CREDENTIALS: 'Wrong email/phone or password.', ALREADY_REGISTERED: 'This email/phone is already registered.',
      PASSWORD_INVALID: 'Password must be 8-128 characters.', NAME_INVALID: 'Please enter your name.',
      EMAIL_OR_PHONE_REQUIRED: 'Enter an email or phone number.', EMAIL_INVALID: 'Email looks invalid.', PHONE_INVALID: 'Phone looks invalid.',
      TOKEN_INVALID: 'Recovery code is invalid or expired.', GATEWAY_NOT_CONFIGURED: 'Payments are not set up yet.',
      GATEWAY_NOT_IMPLEMENTED: 'Payments are not set up yet.',
    })[code] || 'Something went wrong. Please try again.';
  }

  /* ---------- Upgrade / Renew screens ---------- */
  function showLimitScreen() {
    if (sub.status === 'PRO_EXPIRED') return showExpiredScreen();
    modal((box, close) => {
      box.append(
        el('h3', { textContent: 'Your free limit of 100 customers has been reached.' }),
        el('p', { textContent: 'Upgrade to Pro to add unlimited customers and remove ads.' }),
        el('button', { className: 'kp-btn', textContent: 'Upgrade to Pro', onclick: () => { close(); showPlans(false); } }),
        el('button', { className: 'kp-btn alt', textContent: 'Maybe Later', onclick: close })
      );
    });
  }
  function showExpiredScreen() {
    modal((box, close) => {
      box.append(
        el('h3', { textContent: 'Pro expired' }),
        el('p', { textContent: 'Your Pro subscription has expired. Your data is safe. Renew Pro to continue using unlimited customers and premium features.' }),
        el('button', { className: 'kp-btn', textContent: 'Renew Monthly \u2014 Rs.49', onclick: () => startCheckout('PRO_MONTHLY') }),
        el('button', { className: 'kp-btn', textContent: 'Renew Yearly \u2014 Rs.299', onclick: () => startCheckout('PRO_YEARLY') }),
        el('button', { className: 'kp-btn alt', textContent: 'Close', onclick: close })
      );
    });
  }
  function showPlans() {
    if (!isLoggedIn()) return showAuth('login');
    if (sub.status === 'PRO_EXPIRED') return showExpiredScreen();
    modal((box, close) => {
      box.append(
        el('h3', { textContent: 'My Khata Pro' }),
        el('p', { textContent: 'Unlimited customers, no ads, premium reports, PDF/export, backup/sync.' }),
        el('button', { className: 'kp-btn', textContent: 'Monthly \u2014 ' + PRICES.PRO_MONTHLY, onclick: () => startCheckout('PRO_MONTHLY') }),
        el('button', { className: 'kp-btn', textContent: 'Yearly \u2014 ' + PRICES.PRO_YEARLY, onclick: () => startCheckout('PRO_YEARLY') }),
        el('button', { className: 'kp-btn alt', textContent: 'Cancel', onclick: close })
      );
    });
  }

  /* ---------- Checkout ---------- */
  async function startCheckout(plan) {
    if (!isLoggedIn()) return showAuth('login');
    try {
      const { checkout } = await api('/api/payments/checkout', { method: 'POST', body: { plan } });
      if (checkout.method === 'redirect') { location.href = checkout.url; return; }
      if (checkout.method === 'post_form') {
        const f = el('form', { method: 'POST', action: checkout.url });
        Object.entries(checkout.fields || {}).forEach(([k, v]) => f.append(el('input', { type: 'hidden', name: k, value: String(v) })));
        document.body.append(f); f.submit(); return;
      }
      throw new Error('CHECKOUT_FAILED');
    } catch (e) { toast(friendly(e.message)); }
  }

  // Gateway se wapas aane par (?order=KHATA-XXXX) server se status poochta hai - Pro sirf server ke PAID par unlock hota hai.
  async function pollPayment(orderId, tries) {
    for (let i = 0; i < (tries || 12); i++) {
      try {
        const d = await api('/api/payments/' + encodeURIComponent(orderId));
        if (d.status === 'PAID') { setSub(d.subscription); toast('Payment verified. Pro is active!'); return true; }
        if (d.status === 'FAILED' || d.status === 'REJECTED') { toast('Payment was not completed.'); return false; }
      } catch {}
      await new Promise(r => setTimeout(r, 3000));
    }
    toast('Payment is still being confirmed. Pro will unlock automatically once verified.');
    return false;
  }

  function checkReturnFromGateway() {
    const order = new URLSearchParams(location.search).get('order');
    if (order && isLoggedIn()) { history.replaceState(null, '', location.pathname); pollPayment(order); }
  }

  /* ---------- expiry banner (optional) ---------- */
  function renderBanner(container) {
    if (!container) return;
    container.textContent = '';
    if (sub.status === 'PRO_EXPIRED') {
      container.append(el('span', { textContent: 'Pro expired \u2014 your data is safe. ' }), el('button', { className: 'kp-link', textContent: 'Renew', onclick: showExpiredScreen }));
    }
  }

  window.Khata = {
    getSubscriptionState, refresh, isLoggedIn, api, handleApiError,
    signup, login, logout, forgot, reset, showAuth,
    canAddCustomer, guardAddCustomer, showLimitScreen, showPlans, showExpiredScreen, startCheckout, pollPayment, renderBanner,
  };

  applyAds();
  document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) { refresh().catch(() => {}); checkReturnFromGateway(); } else { showAuth('login'); }
  });
})();
