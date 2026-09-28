export function normalizeBreakfast(value = {}) {
  return {
    enabled: value.enabled === true,
    date: value.date ?? 'Saturday, October 3, 2026',
    time: value.time ?? '8:00 AM – 10:00 AM',
    location: value.location ?? "Applebee’s • 9601 Lyndale Ave S, Bloomington, MN 55420",
    creditCardUrl: value.creditCardUrl ?? 'https://donate.stripe.com/3cI6oA4t7ex51vh23wfMA00',
  };
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function renderBreakfastPage(page, settings, options = {}) {
  const assetBase = options.assetBase || './';
  const flyerWrap = node('div', 'breakfast-flyer-wrap');
  const flyerCard = node('div', 'breakfast-flyer-card');
  const image = node('img', 'breakfast-flyer');
  image.src = `${assetBase}assets/pancake-breakfast-2026.jpg`;
  image.alt = 'Pancakes & Pigskin: Kennedy Football fundraiser. Saturday, October 3, 2026, 8–10 AM at Applebee’s, 9601 Lyndale Avenue, Bloomington. Students and seniors $10; adults $15.';
  image.loading = 'lazy';

  const creditCard = node('a', 'breakfast-credit-card', 'Click here to purchase tickets\nvia credit card');
  creditCard.textContent = '';
  creditCard.innerHTML = `<svg class="breakfast-ticket-shape" viewBox="0 0 1100 140" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="breakfast-ticket-gold" x2="0" y2="1"><stop stop-color="#ffc94b"/><stop offset="1" stop-color="#eaaa1b"/></linearGradient></defs><path d="M32 5 H1068 Q1068 28 1095 28 V50 Q1060 70 1095 90 V112 Q1068 112 1068 135 H32 Q32 112 5 112 V90 Q40 70 5 50 V28 Q32 28 32 5Z" fill="url(#breakfast-ticket-gold)" stroke="#d69b13" stroke-width="4"/><path d="M50 16 H1050 V124 H50Z" fill="none" stroke="#071d3c" stroke-width="3"/><path d="M61 24 H1039 V116 H61Z" fill="none" stroke="#a96d0b"/><text x="103" y="87" font-size="48" fill="#071d3c">★</text><text x="955" y="87" font-size="48" fill="#071d3c">★</text></svg>`;
  const ticketCopy = node('span', 'breakfast-ticket-copy');
  ticketCopy.append(node('span', '', 'Click here to purchase tickets'), node('strong', '', 'Via credit card'));
  creditCard.append(ticketCopy);
  creditCard.href = settings.creditCardUrl;
  creditCard.target = '_blank';
  creditCard.rel = 'noopener noreferrer';
  creditCard.setAttribute('aria-label', 'Purchase pancake breakfast tickets by credit card');
  flyerCard.append(image);
  flyerWrap.append(flyerCard);

  const venmo = node('section', 'breakfast-venmo');
  venmo.setAttribute('aria-label', 'Purchase pancake breakfast tickets');
  const message = node('div', 'breakfast-venmo-message');


  const door = node('div', 'breakfast-at-door');
  door.append(
    node('strong', '', 'Tickets available at the door'),
    node('span', '', 'Adult $15 • Student/Senior $10'),
  );

  const venmoDetails = node('div', 'breakfast-venmo-details');
  venmoDetails.append(
    node('h2', '', 'Pay with Venmo'),
    node('span', 'breakfast-venmo-handle', '@KennedyBoosterClub'),
    node('p', 'breakfast-venmo-instructions', 'Scan the QR code and include your name and ticket quantities in the payment note.'),
  );
  message.append(door, venmoDetails);

  const qr = node('div', 'breakfast-venmo-qr');
  const venmoImage = node('img');
  venmoImage.src = `${assetBase}assets/kennedy-booster-venmo-qr.png`;
  venmoImage.alt = 'Venmo QR code for Kennedy Football Booster Club, @KennedyBoosterClub';
  venmoImage.loading = 'eager';
  qr.append(venmoImage);

  venmo.append(message, qr);
  page.id = 'breakfast-page';
  page.append(flyerWrap, creditCard, venmo);
}
