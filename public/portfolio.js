// ── Portfolio (DISPLAY ONLY) ────────────────────────────────────────────────
// Digital / illustration work for the standalone /portfolio/ page.
// This is a display-only data source — it has NO commerce fields and must never
// be merged with the PAINTINGS shop data. Image files live alongside this page
// in the ./portfolio/ directory, so paths here are bare filenames.

const PORTFOLIO = [
  { src: 'ILL670 -M2-Color.jpg',                      alt: 'ILL670 — Module 2' },
  { src: 'A6_1_Manners_type-only.jpg',                alt: 'Type Only' },
  { src: 'ILL670-M7 7_1  Midterm.jpg',                alt: 'ILL670 — Midterm' },
  { src: 'ILL670 -M3-Color.jpg',                      alt: 'ILL670 — Module 3' },
  { src: 'A9_1_Manners_ArticPuppies.jpg',             alt: 'Arctic Puppies' },
  { src: 'A9_1_Manners_baby-kid-teen_2.jpg',          alt: 'Baby · Kid · Teen' },
  { src: 'A10_1_Manners_adult page 1.jpg',            alt: 'Adult — Page 1' },
  { src: 'A10_1_Manners_adult page 2.jpg',            alt: 'Adult — Page 2' },
  { src: 'A11_1_Manners_Collection_1.jpg',            alt: 'Collection 1' },
  { src: 'A11_1_Manners_Mock_Ups.jpg',                alt: 'Mock Ups' },
  { src: 'A8_1_Maria_Manners_patterns&mock ups.jpg',  alt: 'Patterns & Mock Ups' },
  { src: 'A5_1_Manners_Pattern_1.jpg',                alt: 'Pattern 1' },
  { src: 'A5_1_Manners_Pattern_2.jpg',                alt: 'Pattern 2' },
  { src: 'A5_1_Manners_Pattern_3.jpg',                alt: 'Pattern 3' },
  { src: 'A5_1_Manners_Pattern_4.jpg',                alt: 'Pattern 4' },
];


// ── Gallery ───────────────────────────────────────────────────────────────────

function renderGallery() {
  const grid = document.getElementById('gallery-grid');

  if (PORTFOLIO.length === 0) {
    grid.innerHTML = '<p class="gallery-empty">Add images to the <code>portfolio/</code> directory and list them in the <code>PORTFOLIO</code> array in <code>portfolio.js</code>.</p>';
    return;
  }

  PORTFOLIO.forEach((image, index) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Open ${image.alt}`);

    const img = document.createElement('img');
    img.alt = image.alt;
    img.loading = 'lazy';
    img.decoding = 'async';

    // Fade in once the image has decoded
    img.addEventListener('load', () => img.classList.add('loaded'));
    // If already cached, the load event may have already fired
    if (img.complete) img.classList.add('loaded');

    img.src = image.src;
    item.appendChild(img);

    item.addEventListener('click', () => openLightbox(index));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(index);
      }
    });

    grid.appendChild(item);
  });
}


// ── Lightbox ──────────────────────────────────────────────────────────────────

let currentIndex = 0;

const lightbox  = document.getElementById('lightbox');
const lbImg     = document.getElementById('lb-img');
const lbClose   = document.getElementById('lb-close');
const lbPrev    = document.getElementById('lb-prev');
const lbNext    = document.getElementById('lb-next');
const lbBackdrop = document.getElementById('lb-backdrop');

function openLightbox(index) {
  currentIndex = index;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
  updateLightboxImage();
  lbClose.focus();
}

function closeLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
}

function updateLightboxImage() {
  const { src, alt } = PORTFOLIO[currentIndex];

  // Swap image with a brief fade
  lbImg.style.opacity = '0';
  lbImg.src = src;
  lbImg.alt = alt;
  lbImg.onload = () => { lbImg.style.opacity = '1'; };
  lbImg.style.transition = 'opacity 0.18s ease';

  lbPrev.disabled = currentIndex === 0;
  lbNext.disabled = currentIndex === PORTFOLIO.length - 1;
}

function prevImage() {
  if (currentIndex > 0) {
    currentIndex--;
    updateLightboxImage();
  }
}

function nextImage() {
  if (currentIndex < PORTFOLIO.length - 1) {
    currentIndex++;
    updateLightboxImage();
  }
}

lbClose.addEventListener('click', closeLightbox);
lbBackdrop.addEventListener('click', closeLightbox);
lbPrev.addEventListener('click', prevImage);
lbNext.addEventListener('click', nextImage);

document.addEventListener('keydown', (e) => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft')   prevImage();
  if (e.key === 'ArrowRight')  nextImage();
});


// ── Footer year ───────────────────────────────────────────────────────────────

document.getElementById('footer-year').textContent = new Date().getFullYear();


// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', renderGallery);
