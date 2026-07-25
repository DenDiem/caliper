export const LISTING_PAGE_SCRIPT = `
(function () {
  function buildSimilarCardHtml(title, price, meta, hue) {
    return (
      '<a class="similar-card" href="/">' +
      '<div class="photo-placeholder" style="--hue:' + hue + '"></div>' +
      '<div class="similar-card-body">' +
      '<span class="similar-card-price">' + price + '</span>' +
      '<span class="similar-card-title">' + title + '</span>' +
      '<span class="similar-card-meta">' + meta + '</span>' +
      '</div>' +
      '</a>'
    );
  }

  function renderSimilarOffers() {
    var mount = document.getElementById('similar-mount');
    if (!mount) return;

    var cards = [
      buildSimilarCardHtml('Honda XL 750V Transalp 2023', '9 450 $', 'Vertex Moto \\u00b7 Kyiv', 25),
      buildSimilarCardHtml('Honda XL 750V Transalp 2024', '10 990 $', 'MotoPark Official \\u00b7 Dnipro', 72),
      buildSimilarCardHtml('Honda XL 750V Transalp 2021', '7 990 $', 'Bike House \\u00b7 Kharkiv', 118),
      buildSimilarCardHtml('Honda XL 750V Transalp 2022', '8 700 $', 'Andrii K. \\u00b7 Lviv', 165)
    ].join('');

    mount.classList.add('similar-offers');
    mount.setAttribute('data-caliper-ref', 'z-similar');
    mount.innerHTML = '<h2>Similar offers</h2><div class="similar-grid">' + cards + '</div>';
  }

  window.setTimeout(renderSimilarOffers, 1500);
})();

(function () {
  var trigger = document.getElementById('write-chat-trigger');
  if (!trigger) return;

  var openDialog = null;

  function closeDialog() {
    if (!openDialog) return;
    openDialog.remove();
    openDialog = null;
  }

  function openChatDialog() {
    if (openDialog) return;

    var overlay = document.createElement('div');
    overlay.className = 'chat-dialog-overlay';

    var panel = document.createElement('div');
    panel.className = 'chat-dialog-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Write in chat');
    panel.innerHTML =
      '<div class="chat-dialog-header">' +
      '<span>Message to Honda moto Odesa</span>' +
      '<button type="button" class="chat-dialog-close" aria-label="Close">\\u00d7</button>' +
      '</div>' +
      '<p class="chat-dialog-hint">Ask about availability, price, or delivery.</p>';

    var textarea = document.createElement('textarea');
    textarea.className = 'chat-dialog-input';
    textarea.placeholder = 'Hi, is this bike still available?';
    textarea.setAttribute('data-caliper-ref', 'z-chat-input');
    panel.appendChild(textarea);

    var actions = document.createElement('div');
    actions.className = 'chat-dialog-actions';
    actions.innerHTML = '<button type="button" class="chat-dialog-send">Send message</button>';
    panel.appendChild(actions);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    openDialog = overlay;

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeDialog();
    });

    var closeButton = panel.querySelector('.chat-dialog-close');
    if (closeButton) closeButton.addEventListener('click', closeDialog);

    var sendButton = actions.querySelector('.chat-dialog-send');
    if (sendButton) sendButton.addEventListener('click', closeDialog);

    textarea.focus();
  }

  trigger.addEventListener('click', openChatDialog);
})();
`;
