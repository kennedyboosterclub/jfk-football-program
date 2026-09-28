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
  creditCard.href = settings.creditCardUrl;
  creditCard.target = '_blank';
  creditCard.rel = 'noopener noreferrer';
  creditCard.setAttribute('aria-label', 'Purchase pancake breakfast tickets by credit card');
  flyerCard.append(image, creditCard);
  flyerWrap.append(flyerCard);

  const venmo = node('section', 'breakfast-venmo');
  venmo.setAttribute('aria-label', 'Purchase pancake breakfast tickets');
  const message = node('div', 'breakfast-venmo-message');
  message.append(node('p', 'breakfast-venmo-kicker', 'Pancake Breakfast Tickets'));

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
  page.append(flyerWrap, venmo);
}
