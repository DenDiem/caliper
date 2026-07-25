export const DEMO_STYLES = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: #f3f5f7;
  color: #1c2733;
  line-height: 1.45;
}
a { color: inherit; text-decoration: none; }
button { font: inherit; cursor: pointer; }
table { border-collapse: collapse; }
h1, h2, p { margin: 0; }

.page { max-width: 1180px; margin: 0 auto; padding: 0 24px 64px; }

.topbar { background: #ffffff; border-bottom: 1px solid #e2e5ea; }
.topbar-inner {
  max-width: 1180px; margin: 0 auto; padding: 14px 24px;
  display: flex; align-items: center; gap: 8px; font-size: 14px;
}
.breadcrumb-link { color: #0a56f0; font-weight: 600; }
.breadcrumb-link:hover { text-decoration: underline; }
.breadcrumb-sep { color: #9aa4b2; }
.breadcrumb-current { color: #6b7785; }
.next-listing { margin-left: auto; color: #0a56f0; font-weight: 600; }
.next-listing:hover { text-decoration: underline; }

.listing-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr);
  gap: 24px;
  margin-top: 20px;
}

.photo-placeholder {
  --hue: 205;
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, hsl(var(--hue) 55% 90%), hsl(calc(var(--hue) + 35) 50% 74%));
  color: hsl(var(--hue) 35% 38%);
  border-radius: 10px;
}

.gallery-main {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #e2e5ea;
}
.gallery-main .photo-placeholder { border-radius: 0; }
.gallery-watermark {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 42px; font-weight: 700; letter-spacing: 4px;
  color: rgba(255, 255, 255, 0.35);
  transform: rotate(-18deg);
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.gallery-counter {
  position: absolute; left: 12px; bottom: 12px;
  background: rgba(20, 26, 33, 0.65); color: #ffffff;
  font-size: 13px; font-weight: 600;
  padding: 4px 10px; border-radius: 999px;
}
.gallery-arrow {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px; border-radius: 50%;
  border: none; background: rgba(255, 255, 255, 0.9);
  display: flex; align-items: center; justify-content: center;
  color: #1c2733; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}
.gallery-arrow--prev { left: 12px; }
.gallery-arrow--next { right: 12px; }
.gallery-fullscreen {
  position: absolute; top: 12px; right: 12px;
  width: 32px; height: 32px; border-radius: 8px;
  border: none; background: rgba(20, 26, 33, 0.55); color: #ffffff;
  display: flex; align-items: center; justify-content: center;
}

.thumb-strip {
  position: relative;
  margin-top: 10px;
  display: flex; align-items: center; gap: 8px;
}
.thumb-track {
  display: flex; gap: 8px; overflow-x: auto;
  scrollbar-width: none;
}
.thumb-track::-webkit-scrollbar { display: none; }
.thumb {
  flex: 0 0 auto; width: 78px; height: 58px; border-radius: 8px; overflow: hidden;
  border: 2px solid transparent; padding: 0;
}
.thumb--active { border-color: #0a56f0; }
.thumb .photo-placeholder { border-radius: 6px; }
.thumb .photo-placeholder svg { width: 22px; height: 22px; }
.thumb-scroll {
  flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid #e2e5ea; background: #ffffff; color: #6b7785;
  display: flex; align-items: center; justify-content: center;
}

.sidebar-col { display: flex; flex-direction: column; gap: 14px; }
.listing-title { font-size: 22px; font-weight: 700; }
.spec-line { color: #6b7785; font-size: 14px; }
.badge-in-stock {
  align-self: flex-start;
  background: #e3f8ec; color: #128a49;
  font-size: 13px; font-weight: 600;
  padding: 4px 10px; border-radius: 999px;
}

.price-block { border-top: 1px solid #e2e5ea; padding-top: 14px; }
.price-main { display: flex; align-items: center; gap: 6px; }
.price-amount { font-size: 30px; font-weight: 800; }
.price-info { border: none; background: none; color: #9aa4b2; display: flex; padding: 0; }
.price-updated { display: block; margin-top: 2px; font-size: 12px; color: #9aa4b2; }

.seller-card {
  border: 1px solid #e2e5ea; border-radius: 12px; padding: 16px;
  background: #ffffff;
  display: flex; flex-direction: column; gap: 10px;
}
.seller-dealer-row { font-size: 13px; font-weight: 600; color: #0a56f0; }
.seller-identity { display: flex; align-items: center; gap: 10px; }
.seller-logo {
  width: 44px; height: 44px; border-radius: 50%;
  background: #0a56f0; color: #ffffff; font-weight: 700; font-size: 15px;
  display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
}
.seller-name-block { display: flex; flex-direction: column; }
.seller-name { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 14px; color: #17a35a; }
.seller-status { font-size: 12px; color: #6b7785; }
.seller-meta { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: #6b7785; }
.seller-offers-link { font-size: 13px; font-weight: 600; color: #0a56f0; }

.cta-phone {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: #17a35a; color: #ffffff; border: none; border-radius: 10px;
  padding: 12px; font-size: 16px; font-weight: 700;
}
.cta-phone:hover { background: #128a49; }
.no-commission { font-size: 12px; color: #9aa4b2; text-align: center; }
.write-chat-link {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid #e2e5ea; background: #ffffff; color: #1c2733;
  border-radius: 10px; padding: 10px; font-size: 14px; font-weight: 600;
}
.write-chat-link:hover { background: #f3f5f7; }

.below-fold { margin-top: 32px; border-top: 1px solid #e2e5ea; padding-top: 20px; }
.interest-line {
  display: inline-flex; align-items: center; gap: 6px;
  color: #b4530f; background: #fdf1e4;
  padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 600;
}
.listing-title-repeat { font-size: 20px; font-weight: 700; margin-top: 18px; }
.price-row { font-size: 16px; font-weight: 700; margin-top: 10px; }
.price-average { color: #6b7785; font-weight: 500; }

.specs-section, .description-section, .similar-offers { margin-top: 32px; }
.specs-table { width: 100%; border: 1px solid #e2e5ea; border-radius: 10px; overflow: hidden; }
.specs-table tr:nth-child(odd) { background: #f8f9fb; }
.specs-table th, .specs-table td { text-align: left; padding: 10px 14px; font-size: 14px; }
.specs-table th { color: #6b7785; font-weight: 500; width: 40%; }
.specs-table td { font-weight: 600; }

.description-text { font-size: 14px; color: #37414d; max-width: 760px; }

.similar-grid, .results-list { display: grid; gap: 14px; }
.similar-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); margin-top: 14px; }

.similar-card, .result-card {
  border: 1px solid #e2e5ea; border-radius: 12px; overflow: hidden;
  background: #ffffff; display: block;
}
.similar-card .photo-placeholder { border-radius: 0; aspect-ratio: 4 / 3; }
.similar-card-body, .result-card-body { padding: 12px; display: flex; flex-direction: column; gap: 4px; }
.similar-card-price, .result-card-price { font-weight: 700; font-size: 15px; }
.similar-card-title, .result-card-title { font-size: 13px; font-weight: 600; }
.similar-card-meta, .result-card-meta { font-size: 12px; color: #6b7785; }

.result-card { display: flex; gap: 14px; padding: 12px; align-items: stretch; }
.result-card-photo { flex: 0 0 160px; border-radius: 8px; overflow: hidden; }
.result-card-photo .photo-placeholder { aspect-ratio: 4 / 3; height: 100%; border-radius: 8px; }
.result-card-body { flex: 1; justify-content: center; }
.result-card-tag {
  align-self: flex-start; font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 999px; background: #e3f8ec; color: #128a49;
}

.results-count { color: #6b7785; margin-top: 4px; margin-bottom: 18px; display: block; }

.chat-dialog-overlay {
  position: fixed; inset: 0; background: rgba(20, 26, 33, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.chat-dialog-panel {
  background: #ffffff; border-radius: 12px; padding: 18px;
  width: min(420px, calc(100vw - 32px));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  display: flex; flex-direction: column; gap: 10px;
}
.chat-dialog-header { display: flex; align-items: center; justify-content: space-between; font-weight: 700; }
.chat-dialog-close { border: none; background: none; font-size: 18px; line-height: 1; color: #6b7785; padding: 0; }
.chat-dialog-hint { font-size: 13px; color: #6b7785; }
.chat-dialog-input { min-height: 96px; border: 1px solid #e2e5ea; border-radius: 8px; padding: 10px; font: inherit; resize: vertical; }
.chat-dialog-actions { display: flex; justify-content: flex-end; }
.chat-dialog-send { background: #0a56f0; color: #ffffff; border: none; border-radius: 8px; padding: 10px 16px; font-weight: 600; }

@media (max-width: 860px) {
  .listing-grid { grid-template-columns: 1fr; }
  .result-card { flex-direction: column; }
  .result-card-photo { flex-basis: auto; }
}
`;
