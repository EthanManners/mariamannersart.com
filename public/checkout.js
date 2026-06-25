// ── Checkout (Stripe Payment Element, custom form path) ───────────────────────
// Opened by "Buy now" (one item) or the cart drawer's "Checkout" (the whole set).
// Both build an itemIds array, POST it to /api/create-payment-intent, mount the
// Payment Element with the returned clientSecret, and confirm payment with a
// return_url back to /return/. Shop page only.
//
// Note: the browser only ever holds the PUBLISHABLE key (fetched from
// /api/config). It cannot read the account or set the amount — the server priced
// and authorized this PaymentIntent. The secret key never leaves the server.

(function () {
  const ARTIST_EMAIL = 'maria.manners@mariamannersart.com';
  const PENDING_KEY = 'mm_pending';

  let stripe = null;       // cached Stripe instance
  let elements = null;     // current Elements group
  let paymentElement = null;
  let addressElement = null;
  let currentItemIds = [];

  // Pay is enabled only once all three are satisfied.
  let paymentReady = false;
  let addressComplete = false;
  let emailValid = false;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function el(id) { return document.getElementById(id); }

  function updatePayEnabled() {
    const pay = el('pay-button');
    if (pay) pay.disabled = !(paymentReady && addressComplete && emailValid);
  }

  async function getStripe() {
    if (stripe) return stripe;
    if (!window.Stripe) throw new Error('Stripe.js failed to load.');
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Could not load payment config.');
    const { publishableKey } = await res.json();
    if (!publishableKey) throw new Error('Payment is not configured yet.');
    stripe = window.Stripe(publishableKey);
    return stripe;
  }

  // ── Display-only summary (real total is server-side) ──
  function parsePrice(str) {
    const n = Number(String(str || '').replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function formatPrice(n) { return '$' + n.toLocaleString('en-US'); }

  function renderSummary(itemIds) {
    const box = el('checkout-summary');
    if (!box) return;
    box.innerHTML = '';
    let total = 0;
    itemIds.forEach((id) => {
      const p = window.getPainting ? window.getPainting(id) : null;
      total += parsePrice(p ? p.price : '');
      const row = document.createElement('div');
      row.className = 'co-row';
      const t = document.createElement('span'); t.textContent = p ? p.title : id;
      const pr = document.createElement('span'); pr.textContent = p ? p.price : '';
      row.append(t, pr);
      box.appendChild(row);
    });
    const totalRow = document.createElement('div');
    totalRow.className = 'co-row co-total';
    const tl = document.createElement('span'); tl.textContent = 'Total';
    const tv = document.createElement('span'); tv.textContent = formatPrice(total);
    totalRow.append(tl, tv);
    box.appendChild(totalRow);
  }

  function showError(msg, withMailto) {
    const e = el('checkout-error');
    if (!e) return;
    e.textContent = msg + ' ';
    if (withMailto) {
      const a = document.createElement('a');
      a.href = `mailto:${ARTIST_EMAIL}?subject=${encodeURIComponent('Purchase enquiry')}`;
      a.textContent = 'Email to purchase directly';
      e.appendChild(a);
      e.appendChild(document.createTextNode('.'));
    }
  }
  function clearError() { const e = el('checkout-error'); if (e) e.textContent = ''; }

  function setLoading(on) {
    const loading = el('checkout-loading');
    const form = el('payment-form');
    if (loading) loading.style.display = on ? 'block' : 'none';
    if (form) form.style.display = on ? 'none' : 'block';
  }

  async function open(itemIds) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) return;
    currentItemIds = [...new Set(itemIds)];

    const modal = el('checkout-modal');
    if (!modal) return;

    clearError();
    renderSummary(currentItemIds);
    setLoading(true);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.classList.add('open'));
    document.body.style.overflow = 'hidden';

    try {
      const s = await getStripe();

      const res = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: currentItemIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not start checkout.');
      }
      const { clientSecret } = await res.json();

      elements = s.elements({ clientSecret });

      paymentElement = elements.create('payment');
      paymentElement.mount('#payment-element');
      paymentElement.on('ready', () => {
        setLoading(false);
        paymentReady = true;
        updatePayEnabled();
      });

      // Shipping address (US only) with phone for delivery coordination. On
      // confirm, Stripe attaches this to the PaymentIntent automatically.
      addressElement = elements.create('address', {
        mode: 'shipping',
        allowedCountries: ['US'],
        fields: { phone: 'always' },
        validation: { phone: { required: 'always' } },
      });
      addressElement.mount('#address-element');
      addressElement.on('change', (event) => {
        addressComplete = !!event.complete;
        updatePayEnabled();
      });
    } catch (err) {
      setLoading(false);
      // Surface the error and a manual fallback so a sale is never fully blocked.
      showError(err.message || 'Something went wrong.', true);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;

    const emailInput = el('checkout-email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!EMAIL_RE.test(email)) {
      showError('Please enter a valid email address.', false);
      if (emailInput) emailInput.focus();
      return;
    }

    clearError();
    const pay = el('pay-button');
    const payText = el('pay-button-text');
    if (pay) pay.disabled = true;
    if (payText) payText.textContent = 'Processing…';

    // Stash the items so /return/ can clear them from the cart on success.
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(currentItemIds)); } catch {}

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: location.origin + '/return/',
        receipt_email: email, // Stripe sends the receipt + stores it on the PI
      },
    });

    // Reaching here means confirmPayment did NOT redirect — show the error.
    if (error) {
      showError(error.message || 'Payment could not be completed.', true);
      if (payText) payText.textContent = 'Pay';
      updatePayEnabled();
    }
  }

  // Clean teardown so the modal can be reopened from scratch.
  function teardown() {
    if (paymentElement) {
      try { paymentElement.unmount(); } catch {}
      paymentElement = null;
    }
    if (addressElement) {
      try { addressElement.unmount(); } catch {}
      addressElement = null;
    }
    elements = null;
    currentItemIds = [];
    paymentReady = false;
    addressComplete = false;
    emailValid = false;
    const pe = el('payment-element'); if (pe) pe.innerHTML = '';
    const ae = el('address-element'); if (ae) ae.innerHTML = '';
    const email = el('checkout-email'); if (email) email.value = '';
    clearError();
    const pay = el('pay-button'); if (pay) pay.disabled = true;
    const payText = el('pay-button-text'); if (payText) payText.textContent = 'Pay';
  }

  function close() {
    const modal = el('checkout-modal');
    if (!modal || modal.hidden) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { modal.hidden = true; teardown(); }, 220);
  }

  function init() {
    const modal = el('checkout-modal');
    if (modal) {
      modal.querySelectorAll('[data-checkout-close]').forEach((x) =>
        x.addEventListener('click', close));
    }
    const form = el('payment-form');
    if (form) form.addEventListener('submit', handleSubmit);

    const email = el('checkout-email');
    if (email) {
      email.addEventListener('input', () => {
        emailValid = EMAIL_RE.test(email.value.trim());
        updatePayEnabled();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  window.Checkout = { open, close, init };
})();
