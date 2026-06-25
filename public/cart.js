// ── Cart (commerce) ───────────────────────────────────────────────────────────
// Cart state in localStorage. Originals are unique: the cart holds at most one of
// each itemId, and a 'sold' or unknown item can never be added. Shop page only.

(function () {
  const KEY = 'mm_cart';

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  function write(ids) {
    localStorage.setItem(KEY, JSON.stringify(ids));
  }

  function getItems() { return read(); }
  function has(itemId) { return read().includes(itemId); }
  function count() { return read().length; }

  // Only known, 'available' items can be added; uniqueness enforced.
  function add(itemId) {
    const p = typeof window.getPainting === 'function' ? window.getPainting(itemId) : null;
    if (!p || p.status !== 'available') return false;
    const ids = read();
    if (!ids.includes(itemId)) {
      ids.push(itemId);
      write(ids);
      sync();
    }
    openDrawer();
    return true;
  }

  function remove(itemId) {
    write(read().filter((id) => id !== itemId));
    sync();
    renderDrawer();
  }

  function removeMany(itemIds) {
    const set = new Set(itemIds);
    write(read().filter((id) => !set.has(id)));
    sync();
  }

  function clear() { write([]); sync(); }

  // ── Price helpers (display only; the real total is computed server-side) ──
  function parsePrice(str) {
    const n = Number(String(str || '').replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function formatPrice(n) {
    return '$' + n.toLocaleString('en-US');
  }

  // ── UI sync ──
  function updateCount() {
    const el = document.getElementById('cart-count');
    if (el) el.textContent = String(count());
  }
  function syncButtons() {
    const inCart = new Set(read());
    document.querySelectorAll('.btn-cart[data-item-id]').forEach((btn) => {
      const on = inCart.has(btn.dataset.itemId);
      btn.disabled = on;
      btn.textContent = on ? 'In cart' : 'Add to cart';
    });
  }
  function sync() { updateCount(); syncButtons(); }

  // ── Drawer ──
  function renderDrawer() {
    const list = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('cart-checkout');
    if (!list) return;

    const ids = read();
    list.innerHTML = '';
    let total = 0;

    if (ids.length === 0) {
      list.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
      if (totalEl) totalEl.textContent = formatPrice(0);
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    ids.forEach((id) => {
      const p = window.getPainting ? window.getPainting(id) : null;
      if (!p) return;
      total += parsePrice(p.price);

      const row = document.createElement('div');
      row.className = 'cart-row';

      const thumb = document.createElement('img');
      thumb.className = 'cart-thumb';
      thumb.src = p.src;
      thumb.alt = '';

      const main = document.createElement('div');
      main.className = 'cart-row-main';
      const title = document.createElement('span');
      title.className = 'cart-row-title';
      title.textContent = p.title || '';
      const price = document.createElement('span');
      price.className = 'cart-row-price';
      price.textContent = p.price || '';
      main.append(title, price);

      const rm = document.createElement('button');
      rm.className = 'cart-remove';
      rm.type = 'button';
      rm.setAttribute('aria-label', `Remove ${p.title || 'item'}`);
      rm.innerHTML = '&times;';
      rm.addEventListener('click', () => remove(id));

      row.append(thumb, main, rm);
      list.appendChild(row);
    });

    if (totalEl) totalEl.textContent = formatPrice(total);
    if (checkoutBtn) checkoutBtn.disabled = false;
  }

  function openDrawer() {
    const d = document.getElementById('cart-drawer');
    if (!d) return;
    renderDrawer();
    d.hidden = false;
    d.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => d.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    const d = document.getElementById('cart-drawer');
    if (!d || d.hidden) return;
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { d.hidden = true; }, 220); // after slide-out transition
  }

  function init() {
    sync();

    const drawer = document.getElementById('cart-drawer');
    if (drawer) {
      drawer.querySelectorAll('[data-cart-close]').forEach((el) =>
        el.addEventListener('click', closeDrawer));
    }

    const cartBtn = document.getElementById('cart-btn');
    if (cartBtn) cartBtn.addEventListener('click', openDrawer);

    const checkoutBtn = document.getElementById('cart-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        const ids = read();
        if (ids.length === 0) return;
        closeDrawer();
        if (window.Checkout) window.Checkout.open(ids);
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  window.Cart = {
    add, remove, removeMany, clear, has, getItems, count,
    openDrawer, closeDrawer, init,
  };
})();
