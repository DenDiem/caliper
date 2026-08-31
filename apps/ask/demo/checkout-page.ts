import {renderDocument} from './layout';

// The bug this page reproduces on purpose: the first Place order succeeds, every later one is rejected
// by the (fake) API with a 409 and throws in the success handler, leaving the button stuck on "Saving…"
// with no visible error. A single screenshot of that state explains nothing — which is exactly the
// class of defect a trace exists for, and what the demo recording shows.
const SCRIPT = `
const form = document.querySelector('#order-form');
const button = document.querySelector('#place-order');
const status = document.querySelector('#order-status');
const devtools = window.__REDUX_DEVTOOLS_EXTENSION__;
const store = devtools ? devtools.connect({name: 'orders'}) : null;
let state = {orders: 0, lastOrderId: null};

if (store && store.init) store.init(state);

const dispatch = (type, patch) => {
  state = {...state, ...patch};
  if (store) store.send({type}, state);
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = 'Saving…';
  status.textContent = '';
  dispatch('[Orders] Save Requested', {});

  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {'content-type': 'application/json', authorization: 'Bearer demo.token.value'},
    body: JSON.stringify({
      email: document.querySelector('#email').value,
      card: document.querySelector('#card').value,
      quantity: Number(document.querySelector('#quantity').value),
    }),
  });

  const payload = await response.json();

  // The defect: nothing checks response.ok, so a 409 falls into the success path and the read of
  // payload.orderId.length throws — the button never leaves its saving state.
  console.log('[orders] response', response.status);
  dispatch('[Orders] Save Succeeded', {orders: state.orders + 1, lastOrderId: payload.orderId});
  status.textContent = 'Order ' + payload.orderId.slice(0, 8) + ' placed';
  button.disabled = false;
  button.textContent = 'Place order';
});
`;

const BODY = `
<header class="topbar">
  <div class="topbar-inner">
    <a class="breadcrumb-link" href="/">Listing</a>
    <span class="breadcrumb-sep">/</span>
    <span class="breadcrumb-current">Checkout</span>
  </div>
</header>

<main class="page" style="max-width: 560px; padding-top: 32px;">
  <h1 class="listing-title">Checkout</h1>
  <p class="spec-line">Honda XL 750V Transalp 2026 · 12 287 $</p>

  <form id="order-form" style="display: grid; gap: 14px; margin-top: 22px;">
    <label style="display: grid; gap: 6px;">
      <span class="spec-line">Email</span>
      <input id="email" type="email" value="rider@example.com" data-caliper-ref="z-email"
             style="padding: 10px 12px; border: 1px solid #e2e5ea; border-radius: 8px; font: inherit;" />
    </label>

    <label style="display: grid; gap: 6px;">
      <span class="spec-line">Card</span>
      <input id="card" value="4242 4242 4242 4242" data-caliper-ref="z-card"
             style="padding: 10px 12px; border: 1px solid #e2e5ea; border-radius: 8px; font: inherit;" />
    </label>

    <label style="display: grid; gap: 6px;">
      <span class="spec-line">Quantity</span>
      <input id="quantity" type="number" value="1" min="1" data-caliper-ref="z-quantity"
             style="padding: 10px 12px; border: 1px solid #e2e5ea; border-radius: 8px; font: inherit; width: 96px;" />
    </label>

    <button id="place-order" type="submit" data-caliper-ref="z-place-order"
            style="padding: 12px 18px; border: none; border-radius: 8px; background: #0a56f0; color: #fff; font: inherit; font-weight: 600; cursor: pointer;">
      Place order
    </button>

    <p id="order-status" class="spec-line" data-caliper-ref="z-order-status" style="min-height: 20px;"></p>
  </form>
</main>
`;

export const renderCheckoutPage = (): string =>
  renderDocument({title: 'Checkout — Caliper demo', body: BODY, script: SCRIPT});
