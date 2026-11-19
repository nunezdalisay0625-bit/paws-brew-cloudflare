import { auth, db, router, json, error, secrets } from '@appdeploy/sdk';
import { notifySubscribers, realtimeSubscriptionRoutes } from './realtime-subscribers';

type ReservationBody = {
  name?: string;
  phone?: string;
  date?: string;
  time?: string;
  guests?: string | number;
  pets?: string | boolean;
  notes?: string;
};

type OrderItem = {
  name?: string;
  price?: number;
  quantity?: number;
};

type OrderBody = {
  name?: string;
  phone?: string;
  method?: string;
  address?: string;
  notes?: string;
  items?: OrderItem[];
};

type StaffContext = {
  event: any;
};

const normalizePhone = (value: string) => value.replace(/[\s()-]/g, '');
const isPhilippineMobile = (value: string) => /^(09\d{9}|\+639\d{9})$/.test(value);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, character => {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    if (character === '>') return '&gt;';
    return '&quot;';
  });

async function authorizeStaff(ctx: StaffContext, action: string) {
  const user = await auth.getUser(ctx.event);
  if (!user) return error('Please sign in to ' + action + '.', 401);
  if (!user.email || !auth.hasScope(user, 'email')) {
    return error('Your sign-in did not provide an email address.', 403);
  }

  const names = await secrets.listSecretNames();
  if (!names.includes('ORDER_ADMIN_EMAILS')) {
    return error('Staff access is not configured.', 503);
  }

  const allowed = (await secrets.readSecret('ORDER_ADMIN_EMAILS'))
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  const email = user.email.toLowerCase();
  const additionalStaffEmails = ['nikka.lizardo@gmail.com'];

  if (!allowed.includes(email) && !additionalStaffEmails.includes(email)) {
    return error('This account is not authorized to ' + action + '.', 403);
  }
  return null;
}

async function sendOrderEmail(order: {
  orderReference: string;
  name: string;
  phone: string;
  method: string;
  address: string;
  notes: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: string;
}) {
  const configuredNames = await secrets.listSecretNames();
  const required = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'ORDERS_EMAIL'];
  if (!required.every(name => configuredNames.includes(name))) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const apiKey = await secrets.readSecret('RESEND_API_KEY');
  const from = await secrets.readSecret('RESEND_FROM_EMAIL');
  const to = await secrets.readSecret('ORDERS_EMAIL');
  const itemLines = order.items.map(item =>
    '<li>' + item.quantity + ' × ' + escapeHtml(item.name) + ' — ₱' +
    (item.price * item.quantity) + '</li>'
  ).join('');
  const html = '<h2>New Paws &amp; Brew online order</h2>' +
    '<p><b>Order reference:</b> ' + escapeHtml(order.orderReference) + '</p>' +
    '<p><b>Customer:</b> ' + escapeHtml(order.name) + '</p>' +
    '<p><b>Mobile:</b> ' + escapeHtml(order.phone) + '</p>' +
    '<p><b>Fulfillment:</b> ' + escapeHtml(order.method) + '</p>' +
    (order.method === 'Delivery'
      ? '<p><b>Delivery address:</b> ' + escapeHtml(order.address) + '</p>'
      : '') +
    '<h3>Items</h3><ul>' + itemLines + '</ul>' +
    '<p>Subtotal: ₱' + order.subtotal + '</p>' +
    '<p>Delivery fee: ₱' + order.deliveryFee + '</p>' +
    '<h3>Exact amount due: ₱' + order.total + '</h3>' +
    '<p><b>Payment:</b> Awaiting GCash reference and manual staff verification.</p>' +
    '<p><b>Notes:</b> ' + escapeHtml(order.notes || 'None') + '</p>' +
    '<p>Received: ' + escapeHtml(order.createdAt) + '</p>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'New Paws & Brew order ' + order.orderReference,
      html,
      reply_to: to,
    }),
  });

  if (!response.ok) {
    console.warn('Order email delivery failed with status ' + response.status);
    return { sent: false, reason: 'email_provider_error' };
  }
  return { sent: true };
}

const allowedItems = new Map<string, number>([
  ['Americano', 69],
  ['Spanish Latte', 89],
  ['Caramel Macchiato', 89],
  ['French Vanilla', 89],
  ['White Chocolate Mocha', 89],
  ['Mocha', 89],
  ['Drip Coffee', 89],
  ['Egg Coffee', 120],
  ['Sparkling Blueberry', 69],
  ['Sparkling Lychee', 69],
  ['Sparkling Mango', 69],
  ['Strawberry Milkshake', 95],
  ['Blueberry Milkshake', 95],
  ['Lychee Milkshake', 95],
  ['Mango Milkshake', 95],
  ['Mixed Berries Milkshake', 125],
  ['Chocolate Heaven Waffles', 149],
  ['Classic Waffles', 79],
  ['Blueberry Waffles', 149],
  ['Strawberry Waffles', 149],
  ['Ham & Cheese', 89],
  ['Quesadilla', 105],
  ['Chicken Wrap', 149],
  ['Italian Spaghetti', 180],
  ['Creamy Carbonara', 180],
  ['Pesto Pasta', 180],
  ['Bihon-Canton with Bagnet', 150],
  ['Loaded Nachos', 180],
  ['Loaded Fries', 90],
  ['Liempo Silog', 180],
  ['Porkchop Silog', 149],
  ['Boneless Chicken Silog', 149],
  ['Skinless Longganisa Silog', 99],
  ['Hotsilog', 99],
  ['Tocilog', 99],
  ['Bangsilog', 149],
  ['Steamed Rice', 20],
  ['Chicken Strips', 180],
  ['Chicken Poppers', 195],
  ['Empanada', 105],
  ['Cheese Sticks', 100],
  ['Potato Rolls', 100],
  ['Tofu Rolls', 100],
  ['Pup Cup', 45],
  ['Chicken Pasta', 65],
  ['Liver Pasta', 65],
  ['Mixed Veggies', 65],
  ['Paw Sunrise', 75],
  ['Paw Splash', 75],
  ['Blueberry Mojito', 95],
  ['Strawberry Mojito', 95],
  ['Watermelon Mojito', 95],
  ['The Price is Right (1 & 2)', 75],
  ['Tequila Mojito Twist', 95],
  ['Paws Rainbow', 95],
  ['Paws Tropical Colada', 120],
  ['Bottomless Tequila Mojito', 450],
]);

export const handler = router({
  'GET /api/_healthcheck': [
    async () => json({ message: 'Success' }),
  ],

  'POST /api/reservations': [
    async ({ body }) => {
      const input = (body ?? {}) as ReservationBody;
      const name = String(input.name ?? '').trim().slice(0, 120);
      const phone = normalizePhone(String(input.phone ?? ''));
      const date = String(input.date ?? '').trim();
      const time = String(input.time ?? '').trim();
      const guests = Number(input.guests ?? 0);

      if (!name || !isPhilippineMobile(phone) || !date || !time ||
          !Number.isInteger(guests) || guests < 1 || guests > 20) {
        return error('Please provide your name, a valid Philippine mobile number, date, time, and guest count.', 400);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        return error('Please provide a valid reservation date and time.', 400);
      }

      const createdAt = new Date().toISOString();
      const [id] = await db.add('paws_brew_reservations', [{
        name,
        phone,
        date,
        time,
        guests,
        pets: input.pets === 'Yes' || input.pets === true,
        notes: String(input.notes ?? '').trim().slice(0, 1000),
        status: 'pending',
        createdAt,
      }]);

      if (!id) return error('We could not save your reservation request. Please try again.', 503);
      await notifySubscribers('staff_reservations', 'all', { action: 'created', id });
      return json({ ok: true, reservationId: id, status: 'pending' }, 201);
    },
  ],

  'POST /api/orders': [
    async ({ body }) => {
      const input = (body ?? {}) as OrderBody;
      const name = String(input.name ?? '').trim().slice(0, 120);
      const phone = normalizePhone(String(input.phone ?? '')).slice(0, 30);
      const method = String(input.method ?? '');
      const address = String(input.address ?? '').trim().slice(0, 500);
      const notes = String(input.notes ?? '').trim().slice(0, 1000);
      const rawItems = Array.isArray(input.items) ? input.items : [];

      if (!name || !isPhilippineMobile(phone) ||
          !['Pickup', 'Delivery'].includes(method) ||
          rawItems.length < 1 || rawItems.length > 50) {
        return error('Please provide your name, a valid Philippine mobile number, pickup or delivery, and at least one item.', 400);
      }
      if (method === 'Delivery' && !address) {
        return error('Please enter your complete delivery address.', 400);
      }

      const items: Array<{ name: string; price: number; quantity: number }> = [];
      for (const item of rawItems) {
        const itemName = String(item.name ?? '').trim();
        const price = allowedItems.get(itemName);
        const quantity = Number(item.quantity);
        if (price === undefined || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
          return error('One or more order items are invalid. Please refresh the menu and try again.', 400);
        }
        items.push({ name: itemName, price, quantity });
      }

      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const deliveryFee = method === 'Delivery' ? 75 : 0;
      const total = subtotal + deliveryFee;
      const orderReference = 'PB-' + Date.now().toString(36).toUpperCase();
      const createdAt = new Date().toISOString();
      const orderRecord = {
        orderReference,
        name,
        phone,
        method,
        address,
        notes,
        items,
        subtotal,
        deliveryFee,
        total,
        status: 'pending_confirmation',
        paymentMethod: 'GCash',
        paymentStatus: 'awaiting_reference',
        gcashReferenceNumber: '',
        paymentReferenceSubmittedAt: null,
        paymentVerifiedAt: null,
        createdAt,
      };

      const [id] = await db.add('paws_brew_orders', [orderRecord]);
      if (!id) return error('We could not save your order. Please try again.', 503);
      await notifySubscribers('staff_orders', 'all', { action: 'created', id });

      let emailSent = false;
      try {
        const emailResult = await sendOrderEmail({
          orderReference,
          name,
          phone,
          method,
          address,
          notes,
          items,
          subtotal,
          deliveryFee,
          total,
          createdAt,
        });
        emailSent = emailResult.sent;
      } catch {
        console.warn('Order saved but notification email could not be sent.');
      }

      return json({
        ok: true,
        orderId: id,
        orderReference,
        total,
        status: 'pending_confirmation',
        paymentStatus: 'awaiting_reference',
        emailSent,
      }, 201);
    },
  ],

  'POST /api/orders/:id/payment-reference': [
    async (ctx) => {
      const input = (ctx.body ?? {}) as { phone?: string; referenceNumber?: string };
      const phone = normalizePhone(String(input.phone ?? ''));
      const referenceNumber = String(input.referenceNumber ?? '').trim().replace(/\s+/g, '');

      if (!isPhilippineMobile(phone) || !/^[A-Za-z0-9-]{6,30}$/.test(referenceNumber)) {
        return error('Enter a valid GCash payment reference number.', 400);
      }

      const [record] = await db.get<Record<string, unknown>>(
        'paws_brew_orders',
        [ctx.params.id],
        { consistent: true }
      );
      if (!record) return error('Order not found.', 404);

      const savedPhone = normalizePhone(String(record.phone ?? ''));
      if (savedPhone !== phone) return error('Order details could not be verified.', 403);
      if (record.paymentStatus === 'verified') {
        return error('This payment has already been verified by staff.', 409);
      }

      const [updated] = await db.tx.update('paws_brew_orders', [{
        id: ctx.params.id,
        record: {
          gcashReferenceNumber: referenceNumber,
          paymentStatus: 'pending_verification',
          paymentReferenceSubmittedAt: new Date().toISOString(),
        },
      }], { patch: true });

      if (!updated) return error('Your payment reference could not be saved. Please try again.', 409);
      await notifySubscribers('staff_orders', 'all', { action: 'payment_reference_submitted', id: ctx.params.id });
      return json({
        ok: true,
        orderReference: String(record.orderReference ?? ''),
        paymentStatus: 'pending_verification',
      });
    },
  ],

  'GET /api/staff/orders': [
    async (ctx) => {
      const denied = await authorizeStaff(ctx, 'view staff orders');
      if (denied) return denied;
      const result = await db.list('paws_brew_orders', { limit: 100 });
      const orders = result.items.sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      );
      return json({ orders, nextToken: result.nextToken ?? null });
    },
  ],

  'PUT /api/staff/orders/:id/payment': [
    async (ctx) => {
      const denied = await authorizeStaff(ctx, 'verify staff payments');
      if (denied) return denied;

      const input = (ctx.body ?? {}) as { paymentStatus?: string };
      if (input.paymentStatus !== 'verified') {
        return error('Please choose a valid payment verification action.', 400);
      }

      const [record] = await db.get<Record<string, unknown>>(
        'paws_brew_orders',
        [ctx.params.id],
        { consistent: true }
      );
      if (!record) return error('Order not found.', 404);
      if (!String(record.gcashReferenceNumber ?? '').trim()) {
        return error('The customer has not submitted a GCash reference number yet.', 409);
      }

      const [updated] = await db.tx.update('paws_brew_orders', [{
        id: ctx.params.id,
        record: {
          paymentStatus: 'verified',
          paymentVerifiedAt: new Date().toISOString(),
        },
      }], { patch: true });

      if (!updated) return error('Payment verification could not be saved. Please refresh and retry.', 409);
      await notifySubscribers('staff_orders', 'all', { action: 'payment_verified', id: ctx.params.id });
      return json({ ok: true, id: ctx.params.id, paymentStatus: 'verified' });
    },
  ],

  'PUT /api/staff/orders/:id': [
    async (ctx) => {
      const denied = await authorizeStaff(ctx, 'update staff orders');
      if (denied) return denied;

      const input = (ctx.body ?? {}) as { status?: string };
      const status = String(input.status ?? '');
      const valid = [
        'pending_confirmation',
        'confirmed',
        'preparing',
        'out_for_delivery',
        'ready',
        'completed',
        'cancelled',
      ];
      if (!valid.includes(status)) return error('Please choose a valid order status.', 400);

      const [record] = await db.get<Record<string, unknown>>(
        'paws_brew_orders',
        [ctx.params.id],
        { consistent: true }
      );
      if (!record) return error('Order not found.', 404);

      const paymentStatus = String(record.paymentStatus ?? '');
      if (paymentStatus && paymentStatus !== 'verified' &&
          !['pending_confirmation', 'cancelled'].includes(status)) {
        return error('Verify the GCash payment before moving this order forward.', 409);
      }

      const [updated] = await db.tx.update('paws_brew_orders', [{
        id: ctx.params.id,
        record: { status },
      }], { patch: true });

      if (!updated) return error('Order status could not be updated. Please refresh and try again.', 409);
      await notifySubscribers('staff_orders', 'all', { action: 'status_changed', id: ctx.params.id, status });
      return json({ ok: true, id: ctx.params.id, status });
    },
  ],

  'GET /api/staff/reservations': [
    async (ctx) => {
      const denied = await authorizeStaff(ctx, 'view table reservations');
      if (denied) return denied;
      const result = await db.list('paws_brew_reservations', { limit: 100 });
      const reservations = result.items.sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      );
      return json({ reservations, nextToken: result.nextToken ?? null });
    },
  ],

  'PUT /api/staff/reservations/:id': [
    async (ctx) => {
      const denied = await authorizeStaff(ctx, 'update table reservations');
      if (denied) return denied;

      const input = (ctx.body ?? {}) as { status?: string };
      const status = String(input.status ?? '');
      const valid = ['pending', 'confirmed', 'seated', 'completed', 'declined', 'cancelled'];
      if (!valid.includes(status)) return error('Please choose a valid reservation status.', 400);

      const [record] = await db.get<Record<string, unknown>>(
        'paws_brew_reservations',
        [ctx.params.id],
        { consistent: true }
      );
      if (!record) return error('Reservation not found.', 404);

      const [updated] = await db.tx.update('paws_brew_reservations', [{
        id: ctx.params.id,
        record: { status },
      }], { patch: true });

      if (!updated) return error('Reservation status could not be updated. Please refresh and try again.', 409);
      await notifySubscribers('staff_reservations', 'all', { action: 'status_changed', id: ctx.params.id, status });
      return json({ ok: true, id: ctx.params.id, status });
    },
  ],
  ...realtimeSubscriptionRoutes,
});