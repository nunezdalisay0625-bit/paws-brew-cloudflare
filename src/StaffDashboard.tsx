import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, api } from './lib/api';
import {
  RefreshCw,
  ShoppingBag,
  Clock3,
  CheckCircle2,
  Copy,
  Check,
  CalendarDays,
  ShieldCheck,
  Bell,
  X,
} from 'lucide-react';

type Order = {
  id: string;
  orderReference: string;
  name: string;
  phone: string;
  method: string;
  address?: string;
  notes?: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  status: string;
  paymentStatus?: string;
  gcashReferenceNumber?: string;
  createdAt: string;
};

type Reservation = {
  id: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  pets: boolean;
  notes?: string;
  status: string;
  createdAt: string;
};

type GeneratedSms = { text: string; copied: boolean };

const statuses = [
  ['pending_confirmation', 'Pending'],
  ['confirmed', 'Confirmed'],
  ['preparing', 'Preparing'],
  ['out_for_delivery', 'Out for Delivery'],
  ['ready', 'Ready for Pickup'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];

const reservationStatuses = [
  ['pending', 'Pending'],
  ['confirmed', 'Confirmed'],
  ['seated', 'Seated'],
  ['completed', 'Completed'],
  ['declined', 'Declined'],
  ['cancelled', 'Cancelled'],
];

const peso = (amount: number) => '₱' + Number(amount || 0).toLocaleString('en-PH');

function manilaDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

function dateKeyToUtc(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function orderReportPeriods(orders: Order[], now = new Date()) {
  const todayKey = manilaDateKey(now);
  const todayUtc = dateKeyToUtc(todayKey);
  const weekday = todayUtc.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const weekStart = new Date(todayUtc);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  const weekStartKey = weekStart.toISOString().slice(0, 10);
  const monthStartKey = todayKey.slice(0, 7) + '-01';

  const periods = {
    today: { orders: 0, sales: 0 },
    week: { orders: 0, sales: 0 },
    month: { orders: 0, sales: 0 },
  };

  orders.forEach(order => {
    const created = new Date(order.createdAt);
    if (Number.isNaN(created.getTime())) return;
    const key = manilaDateKey(created);
    const saleValue = order.status === 'cancelled' ? 0 : Number(order.total || 0);

    if (key === todayKey) {
      periods.today.orders += 1;
      periods.today.sales += saleValue;
    }
    if (key >= weekStartKey && key <= todayKey) {
      periods.week.orders += 1;
      periods.week.sales += saleValue;
    }
    if (key >= monthStartKey && key <= todayKey) {
      periods.month.orders += 1;
      periods.month.sales += saleValue;
    }
  });

  return periods;
}

function paymentStatusLabel(status?: string) {
  if (status === 'awaiting_reference') return 'Awaiting customer reference';
  if (status === 'pending_verification') return 'Reference submitted · pending verification';
  if (status === 'verified') return 'Payment verified by staff';
  return 'Legacy order · payment status not recorded';
}

function reservationStatusLabel(status: string) {
  return reservationStatuses.find(item => item[0] === status)?.[1] || status;
}

function formatReservationTime(reservation: Reservation) {
  const date = new Date(reservation.date + 'T' + reservation.time + ':00');
  return date.toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function smsForOrder(order: Order, status: string) {
  const name = order.name || 'there';
  const reference = order.orderReference;
  switch (status) {
    case 'confirmed':
      return 'Hi ' + name + '! Your GCash payment has been verified, and your Paws & Brew order ' +
        reference + ' is confirmed. We are now preparing your order. Thank you for ordering with us!';
    case 'preparing':
      return 'Hi ' + name + '! Your Paws & Brew order ' + reference +
        ' is now being prepared. We will send you another update once it is ready. Thank you for waiting!';
    case 'out_for_delivery':
      return 'Hi ' + name + '! Your Paws & Brew order ' + reference +
        ' is now out for delivery. Please keep your phone available so our rider can contact you. Enjoy!';
    case 'ready':
      return 'Hi ' + name + '! Your Paws & Brew order ' + reference +
        ' is ready for pickup at Glen’s Resort. You may now drop by to collect your order. Thank you!';
    case 'completed':
      return 'Hi ' + name + '! Your Paws & Brew order ' + reference +
        ' has been completed. We hope you enjoyed your food and drinks. Thank you for supporting our small business!';
    case 'cancelled':
      return 'Hi ' + name + '. We are sorry, but your Paws & Brew order ' + reference +
        ' has been cancelled. Please contact us through our Facebook page if you need assistance. Thank you for understanding.';
    case 'pending_confirmation':
    default:
      return 'Hi ' + name + '! We received your Paws & Brew order ' + reference +
        '. Your order is pending confirmation. We will update you shortly. Thank you!';
  }
}

function smsForReservation(reservation: Reservation, status: string) {
  const name = reservation.name || 'there';
  const when = formatReservationTime(reservation);
  const guestCount = Number(reservation.guests || 0);
  const guestLabel = guestCount + (guestCount === 1 ? ' guest' : ' guests');
  const petNote = reservation.pets ? ' We have also noted that you are bringing a pet.' : '';
  switch (status) {
    case 'confirmed':
      return 'Hi ' + name + '! Your table reservation at Paws & Brew for ' + when +
        ' for ' + guestLabel + ' is confirmed.' + petNote + ' We look forward to seeing you!';
    case 'seated':
      return 'Hi ' + name + '! Your table at Paws & Brew is ready for your party of ' +
        guestLabel + '. Please let our staff know when you arrive. Enjoy your visit!';
    case 'completed':
      return 'Hi ' + name + '! Thank you for visiting Paws & Brew. We hope you and your guests had a lovely time. See you again!';
    case 'declined':
      return 'Hi ' + name + '. We are sorry, but we cannot accommodate your table request for ' +
        when + '. Please message Paws & Brew so we can help find another time.';
    case 'cancelled':
      return 'Hi ' + name + '. Your Paws & Brew table reservation for ' + when +
        ' has been cancelled. Please message us if you would like to request another time.';
    case 'pending':
    default:
      return 'Hi ' + name + '! We received your Paws & Brew table reservation request for ' +
        when + ' for ' + guestLabel + '.' + petNote + ' We will confirm with you shortly. Thank you!';
  }
}

export default function StaffDashboard() {
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('active');
  const [reportPeriod, setReportPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [busy, setBusy] = useState('');
  const [paymentBusy, setPaymentBusy] = useState('');
  const [reservationBusy, setReservationBusy] = useState('');
  const [reservationNotice, setReservationNotice] = useState('');
  const [generatedSms, setGeneratedSms] = useState<Record<string, GeneratedSms>>({});
  const [generatedReservationSms, setGeneratedReservationSms] =
    useState<Record<string, GeneratedSms>>({});
  const knownReservationIds = useRef<Set<string>>(new Set());
  const initialReservationsLoaded = useRef(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setMsg('');
    const errors: string[] = [];

    try {
      const orderResult = await api.get('/api/staff/orders');
      setOrders(orderResult.data?.orders ?? []);
    } catch {
      errors.push('Unable to load orders. Please refresh or use an authorized staff account.');
    }

    try {
      const reservationResult = await api.get('/api/staff/reservations');
      const nextReservations: Reservation[] = reservationResult.data?.reservations ?? [];

      if (initialReservationsLoaded.current) {
        nextReservations.forEach(reservation => knownReservationIds.current.add(reservation.id));
        initialReservationsLoaded.current = false;
        const pendingCount = nextReservations.filter(reservation => reservation.status === 'pending').length;
        if (pendingCount > 0) {
          setReservationNotice(pendingCount + ' pending table reservation(s) need review.');
        }
      } else {
        const fresh = nextReservations.filter(reservation =>
          !knownReservationIds.current.has(reservation.id)
        );
        if (fresh.length > 0) {
          setReservationNotice('New table reservation received from ' + fresh[0].name + '.');
        }
        nextReservations.forEach(reservation => knownReservationIds.current.add(reservation.id));
      }

      setReservations(nextReservations);
    } catch {
      errors.push('Unable to load table reservations.');
    }

    setMsg(errors.join(' '));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    let live = true;
    auth.getUser().then(currentUser => {
      if (live) setUser(currentUser ? { email: currentUser.email, name: currentUser.name } : null);
    }).catch(() => {
      if (live) setMsg('Unable to restore sign-in. Please try again.');
    }).finally(() => {
      if (live) setChecking(false);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const timer = window.setInterval(() => { void load(); }, 20000);
    return () => window.clearInterval(timer);
  }, [user, load]);

  async function updateOrder(order: Order, status: string) {
    setBusy(order.id);
    setMsg('');
    try {
      await api.put('/api/staff/orders/' + encodeURIComponent(order.id), { status });
      setGeneratedSms(current => ({
        ...current,
        [order.id]: { text: smsForOrder(order, status), copied: false },
      }));
      await load();
    } catch {
      setMsg('Could not update this order. Verify payment first if the order is awaiting GCash verification, then retry.');
    } finally {
      setBusy('');
    }
  }

  async function verifyPayment(order: Order) {
    setPaymentBusy(order.id);
    setMsg('');
    try {
      await api.put('/api/staff/orders/' + encodeURIComponent(order.id) + '/payment', {
        paymentStatus: 'verified',
      });
      setOrders(current => current.map(item =>
        item.id === order.id ? { ...item, paymentStatus: 'verified' } : item
      ));
      await load();
    } catch {
      setMsg('Could not verify this payment. Confirm the submitted GCash reference before retrying.');
    } finally {
      setPaymentBusy('');
    }
  }

  async function updateReservation(reservation: Reservation, status: string) {
    setReservationBusy(reservation.id);
    setMsg('');
    try {
      await api.put('/api/staff/reservations/' + encodeURIComponent(reservation.id), { status });
      setGeneratedReservationSms(current => ({
        ...current,
        [reservation.id]: {
          text: smsForReservation(reservation, status),
          copied: false,
        },
      }));
      await load();
    } catch {
      setMsg('Could not update this reservation. Please refresh and retry.');
    } finally {
      setReservationBusy('');
    }
  }

  async function copySms(id: string) {
    const item = generatedSms[id];
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.text);
      setGeneratedSms(current => ({
        ...current,
        [id]: { ...current[id], copied: true },
      }));
    } catch {
      setMsg('Copy was unavailable on this device. Please select and copy the message manually.');
    }
  }

  async function copyReservationSms(id: string) {
    const item = generatedReservationSms[id];
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.text);
      setGeneratedReservationSms(current => ({
        ...current,
        [id]: { ...current[id], copied: true },
      }));
    } catch {
      setMsg('Copy was unavailable on this device. Please select and copy the message manually.');
    }
  }

  const activeOrders = orders.filter(order =>
    !['completed', 'cancelled'].includes(order.status)
  ).length;
  const completedOrders = orders.filter(order => order.status === 'completed').length;
  const salesReport = useMemo(() => orderReportPeriods(orders), [orders]);
  const pendingReservations = reservations.filter(reservation =>
    reservation.status === 'pending'
  ).length;
  const shownOrders = useMemo(
    () => orders.filter(order => filter === 'all' ||
      (filter === 'active'
        ? !['completed', 'cancelled'].includes(order.status)
        : order.status === filter)),
    [orders, filter]
  );

  if (checking) {
    return <main className="staff-page"><div className="staff-panel">Checking staff access…</div></main>;
  }

  if (!user) {
    return (
      <main className="staff-page">
        <section className="staff-panel staff-login">
          <div className="staff-mark">🐾</div>
          <p className="staff-eyebrow">PAWS & BREW · STAFF ONLY</p>
          <h1>Staff Dashboard</h1>
          <p className="staff-muted">
            This page is protected by Cloudflare Access. Sign in with an authorized staff email
            through the Cloudflare Access prompt, then reload this page.
          </p>
          {msg && <p className="staff-error">{msg}</p>}
          <button className="staff-primary" onClick={() => window.location.reload()}>
            Check staff access again
          </button>
          <a href="/" className="staff-back">← Customer website</a>
        </section>
      </main>
    );
  }

  return (
    <main className="staff-page">
      <header className="staff-header">
        <div>
          <p className="staff-eyebrow">PAWS & BREW · STAFF ONLY</p>
          <h1>Staff Dashboard</h1>
          <p className="staff-muted">Signed in as {user.email || user.name}</p>
        </div>
        <div className="staff-actions">
          <button className="staff-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      <section className="staff-stats">
        <div className="staff-stat"><ShoppingBag /><b>{orders.length}<small>All orders</small></b></div>
        <div className="staff-stat"><Clock3 /><b>{activeOrders}<small>Active orders</small></b></div>
        <div className="staff-stat"><CalendarDays /><b>{pendingReservations}<small>Pending reservations</small></b></div>
        <div className="staff-stat"><CheckCircle2 /><b>{completedOrders}<small>Completed orders</small></b></div>
      </section>

      <section className="staff-section staff-sales-report">
        <div className="staff-section-head">
          <div>
            <p className="staff-eyebrow">SALES OVERVIEW</p>
            <h2>Orders &amp; sales report</h2>
          </div>
          <span className="staff-muted">Philippine peso · Asia/Manila</span>
        </div>
        <div className="staff-report-controls">
          <label htmlFor="sales-period">Report period</label>
          <select id="sales-period" value={reportPeriod} onChange={event => setReportPeriod(event.target.value as 'today' | 'week' | 'month')}>
            <option value="today">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        <div className="staff-report-grid">
          <article className="staff-report-card">
            <span>{reportPeriod === 'today' ? 'Today' : reportPeriod === 'week' ? 'This week (Monday to today)' : 'This month (1st to today)'}</span>
            <strong>{salesReport[reportPeriod].orders}</strong>
            <small>Number of orders</small>
            <b>{peso(salesReport[reportPeriod].sales)}</b>
            <small>Total sales</small>
          </article>
        </div>
        <p className="staff-report-note">
          Order counts include all orders received. Sales value excludes cancelled orders and includes
          orders awaiting payment verification. Amounts are based on the order date in Philippine time.
        </p>
      </section>

      {reservationNotice && (
        <div className="staff-reservation-notice" role="status" aria-live="polite">
          <Bell size={18} />
          <span>{reservationNotice}</span>
          <button onClick={() => setReservationNotice('')} aria-label="Dismiss reservation notice">
            <X size={16} />
          </button>
        </div>
      )}

      {msg && <p className="staff-error">{msg}</p>}

      <section className="staff-section">
        <div className="staff-section-head">
          <div>
            <p className="staff-eyebrow">CUSTOMER ORDERS</p>
            <h2>Online orders</h2>
          </div>
          <span className="staff-muted">{orders.length} total</span>
        </div>

        <nav className="staff-filters">
          {['active', 'all', 'completed', 'cancelled'].map(value => (
            <button
              key={value}
              className={filter === value ? 'selected' : ''}
              onClick={() => setFilter(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </nav>

        {loading && !orders.length && <p>Loading orders…</p>}
        {!loading && !shownOrders.length && (
          <section className="staff-empty">
            <ShoppingBag />
            <h2>No orders to show</h2>
            <p>New customer orders appear here.</p>
          </section>
        )}

        <section className="staff-orders">
          {shownOrders.map(order => {
            const orderChoices = statuses.filter(status => {
              if (status[0] === 'out_for_delivery' && order.method !== 'Delivery') return false;
              if (status[0] === 'ready' && order.method === 'Delivery') return false;
              if (order.paymentStatus && order.paymentStatus !== 'verified' &&
                  !['pending_confirmation', 'cancelled'].includes(status[0])) return false;
              return true;
            });

            return (
              <article className="staff-order-card" key={order.id}>
                <div className="staff-order-top">
                  <b>{order.orderReference}</b>
                  <span className={'staff-status status-' + order.status}>
                    {statuses.find(status => status[0] === order.status)?.[1] || order.status}
                  </span>
                </div>
                <p className="staff-muted">{new Date(order.createdAt).toLocaleString('en-PH')}</p>
                <div className="staff-customer">
                  <h2>{order.name}</h2>
                  <a href={'tel:' + order.phone}>{order.phone}</a>
                  <span>
                    {order.method}{order.method === 'Delivery' && order.address ? ' · ' + order.address : ''}
                  </span>
                </div>
                <ul className="staff-items">
                  {(order.items || []).map((item, index) => (
                    <li key={index}>
                      {item.quantity} × {item.name}
                      <b>{peso(item.price * item.quantity)}</b>
                    </li>
                  ))}
                </ul>
                {order.notes && <p className="staff-notes">Note: {order.notes}</p>}
                <div className="staff-total">Total <strong>{peso(order.total)}</strong></div>

                <section className="staff-payment-panel">
                  <div className="staff-payment-line">
                    <b>GCash payment</b>
                    <span className={
                      'staff-payment-status ' +
                      (order.paymentStatus === 'verified'
                        ? 'verified'
                        : order.paymentStatus === 'pending_verification'
                          ? 'pending'
                          : 'awaiting')
                    }>
                      {paymentStatusLabel(order.paymentStatus)}
                    </span>
                  </div>
                  {order.gcashReferenceNumber ? (
                    <p>Payment reference: <strong>{order.gcashReferenceNumber}</strong></p>
                  ) : (
                    <p className="staff-muted">No payment reference submitted yet.</p>
                  )}
                  {order.paymentStatus === 'pending_verification' && (
                    <button
                      className="staff-verify-payment"
                      disabled={paymentBusy === order.id}
                      onClick={() => verifyPayment(order)}
                    >
                      <ShieldCheck size={16} />
                      {paymentBusy === order.id ? 'Saving verification…' : 'Mark GCash payment verified'}
                    </button>
                  )}
                </section>

                <label className="staff-status-control">
                  Update order status
                  <select
                    value={order.status}
                    disabled={busy === order.id}
                    onChange={event => updateOrder(order, event.target.value)}
                  >
                    {orderChoices.map(status => (
                      <option key={status[0]} value={status[0]}>{status[1]}</option>
                    ))}
                  </select>
                </label>

                {generatedSms[order.id] && (
                  <section className="staff-sms-panel">
                    <div className="staff-sms-heading">
                      <b>Customer SMS · Ready to send</b>
                      <span>Copy and send manually</span>
                    </div>
                    <textarea readOnly value={generatedSms[order.id].text} rows={4} aria-label="Generated order SMS" />
                    <button className="staff-copy-sms" onClick={() => copySms(order.id)}>
                      {generatedSms[order.id].copied ? <Check size={16} /> : <Copy size={16} />}
                      {generatedSms[order.id].copied ? 'Copied' : 'Copy SMS'}
                    </button>
                  </section>
                )}
              </article>
            );
          })}
        </section>
      </section>

      <section className="staff-section">
        <div className="staff-section-head">
          <div>
            <p className="staff-eyebrow">TABLE BOOKINGS</p>
            <h2>Online table reservations</h2>
          </div>
          <span className="staff-muted">
            {pendingReservations} pending · live updates across staff devices
          </span>
        </div>

        {!loading && !reservations.length && (
          <section className="staff-empty">
            <CalendarDays />
            <h2>No table reservations yet</h2>
            <p>Customer bookings from the website will appear here.</p>
          </section>
        )}

        <section className="staff-reservations-grid">
          {reservations.map(reservation => (
            <article className="staff-reservation-card" key={reservation.id}>
              <div className="staff-order-top">
                <b>{reservation.name}</b>
                <span className={'staff-status status-' + reservation.status}>
                  {reservationStatusLabel(reservation.status)}
                </span>
              </div>
              <p className="staff-muted">
                Received {new Date(reservation.createdAt).toLocaleString('en-PH')}
              </p>
              <div className="staff-reservation-details">
                <div className="staff-reservation-detail">
                  <small>Mobile number</small>
                  <a href={'tel:' + reservation.phone}>{reservation.phone}</a>
                </div>
                <div className="staff-reservation-detail">
                  <small>Reservation date &amp; time</small>
                  <strong>{formatReservationTime(reservation)}</strong>
                </div>
                <div className="staff-reservation-detail">
                  <small>Guest count</small>
                  <strong>{reservation.guests} {reservation.guests === 1 ? 'guest' : 'guests'}</strong>
                </div>
                <div className="staff-reservation-detail">
                  <small>Bringing pets?</small>
                  <strong>{reservation.pets ? 'Yes' : 'No'}</strong>
                </div>
              </div>
              <div className="staff-reservation-notes">
                <b>Notes</b>
                <p>{reservation.notes || 'No special requests.'}</p>
              </div>
              <label className="staff-status-control">
                Update reservation status
                <select
                  value={reservation.status}
                  disabled={reservationBusy === reservation.id}
                  onChange={event => updateReservation(reservation, event.target.value)}
                >
                  {reservationStatuses.map(status => (
                    <option key={status[0]} value={status[0]}>{status[1]}</option>
                  ))}
                </select>
              </label>

              {generatedReservationSms[reservation.id] && (
                <section className="staff-sms-panel">
                  <div className="staff-sms-heading">
                    <b>Reservation SMS · Ready to send</b>
                    <span>Copy and send manually</span>
                  </div>
                  <textarea
                    readOnly
                    value={generatedReservationSms[reservation.id].text}
                    rows={4}
                    aria-label="Generated reservation SMS"
                  />
                  <button
                    className="staff-copy-sms"
                    onClick={() => copyReservationSms(reservation.id)}
                  >
                    {generatedReservationSms[reservation.id].copied
                      ? <Check size={16} />
                      : <Copy size={16} />}
                    {generatedReservationSms[reservation.id].copied ? 'Copied' : 'Copy SMS'}
                  </button>
                </section>
              )}
            </article>
          ))}
        </section>
      </section>

      <footer className="staff-footer">
        Live updates across staff devices · SMS messages are copied for staff to send manually ·
        <a href="#home"> Customer website</a>
      </footer>
    </main>
  );
}
