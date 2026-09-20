// Hosted button IDs supplied by the Booster Club's PayPal exports.
const MERCHANT_ID = 'KDRE2BG6GTXTJ';
const TICKETS = [
  { id: 'N55XVUGN9YEW8', name: 'Adult', price: '$15' },
  { id: 'JKW6LXVYFAB8E', name: 'Student / Senior', price: '$10' },
];

export function normalizeBreakfast(value = {}) {
  return {
    enabled: value.enabled === true,
    date: value.date ?? 'Saturday, October 3, 2026',
    time: value.time ?? '8:00 AM – 10:00 AM',
    location: value.location ?? "Applebee’s • 9601 Lyndale Ave S, Bloomington, MN 55420",
  };
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function renderBreakfast(settings, { preview = false } = {}) {
  const section = node('section', 'breakfast-tickets');
  section.id = 'breakfast-tickets';
  section.setAttribute('aria-labelledby', 'breakfast-heading');
  section.append(node('p', 'breakfast-kicker', 'Support Kennedy Football'));
  const heading = node('h2', '', 'Pancake Breakfast');
  heading.id = 'breakfast-heading';
  section.append(heading, node('p', 'breakfast-details', `${settings.date} • ${settings.time}`),
    node('p', 'breakfast-details', settings.location),
    node('p', '', 'All proceeds support our football athletes. Add each ticket type to your cart, then check out once.'));
  const cart = node('div', 'breakfast-cart');
  if (preview) {
    cart.append(node('span', 'breakfast-preview-button', 'View cart (preview)'));
  } else {
    const button = node('paypal-cart-button');
    button.setAttribute('data-id', 'pp-view-cart');
    cart.append(button);
  }
  section.append(cart);
  const grid = node('div', 'breakfast-ticket-grid');
  TICKETS.forEach(ticket => {
    const card = node('div', 'breakfast-ticket-card');
    card.append(node('h3', '', ticket.name), node('p', 'breakfast-price', `${ticket.price} / ticket`));
    if (preview) card.append(node('span', 'breakfast-preview-button', 'Add to cart (preview)'));
    else {
      const button = node('paypal-add-to-cart-button');
      button.setAttribute('data-id', ticket.id);
      card.append(button);
    }
    grid.append(card);
  });
  section.append(grid, node('p', 'breakfast-receipt', 'Bring your purchase confirmation to check in at the door.'));
  if (preview) section.append(node('p', 'breakfast-receipt', 'Preview only. Payment buttons work on the public program after publishing.'));
  else {
    const status = node('p', 'breakfast-payment-status', 'Loading secure PayPal checkout…');
    status.setAttribute('role', 'status');
    section.append(status);
  }
  return section;
}

export function renderBreakfastPage(page, settings, options = {}) {
  const image = node('img', 'breakfast-flyer');
  image.src = `${options.assetBase || './'}assets/pancake-breakfast-2026.jpg`;
  image.alt = 'Pancakes & Pigskin: Kennedy Football fundraiser. Saturday, October 3, 2026, 8–10 AM at Applebee’s, 9601 Lyndale Avenue, Bloomington. Students and seniors $10; adults $15.';
  image.loading = 'lazy';
  const footer = node('div', 'breakfast-page-actions');
  const buy = node('button', 'breakfast-buy-button', 'Buy Tickets');
  buy.type = 'button';
  footer.append(buy);
  const printLink = node('p', 'breakfast-print-link', 'Buy online: jfkbooster.org/#breakfast-tickets');
  const dialog = node('dialog', 'breakfast-dialog');
  dialog.setAttribute('aria-label', 'Buy pancake breakfast tickets');
  const close = node('button', 'breakfast-close', 'Close ✕');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  dialog.append(close, renderBreakfast(settings, { preview: options.preview === true }));
  let initialized = false;
  buy.addEventListener('click', () => {
    dialog.showModal();
    if (!options.preview && !initialized) {
      initialized = true;
      initializeBreakfast(dialog);
    }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  page.id = 'breakfast-page';
  page.append(image, footer, printLink, dialog);
  // A shareable anchor opens the same mixed-ticket cart without a separate page.
  if (!options.preview && window.location.hash === '#breakfast-tickets') {
    setTimeout(() => { if (page.isConnected) buy.click(); }, 0);
  }
}

let sdkPromise;
function loadPayPal() {
  if (window.cartPaypal) return Promise.resolve(window.cartPaypal);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.paypalobjects.com/ncp/cart/cart.js';
    script.dataset.merchantId = MERCHANT_ID;
    let timer;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      sdkPromise = undefined;
      reject(new Error('PayPal checkout could not load'));
    };
    script.onload = () => {
      clearTimeout(timer);
      if (window.cartPaypal) resolve(window.cartPaypal);
      else fail();
    };
    script.onerror = fail;
    timer = setTimeout(fail, 20000);
    document.head.append(script);
  });
  return sdkPromise;
}

export async function initializeBreakfast(container) {
  const section = container.querySelector('#breakfast-tickets');
  if (!section) return; // No PayPal requests when the fundraiser is switched off.
  const status = section.querySelector('.breakfast-payment-status');
  try {
    const paypal = await loadPayPal();
    if (!section.isConnected) return;
    await paypal.Cart({ id: 'pp-view-cart' });
    for (const ticket of TICKETS) await paypal.AddToCart({ id: ticket.id });
    status.textContent = 'Secure checkout through PayPal. Available card and wallet options appear at checkout.';
  } catch (error) {
    status.textContent = 'Checkout is temporarily unavailable. Refresh this page to try again.';
    console.error('Breakfast checkout:', error);
  }
}
