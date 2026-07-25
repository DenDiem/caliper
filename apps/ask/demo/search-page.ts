import {renderDocument} from './layout';
import {photoPlaceholder} from './placeholder';

interface SearchResult {
  title: string;
  price: string;
  seller: string;
  location: string;
  posted: string;
  tag: string;
  hue: number;
  ref?: string;
}

const RESULTS: readonly SearchResult[] = [
  {
    title: 'New Honda XL 750V Transalp 2026',
    price: '12 287 $',
    seller: 'Honda moto Odesa',
    location: 'Odesa',
    posted: 'Today',
    tag: 'New',
    hue: 0,
    ref: 'z-result-card',
  },
  {
    title: 'Honda XL 750V Transalp 2023',
    price: '9 450 $',
    seller: 'Vertex Moto',
    location: 'Kyiv',
    posted: 'Yesterday',
    tag: 'Used · 4 200 km',
    hue: 47,
  },
  {
    title: 'Honda XL 750V Transalp 2022',
    price: '8 700 $',
    seller: 'Andrii K.',
    location: 'Lviv',
    posted: '2 days ago',
    tag: 'Used · 11 300 km',
    hue: 94,
  },
  {
    title: 'New Honda XL 750V Transalp 2026',
    price: '12 550 $',
    seller: 'MotoPark Official',
    location: 'Dnipro',
    posted: 'Today',
    tag: 'New',
    hue: 141,
  },
  {
    title: 'Honda XL 750V Transalp 2021',
    price: '7 990 $',
    seller: 'Bike House',
    location: 'Kharkiv',
    posted: '3 days ago',
    tag: 'Used · 18 900 km',
    hue: 188,
  },
];

const renderResultCard = (result: SearchResult): string => `
<a class="result-card" href="/"${result.ref ? ` data-caliper-ref="${result.ref}"` : ''}>
  <div class="result-card-photo">${photoPlaceholder(result.hue)}</div>
  <div class="result-card-body">
    <span class="result-card-tag">${result.tag}</span>
    <span class="result-card-title">${result.title}</span>
    <span class="result-card-price">${result.price}</span>
    <span class="result-card-meta">${result.seller} · ${result.location} · ${result.posted}</span>
  </div>
</a>`;

export const renderSearchPage = (): string =>
  renderDocument({
    title: 'Caliper demo — All offers · Honda XL 750V Transalp',
    body: `
<header class="topbar">
  <div class="topbar-inner">
    <a class="breadcrumb-link" href="/">‹ Back to listing</a>
    <span class="breadcrumb-sep">·</span>
    <span class="breadcrumb-current">All offers · Honda XL 750V Transalp</span>
  </div>
</header>
<main class="page">
  <h1 class="listing-title">All offers · Honda XL 750V Transalp</h1>
  <span class="results-count">22 offers found</span>
  <div class="results-list">
    ${RESULTS.map(renderResultCard).join('')}
  </div>
</main>`,
  });
