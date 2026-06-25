// ── Paintings (COMMERCE) ─────────────────────────────────────────────────────
// Original paintings for sale, rendered as the home-page shop feed.
//
// This is the commerce data source. It is SEPARATE from the display-only
// PORTFOLIO data (see portfolio.js) and the two must never be merged.
//
// Schema per entry:
//   itemId      string  — id the backend catalog charges against (never a price)
//   src         string  — image path (relative to this page, the site root)
//   alt         string  — image alt text
//   title       string  — display title (shown muted, below the price/buttons)
//   medium      string  — e.g. "Gouache on paper"
//   dimensions  string  — e.g. "18 × 24 in"
//   year        string  — e.g. "2025"
//   price       string  — DISPLAY string, e.g. "$1,200". No price => not for sale.
//   status      string  — 'available' | 'sold'
//
// NOTE: every `src` below points at shopPictures/placeholder.jpg so the feed
// renders. Replace each with a real photograph of the original painting.
const PAINTINGS = [
  {
    itemId: 'original-001',
    src: 'shopPictures/placeholder.jpg', // PLACEHOLDER — replace
    alt: 'Arctic Puppies — original painting',
    title: 'Arctic Puppies',
    medium: 'Gouache on cold-press paper',
    dimensions: '18 × 24 in',
    year: '2025',
    price: '$1,200',
    status: 'available',
  },
  {
    itemId: 'original-002',
    src: 'shopPictures/placeholder.jpg', // PLACEHOLDER — replace
    alt: 'Collection No. 1 — original painting',
    title: 'Collection No. 1',
    medium: 'Watercolor and ink',
    dimensions: '16 × 20 in',
    year: '2025',
    price: '$1,300',
    status: 'available',
  },
  {
    itemId: 'original-003',
    src: 'shopPictures/placeholder.jpg', // PLACEHOLDER — replace
    alt: 'Field Study — original painting',
    title: 'Field Study',
    medium: 'Oil on linen panel',
    dimensions: '12 × 12 in',
    year: '2024',
    price: '$1,500',
    status: 'available',
  },
  {
    itemId: 'original-004',
    src: 'shopPictures/placeholder.jpg', // PLACEHOLDER — replace
    alt: 'Quiet Harbor — original painting',
    title: 'Quiet Harbor',
    medium: 'Acrylic on wood panel',
    dimensions: '20 × 30 in',
    year: '2024',
    price: '$1,450',
    status: 'available',
  },
];


// ── Feed render ───────────────────────────────────────────────────────────────
// DOM order intentionally mirrors the selling hierarchy:
//   image → price → [Buy now | Add to cart] → title → medium · dimensions · year

function buildPiece(painting) {
  const article = document.createElement('article');
  article.className = 'painting reveal';
  if (painting.status === 'sold') article.classList.add('painting--sold');

  // 1 — image (large, dominant)
  const figure = document.createElement('figure');
  figure.className = 'painting-figure';
  const img = document.createElement('img');
  img.className = 'painting-img';
  img.alt = painting.alt || painting.title || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('load', () => img.classList.add('loaded'));
  img.src = painting.src;
  if (img.complete) img.classList.add('loaded');
  figure.appendChild(img);
  article.appendChild(figure);

  // Text column (price/buttons row, then title + meta) sits right of the image.
  const details = document.createElement('div');
  details.className = 'painting-details';

  // Top row: price with the buy actions beside it.
  const head = document.createElement('div');
  head.className = 'painting-head';

  const hasPrice = typeof painting.price === 'string' && painting.price.trim() !== '';
  if (!hasPrice) {
    // Data error: a painting with no price is not purchasable and shows no buttons.
    console.warn(`PAINTINGS: "${painting.itemId}" has no price — rendering as not purchasable (data error).`);
  }

  // 2 — price (large, up front)
  if (hasPrice) {
    const price = document.createElement('div');
    price.className = 'painting-price';
    price.textContent = painting.price;
    head.appendChild(price);
  }

  // 3 — buy actions (or Sold state, or nothing if unpriced)
  if (hasPrice && painting.status === 'available') {
    const actions = document.createElement('div');
    actions.className = 'painting-actions';

    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'btn btn-buy';
    buy.textContent = 'Buy now';
    // Express checkout: a one-item order for this piece.
    buy.addEventListener('click', () => {
      if (window.Checkout) window.Checkout.open([painting.itemId]);
    });

    const cart = document.createElement('button');
    cart.type = 'button';
    cart.className = 'btn btn-cart';
    cart.dataset.itemId = painting.itemId;
    cart.textContent = 'Add to cart';
    cart.addEventListener('click', () => {
      if (window.Cart) window.Cart.add(painting.itemId);
    });

    actions.append(buy, cart);
    head.appendChild(actions);
  } else if (painting.status === 'sold') {
    const sold = document.createElement('div');
    sold.className = 'painting-soldtag';
    sold.textContent = 'Sold';
    head.appendChild(sold);
  }

  // Price/buttons row goes in first (if there's anything in it).
  if (head.children.length) details.appendChild(head);

  // 4 — title (smaller, muted, below the buttons)
  const title = document.createElement('h2');
  title.className = 'painting-title';
  title.textContent = painting.title || '';
  details.appendChild(title);

  // 5 — medium · dimensions · year (smallest)
  const metaBits = [painting.medium, painting.dimensions, painting.year].filter(Boolean);
  if (metaBits.length) {
    const meta = document.createElement('p');
    meta.className = 'painting-meta';
    meta.textContent = metaBits.join(' · ');
    details.appendChild(meta);
  }

  article.appendChild(details);
  return article;
}

function renderFeed() {
  const feed = document.getElementById('shop-feed');
  if (!feed) return;

  if (PAINTINGS.length === 0) {
    feed.innerHTML = '<p class="shop-empty">New originals coming soon.</p>';
    return;
  }

  PAINTINGS.forEach((painting) => feed.appendChild(buildPiece(painting)));
  observeReveal();
}

// Look up a painting by id (used by the cart + checkout for display data).
function getPainting(itemId) {
  return PAINTINGS.find((p) => p.itemId === itemId);
}
window.getPainting = getPainting;

// Pull authoritative status from the server so purchased pieces show as sold.
// The server is the source of truth; falls back to the hardcoded status on error.
async function applyServerStatuses() {
  try {
    const res = await fetch('/api/catalog');
    if (!res.ok) return;
    const statuses = await res.json();
    PAINTINGS.forEach((p) => {
      const s = statuses[p.itemId];
      if (s) p.status = s === 'available' ? 'available' : 'sold';
    });
  } catch {
    // network/parse error — keep the hardcoded statuses
  }
}


// ── Email opt-in (inline, non-blocking) ───────────────────────────────────────
// Validates client-side, POSTs to /api/subscribe, shows a small inline state.

function initEmailOptin() {
  const form = document.getElementById('optin-form');
  if (!form) return;

  const input = document.getElementById('optin-email');
  const note = form.querySelector('.optin-note');
  const btn = form.querySelector('.optin-btn');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setNote(msg, isError) {
    if (!note) return;
    note.textContent = msg;
    note.classList.toggle('is-error', !!isError);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = (input.value || '').trim();

    if (!EMAIL_RE.test(value)) {
      setNote('Please enter a valid email address.', true);
      return;
    }

    if (btn) btn.disabled = true;
    setNote('Subscribing…', false);

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) throw new Error('request failed');
      setNote('Thanks — you’re on the list.', false);
      input.value = '';
    } catch {
      setNote('Something went wrong. Please try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}


// ── Scroll reveal (subtle fade / rise) ────────────────────────────────────────

function observeReveal() {
  const els = document.querySelectorAll('.reveal');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in-view'));
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        obs.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

  els.forEach((el) => io.observe(el));
}


// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await applyServerStatuses();           // server is the source of truth for sold
  renderFeed();                          // builds the pieces (and their buttons)
  if (window.Cart) window.Cart.init();   // count + button sync + drawer wiring
  if (window.Checkout) window.Checkout.init(); // checkout modal wiring
  initEmailOptin();

  const year = document.getElementById('footer-year');
  if (year) year.textContent = new Date().getFullYear();
});
