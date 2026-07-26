import {checkIcon, chevronIcon, eyeIcon, fullscreenIcon, infoIcon, phoneIcon, chatIcon} from './icons';
import {renderDocument} from './layout';
import {LISTING_PAGE_SCRIPT} from './listing-script';
import {photoPlaceholder} from './placeholder';

const TITLE = 'New Honda XL 750V Transalp 2026';
const SPEC_LINE = '1st generation · E-Clutch (92 hp) · Base';
const THUMB_COUNT = 7;

const SPEC_ROWS: readonly [string, string][] = [
  ['Brand', 'Honda'],
  ['Model', 'XL 750V Transalp'],
  ['Year', '2026'],
  ['Mileage', '0 km'],
  ['Engine type', 'Parallel-twin, liquid-cooled'],
  ['Displacement', '755 cm³'],
  ['Power', '92 hp'],
  ['Transmission', 'E-Clutch, 6-speed manual'],
  ['Fuel type', 'Petrol (95)'],
  ['Color', 'Ross White'],
  ['Condition', 'New'],
  ['VIN', 'Available on request'],
];

const DESCRIPTION =
  'The 2026 Honda XL750V Transalp returns as a versatile adventure-tourer built around a 755 cm³ ' +
  'parallel-twin engine tuned for 92 hp and a broad spread of usable torque. The optional E-Clutch ' +
  'system removes the clutch lever from stop-and-go traffic without turning the bike into an ' +
  'automatic, and the 21-inch front wheel keeps the platform capable off tarmac. This unit is a ' +
  'dealer demo model, first registration pending, sold with full manufacturer warranty and the ' +
  'first scheduled service included.';

const renderTopbar = (): string => `
<header class="topbar">
  <div class="topbar-inner">
    <a class="breadcrumb-link" href="/search">All offers</a>
    <span class="breadcrumb-sep">·</span>
    <span class="breadcrumb-current">Honda XL 750V Transalp</span>
    <a class="next-listing" href="/">Next listing ›</a>
  </div>
</header>`;

const renderGallery = (): string => {
  const thumbs = Array.from({length: THUMB_COUNT}, (_, index) => {
    const activeClass = index === 0 ? 'thumb--active' : '';
    return `<button class="thumb ${activeClass}" type="button" aria-label="Photo ${index + 1} of 22">${photoPlaceholder(index)}</button>`;
  }).join('');

  return `
<section class="gallery-col">
  <div class="gallery-main" data-caliper-ref="z-gallery">
    ${photoPlaceholder(0)}
    <div class="gallery-watermark">DEMO MOTO</div>
    <button class="gallery-arrow gallery-arrow--prev" type="button" aria-label="Previous photo">${chevronIcon('left')}</button>
    <button class="gallery-arrow gallery-arrow--next" type="button" aria-label="Next photo">${chevronIcon('right')}</button>
    <button class="gallery-fullscreen" type="button" aria-label="View fullscreen">${fullscreenIcon()}</button>
    <span class="gallery-counter">1 of 22</span>
  </div>
  <div class="thumb-strip" data-caliper-ref="z-thumbs">
    <div class="thumb-track">${thumbs}</div>
    <button class="thumb-scroll" type="button" aria-label="Scroll thumbnails">${chevronIcon('right')}</button>
  </div>
</section>`;
};

const renderSidebar = (): string => `
<aside class="sidebar-col">
  <h1 class="listing-title">${TITLE}</h1>
  <p class="spec-line">${SPEC_LINE}</p>
  <span class="badge-in-stock" data-caliper-ref="z-badge">In stock</span>

  <div class="price-block" data-caliper-ref="z-price">
    <div class="price-main">
      <span class="price-amount">12 287 $</span>
      <button class="price-info" type="button" aria-label="Price details">${infoIcon()}</button>
    </div>
    <span class="price-updated">Price as of 24 Jul</span>
  </div>

  <div class="seller-card" data-caliper-ref="z-seller">
    <a class="seller-dealer-row" href="/search">Official dealer ›</a>
    <div class="seller-identity">
      <span class="seller-logo">HM</span>
      <div class="seller-name-block">
        <span class="seller-name">Honda moto Odesa ${checkIcon()}</span>
        <span class="seller-status">Open · until 18:00</span>
      </div>
    </div>
    <ul class="seller-meta">
      <li>4 months on the platform</li>
      <li>Odesa</li>
    </ul>
    <a class="seller-offers-link" href="/search">61 offers from this seller ›</a>
    <button class="cta-phone" type="button" data-caliper-ref="z-cta-phone">${phoneIcon()} (050) XXX XX XX</button>
    <p class="no-commission">No commission on purchase</p>
    <button class="write-chat-link" type="button" id="write-chat-trigger">${chatIcon()} Write in chat</button>
  </div>
</aside>`;

const renderBelowFold = (): string => `
<section class="below-fold">
  <p class="interest-line" data-caliper-ref="z-interest">${eyeIcon()} 6 users are watching this</p>
  <h2 class="listing-title-repeat">${TITLE}</h2>
  <p class="spec-line">${SPEC_LINE}</p>
  <p class="price-row">12 287 $ · 10 737 € · 549 000 ₴ · <span class="price-average">Average price</span></p>
</section>`;

const renderSpecsTable = (): string => {
  const rows = SPEC_ROWS.map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join('');
  return `
<section class="specs-section">
  <h2>Specifications</h2>
  <table class="specs-table" data-caliper-ref="z-specs">
    <tbody>${rows}</tbody>
  </table>
</section>`;
};

const renderDescription = (): string => `
<section class="description-section">
  <h2>Description</h2>
  <p class="description-text" data-testid="listing-description">${DESCRIPTION}</p>
</section>`;

const renderSimilarOffersMount = (): string => '<section id="similar-mount"></section>';

export const renderListingPage = (): string =>
  renderDocument({
    title: `Caliper demo — ${TITLE}`,
    body: `
${renderTopbar()}
<main class="page">
  <div class="listing-grid">
    ${renderGallery()}
    ${renderSidebar()}
  </div>
  ${renderBelowFold()}
  ${renderSpecsTable()}
  ${renderDescription()}
  ${renderSimilarOffersMount()}
</main>`,
    script: LISTING_PAGE_SCRIPT,
  });
