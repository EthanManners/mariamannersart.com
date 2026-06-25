// ── Return page ───────────────────────────────────────────────────────────────
// Stripe redirects here after confirmPayment with the PaymentIntent client secret
// in the URL. We retrieve its status, show a result, and on success clear the
// purchased items (stashed as `mm_pending` before redirect) from the cart.

(function () {
  const PENDING_KEY = 'mm_pending';
  const CART_KEY = 'mm_cart';

  const ARTIST_EMAIL = 'maria.manners@mariamannersart.com';

  function setStatus(title, msg, cls, withContact) {
    const box = document.getElementById('return-status');
    if (!box) return;
    box.className = cls || '';
    box.innerHTML = '';
    const h = document.createElement('h1');
    h.className = 'return-title';
    h.textContent = title;
    const p = document.createElement('p');
    p.className = 'return-msg';
    p.textContent = msg;
    box.append(h, p);
    if (withContact) {
      const c = document.createElement('p');
      c.className = 'return-contact';
      c.append(document.createTextNode('Questions about your order? '));
      const a = document.createElement('a');
      a.href = `mailto:${ARTIST_EMAIL}?subject=${encodeURIComponent('My order')}`;
      a.textContent = ARTIST_EMAIL;
      c.appendChild(a);
      box.appendChild(c);
    }
  }

  // Remove the just-purchased items from the cart.
  function clearPurchasedFromCart() {
    let pending = [];
    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch {}
    if (Array.isArray(pending) && pending.length) {
      let cart = [];
      try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch {}
      const done = new Set(pending);
      localStorage.setItem(CART_KEY, JSON.stringify(cart.filter((id) => !done.has(id))));
    }
    localStorage.removeItem(PENDING_KEY);
  }

  async function main() {
    const year = document.getElementById('footer-year');
    if (year) year.textContent = new Date().getFullYear();

    const clientSecret = new URLSearchParams(location.search).get('payment_intent_client_secret');
    if (!clientSecret) {
      setStatus('Nothing to show', 'No payment information was found.', '');
      return;
    }

    try {
      const res = await fetch('/api/config');
      const { publishableKey } = await res.json();
      if (!publishableKey || !window.Stripe) throw new Error('not configured');

      const stripe = window.Stripe(publishableKey);
      const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
      const status = paymentIntent && paymentIntent.status;

      if (status === 'succeeded') {
        clearPurchasedFromCart();
        setStatus(
          'Thank you',
          'Your payment went through and a receipt is on its way to your email. ' +
            'Maria will personally arrange insured shipping of your original and be in touch.',
          'is-success',
          true
        );
      } else if (status === 'processing') {
        clearPurchasedFromCart();
        setStatus(
          'Payment processing',
          'Your payment is processing — we’ll email your receipt once it confirms, ' +
            'then Maria will arrange insured shipping.',
          'is-success',
          true
        );
      } else if (status === 'requires_payment_method') {
        setStatus('Payment not completed', 'Your payment wasn’t completed. Please try again from the shop.', 'is-error');
      } else {
        setStatus('Payment status unclear', 'We couldn’t confirm your payment. If you were charged, please contact us.', 'is-error');
      }
    } catch {
      setStatus('Something went wrong', 'We couldn’t check your payment status. If you were charged, please contact us.', 'is-error');
    }
  }

  document.addEventListener('DOMContentLoaded', main);
})();
