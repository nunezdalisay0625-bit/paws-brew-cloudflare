import { useMemo, useState } from 'react';
import StaffDashboard from './StaffDashboard';
import PaymentInstructions from './PaymentInstructions';
import { api } from './lib/api';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  MapPin,
  PawPrint,
  ShoppingBag,
  ShoppingCart,
  Plus,
  Minus,
  Truck,
  Store,
  MessageCircle,
  X,
} from 'lucide-react';

const FACEBOOK = 'https://www.facebook.com/share/18MMXp3Dra/';

const menu = [
  {
    category: 'Coffee',
    items: [
      ['Americano', 69],
      ['Spanish Latte', 89],
      ['Caramel Macchiato', 89],
      ['French Vanilla', 89],
      ['White Chocolate Mocha', 89],
      ['Mocha', 89],
      ['Drip Coffee', 89],
      ['Egg Coffee', 120],
    ],
  },
  {
    category: 'Sparkling Drinks',
    items: [
      ['Sparkling Blueberry', 69],
      ['Sparkling Lychee', 69],
      ['Sparkling Mango', 69],
    ],
  },
  {
    category: 'Milkshakes',
    items: [
      ['Strawberry Milkshake', 95],
      ['Blueberry Milkshake', 95],
      ['Lychee Milkshake', 95],
      ['Mango Milkshake', 95],
      ['Mixed Berries Milkshake', 125],
    ],
  },
  {
    category: 'Waffles & Sandwiches',
    items: [
      ['Chocolate Heaven Waffles', 149],
      ['Classic Waffles', 79],
      ['Blueberry Waffles', 149],
      ['Strawberry Waffles', 149],
      ['Ham & Cheese', 89],
      ['Quesadilla', 105],
      ['Chicken Wrap', 149],
    ],
  },
  {
    category: 'Pasta & Sharing Meals',
    note: 'Pasta dishes are good for 2–3 persons.',
    items: [
      ['Italian Spaghetti', 180],
      ['Creamy Carbonara', 180],
      ['Pesto Pasta', 180],
      ['Bihon-Canton with Bagnet', 150],
    ],
  },
  {
    category: 'Rice Meals',
    items: [
      ['Liempo Silog', 180],
      ['Porkchop Silog', 149],
      ['Boneless Chicken Silog', 149],
      ['Skinless Longganisa Silog', 99],
      ['Hotsilog', 99],
      ['Tocilog', 99],
      ['Bangsilog', 149],
      ['Steamed Rice', 20],
    ],
  },
  {
    category: 'Snacks',
    items: [
      ['Chicken Strips', 180],
      ['Chicken Poppers', 195],
      ['Loaded Nachos', 180],
      ['Loaded Fries', 90],
      ['Empanada', 105],
      ['Cheese Sticks', 100],
      ['Potato Rolls', 100],
      ['Tofu Rolls', 100],
    ],
  },
  {
    category: 'Pet Menu',
    items: [
      ['Pup Cup', 45],
      ['Chicken Pasta', 65],
      ['Liver Pasta', 65],
      ['Mixed Veggies', 65],
    ],
  },
  {
    category: 'Cocktails',
    items: [
      ['Paw Sunrise', 75],
      ['Paw Splash', 75],
      ['Blueberry Mojito', 95],
      ['Strawberry Mojito', 95],
      ['Watermelon Mojito', 95],
      ['Paws Rainbow', 95],
      ['Paws Tropical Colada', 120],
      ['Bottomless Tequila Mojito', 450],
    ],
  },
];

function App() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<Array<{ name: string; price: number; quantity: number }>>([]);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderSending, setOrderSending] = useState(false);
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [paymentOrder, setPaymentOrder] = useState<{
    orderId: string;
    orderReference: string;
    total: number;
    name: string;
    phone: string;
    method: string;
  } | null>(null);
  const [orderForm, setOrderForm] = useState({
    name: '',
    phone: '',
    method: 'Pickup',
    address: '',
    notes: '',
  });
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booking, setBooking] = useState({
    name: '',
    phone: '',
    date: '',
    time: '16:00',
    guests: '2',
    pets: 'No',
    notes: '',
  });
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const categories = useMemo(
    () => ['All', ...menu.map(section => section.category)],
    []
  );
  const visibleMenu =
    activeCategory === 'All'
      ? menu
      : menu.filter(section => section.category === activeCategory);

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const deliveryFee = orderForm.method === 'Delivery' ? 75 : 0;
  const orderTotal = subtotal + deliveryFee;

  function addToCart(name: string, price: number) {
    setCart(current => {
      const existing = current.find(item => item.name === name);
      if (existing) {
        return current.map(item => item.name === name
          ? { ...item, quantity: item.quantity + 1 }
          : item);
      }
      return [...current, { name, price, quantity: 1 }];
    });
  }

  function changeCartQuantity(name: string, amount: number) {
    setCart(current => current
      .map(item => item.name === name ? { ...item, quantity: item.quantity + amount } : item)
      .filter(item => item.quantity > 0));
  }

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderSending(true);
    setOrderError('');
    try {
      const response = await api.post('/api/orders', {
        ...orderForm,
        items: cart.map(item => ({ name: item.name, price: item.price, quantity: item.quantity })),
        subtotal,
        deliveryFee,
        total: orderTotal,
      });
      const savedOrderId = String(response.data?.orderId ?? '');
      const savedOrderReference = String(response.data?.orderReference ?? '');
      if (!savedOrderId || !savedOrderReference) {
        throw new Error('The saved order did not return its payment details. Please contact Paws & Brew before submitting again.');
      }
      setOrderReference(savedOrderReference);
      setPaymentOrder({
        orderId: savedOrderId,
        orderReference: savedOrderReference,
        total: Number(response.data?.total ?? orderTotal),
        name: orderForm.name,
        phone: orderForm.phone,
        method: orderForm.method,
      });
      setOrderOpen(false);
      setCart([]);
    } catch {
      setOrderError('We could not submit your order. Please try again or message us on Facebook.');
    } finally {
      setOrderSending(false);
    }
  }

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setErrorMessage('');
    try {
      await api.post('/api/reservations', booking);
      setSubmitted(true);
    } catch {
      setErrorMessage(
        'We could not send your reservation request right now. Please message us on Facebook instead.'
      );
    } finally {
      setSending(false);
    }
  }

  if (window.location.hash === "#staff") return <StaffDashboard />;
  if (paymentOrder) return <PaymentInstructions order={paymentOrder} onBack={() => setPaymentOrder(null)} />;

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Paws & Brew home">
          <img
            src="/resources/paws-and-brew-logo.png"
            alt="Official Paws & Brew logo"
          />
          <span>
            <strong>Paws & Brew</strong>
            <small>GLEN'S RESORT · PET-FRIENDLY CAFE</small>
          </span>
        </a>
        <nav>
          <a href="#menu">Menu</a>
          <button className="nav-order" onClick={() => { setOrderOpen(true); setOrderSubmitted(false); }}>
            <ShoppingCart size={17} /> Order {cartCount > 0 ? `(${cartCount})` : 'online'}
          </button>
          <button
            className="nav-book"
            onClick={() => {
              setBookingOpen(true);
              setSubmitted(false);
            }}
          >
            Book a table
          </button>
        </nav>
      </header>

      <main id="home">
        <section className="hero">
          <img
            className="hero-photo"
            src="/resources/cafe-seating.jpg"
            alt="Seating area at Paws & Brew Cafe"
          />
          <div className="hero-shade" />
          <div className="hero-content">
            <div className="eyebrow">
              <PawPrint size={16} /> GLEN'S RESORT · POLANGUI, ALBAY
            </div>
            <h1>
              Good coffee.
              <br />
              <em>Happy paws.</em>
            </h1>
            <p>
              Your cozy, pet-friendly stop for coffee, comfort food, and good
              company. Bring your furry bestie along!
            </p>
            <div className="hero-actions">
              <a className="primary-btn" href="#menu">
                <ShoppingCart size={19} /> Order online
                <ArrowRight size={18} />
              </a>
              <a className="outline-btn" href="#menu">
                <ShoppingBag size={18} /> Browse menu
              </a>
              <button
                className="outline-btn"
                onClick={() => {
                  setBookingOpen(true);
                  setSubmitted(false);
                }}
              >
                <CalendarDays size={18} /> Book a table
              </button>
            </div>
            <div className="hero-note">
              <span className="open-dot" /> Open daily · 4:00 PM – 12:00
              midnight
            </div>
          </div>
        </section>

        <section className="intro-strip">
          <div>
            <Coffee />
            <span>
              <b>Good coffee</b>
              <small>Your favorite cup, made with care</small>
            </span>
          </div>
          <div>
            <PawPrint />
            <span>
              <b>Pet-friendly</b>
              <small>Bring your leashed furry friends</small>
            </span>
          </div>
          <div>
            <Clock3 />
            <span>
              <b>Open daily</b>
              <small>4:00 PM – 12:00 midnight</small>
            </span>
          </div>
        </section>

        <section className="menu-section" id="menu">
          <div className="section-heading">
            <span className="eyebrow dark">
              <PawPrint size={15} /> SOMETHING FOR EVERYONE
            </span>
            <h2>
              Find your new <em>favorite.</em>
            </h2>
            <p>
              From coffee and comfort food to treats made for your four-legged
              companions.
            </p>
          </div>
          <div className="category-tabs" aria-label="Menu categories">
            {categories.map(category => (
              <button
                key={category}
                className={activeCategory === category ? 'active' : ''}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="menu-grid">
            {visibleMenu.map(section => (
              <article className="menu-card" key={section.category}>
                <div className="menu-card-head">
                  <h3>{section.category}</h3>
                  <span>{section.items.length} items</span>
                </div>
                {section.note && <p className="menu-note">{section.note}</p>}
                <ul>
                  {section.items.map(([name, price]) => (
                    <li key={name as string}>
                      <span className="menu-item-name">{name}</span>
                      <b>₱{Number(price)}</b>
                      <button
                        className="add-item-btn"
                        aria-label={`Add ${name} to cart`}
                        onClick={() => addToCart(String(name), Number(price))}
                      >
                        <Plus size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="order-callout">
            <div>
              <span className="eyebrow">CRAVING SOMETHING?</span>
              <h3>Order straight from our menu.</h3>
              <p>Choose your favorites, then select pickup or nearby delivery. Delivery has a flat ₱75 fee.</p>
            </div>
            <div className="order-callout-actions">
              <button className="primary-btn" onClick={() => { setOrderOpen(true); setOrderSubmitted(false); }}>
                <ShoppingCart size={18} /> Start your order
              </button>
              <a className="facebook-order-link" href={FACEBOOK} target="_blank" rel="noreferrer">
                <MessageCircle size={17} /> Bulk orders or questions? Chat with us
              </a>
            </div>
          </div>
        </section>

        <section className="space-section">
          <div className="space-copy">
            <span className="eyebrow dark">YOUR NEXT HAPPY PLACE</span>
            <h2>
              Settle in.
              <br />
              <em>Stay a while.</em>
            </h2>
            <p>
              Come for the coffee, stay for the cozy resort atmosphere. Whether
              it's a catch-up with friends, a casual date, or a little treat
              with your pet, there's a seat waiting for you.
            </p>
            <button
              className="primary-btn"
              onClick={() => {
                setBookingOpen(true);
                setSubmitted(false);
              }}
            >
              Reserve your table <ArrowRight size={18} />
            </button>
          </div>
          <div className="space-photos">
            <img
              src="/resources/cafe-interior.jpg"
              alt="Paws & Brew cafe interior"
            />
            <img
              src="/resources/cafe-counter.jpg"
              alt="Paws & Brew cafe counter"
            />
            <img
              src="/resources/cafe-lounge.jpg"
              alt="Paws & Brew lounge seating"
            />
          </div>
        </section>

        <section className="visit-section">
          <div className="visit-card">
            <MapPin />
            <div>
              <b>Find us</b>
              <p>
                <a
                  className="map-link"
                  href="https://www.google.com/maps/search/?api=1&query=Glen%27s+Resort%2C+Caimito+Street%2C+Purok+6%2C+Magurang%2C+Polangui%2C+Albay+4506%2C+Philippines"
                  target="_blank"
                  rel="noreferrer"
                >
                  Glen's Resort, Caimito Street, Purok 6, Magurang, Polangui,
                  Albay 4506, Philippines
                </a>
                <a
                  className="map-directions-link"
                  href="https://www.google.com/maps/search/?api=1&query=Glen%27s+Resort%2C+Caimito+Street%2C+Purok+6%2C+Magurang%2C+Polangui%2C+Albay+4506%2C+Philippines"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get directions <ArrowRight size={14} />
                </a>
              </p>
            </div>
          </div>
          <div className="visit-card">
            <Clock3 />
            <div>
              <b>Opening hours</b>
              <p>Open daily · 4:00 PM – 12:00 midnight</p>
            </div>
          </div>
          <div className="visit-card">
            <PawPrint />
            <div>
              <b>Pets are welcome</b>
              <p>
                Bring your furry companions along. Please keep pets leashed
                while visiting.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <img src="/resources/paws-and-brew-logo.png" alt="" />
        <p>Good coffee. Good food. Happier paws.</p>
        <a href={FACEBOOK} target="_blank" rel="noreferrer">
          Visit us on Facebook
        </a>
        <small>© {new Date().getFullYear()} Paws & Brew · Glen's Resort</small>
      </footer>

      {orderOpen && (
        <div className="modal-backdrop" role="presentation" onClick={event => {
          if (event.target === event.currentTarget) setOrderOpen(false);
        }}>
          <div className="booking-modal order-modal" role="dialog" aria-modal="true" aria-labelledby="order-title">
            <button className="close-modal" onClick={() => setOrderOpen(false)} aria-label="Close"><X /></button>
            {!orderSubmitted ? (
              <>
                <span className="eyebrow dark"><ShoppingCart size={15} /> PAWS & BREW ONLINE ORDERING</span>
                <h2 id="order-title">Your order</h2>
                <p className="modal-sub">Add items from the menu, then send your order request. We'll text you to confirm availability and the final details.</p>
                {cart.length === 0 ? (
                  <div className="empty-cart">
                    <ShoppingCart size={32} />
                    <b>Your cart is empty</b>
                    <p>Close this window and tap the plus button beside any menu item.</p>
                    <button className="primary-btn" type="button" onClick={() => setOrderOpen(false)}>Back to menu</button>
                  </div>
                ) : (
                  <>
                    <div className="cart-items">
                      {cart.map(item => (
                        <div className="cart-line" key={item.name}>
                          <div><b>{item.name}</b><small>₱{item.price} each</small></div>
                          <div className="quantity-control">
                            <button type="button" onClick={() => changeCartQuantity(item.name, -1)} aria-label={`Remove one ${item.name}`}><Minus size={14} /></button>
                            <b>{item.quantity}</b>
                            <button type="button" onClick={() => changeCartQuantity(item.name, 1)} aria-label={`Add one ${item.name}`}><Plus size={14} /></button>
                          </div>
                          <strong>₱{item.price * item.quantity}</strong>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={submitOrder}>
                      <label>Full name<input required value={orderForm.name} onChange={e => setOrderForm({ ...orderForm, name: e.target.value })} placeholder="Your name" /></label>
                      <label>Mobile number for SMS confirmation<input required type="tel"  value={orderForm.phone} onChange={e => setOrderForm({ ...orderForm, phone: e.target.value })} placeholder="09XX XXX XXXX" /></label>
                      <div className="fulfillment-options">
                        <label className={orderForm.method === 'Pickup' ? 'fulfillment-option selected' : 'fulfillment-option'}>
                          <input type="radio" name="fulfillment" value="Pickup" checked={orderForm.method === 'Pickup'} onChange={() => setOrderForm({ ...orderForm, method: 'Pickup', address: '' })} />
                          <Store size={19} /><span><b>Pickup</b><small>Collect at Paws & Brew</small></span>
                        </label>
                        <label className={orderForm.method === 'Delivery' ? 'fulfillment-option selected' : 'fulfillment-option'}>
                          <input type="radio" name="fulfillment" value="Delivery" checked={orderForm.method === 'Delivery'} onChange={() => setOrderForm({ ...orderForm, method: 'Delivery' })} />
                          <Truck size={19} /><span><b>Nearby delivery</b><small>Flat ₱75 delivery fee</small></span>
                        </label>
                      </div>
                      {orderForm.method === 'Delivery' && (
                        <label>Complete delivery address<input required value={orderForm.address} onChange={e => setOrderForm({ ...orderForm, address: e.target.value })} placeholder="House number, street, barangay, landmark" /></label>
                      )}
                      <label>Order notes (optional)<textarea rows={2} value={orderForm.notes} onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })} placeholder="Special instructions or preferences" /></label>
                      <div className="order-totals">
                        <div><span>Subtotal</span><b>₱{subtotal}</b></div>
                        <div><span>Delivery fee</span><b>{deliveryFee ? `₱${deliveryFee}` : '₱0'}</b></div>
                        <div className="grand-total"><span>Estimated total</span><b>₱{orderTotal}</b></div>
                      </div>
                      <p className="confirmation-note">Your order is a request only. Please wait for our SMS confirmation before considering it accepted. We will confirm item availability and the final amount.</p>
                      {orderError && <p className="form-error">{orderError} <a href={FACEBOOK} target="_blank" rel="noreferrer">Message us</a></p>}
                      <button className="primary-btn submit-btn" disabled={orderSending}>{orderSending ? 'Submitting order…' : 'Submit order request'} <ArrowRight size={18} /></button>
                    </form>
                  </>
                )}
              </>
            ) : (
              <div className="success-state">
                <CheckCircle2 size={48} />
                <h2>Order request received!</h2>
                <p>Thank you, {orderForm.name}. Your order reference is <b>{orderReference || 'pending'}</b>. We will text {orderForm.phone} to confirm availability and the final total. Please wait for our SMS before heading over or expecting delivery.</p>
                <a className="primary-btn" href={FACEBOOK} target="_blank" rel="noreferrer">Chat with us on Facebook</a>
                <button className="text-btn" onClick={() => setOrderOpen(false)}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {bookingOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={event => {
            if (event.target === event.currentTarget) setBookingOpen(false);
          }}
        >
          <div
            className="booking-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-title"
          >
            <button
              className="close-modal"
              onClick={() => setBookingOpen(false)}
              aria-label="Close"
            >
              <X />
            </button>
            {!submitted ? (
              <>
                <span className="eyebrow dark">
                  <CalendarDays size={15} /> SAVE YOUR SEAT
                </span>
                <h2 id="booking-title">Book a table</h2>
                <p className="modal-sub">
                  Send us your preferred date and time. Your booking is a
                  request and we'll confirm with you.
                </p>
                <form onSubmit={submitBooking}>
                  <label>
                    Your name
                    <input
                      required
                      value={booking.name}
                      onChange={e =>
                        setBooking({ ...booking, name: e.target.value })
                      }
                      placeholder="Name"
                    />
                  </label>
                  <label>
                    Mobile number
                    <input
                      required
                      type="tel"
                      value={booking.phone}
                      onChange={e =>
                        setBooking({ ...booking, phone: e.target.value })
                      }
                      placeholder="09XX XXX XXXX"
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Date
                      <input
                        required
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        value={booking.date}
                        onChange={e =>
                          setBooking({ ...booking, date: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Time
                      <select
                        value={booking.time}
                        onChange={e =>
                          setBooking({ ...booking, time: e.target.value })
                        }
                      >
                        {[
                          '16:00',
                          '17:00',
                          '18:00',
                          '19:00',
                          '20:00',
                          '21:00',
                          '22:00',
                          '23:00',
                        ].map(t => (
                          <option key={t} value={t}>
                            {new Date('2000-01-01T' + t).toLocaleTimeString(
                              [],
                              { hour: 'numeric', minute: '2-digit' }
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Number of guests
                      <select
                        value={booking.guests}
                        onChange={e =>
                          setBooking({ ...booking, guests: e.target.value })
                        }
                      >
                        {[
                          '1',
                          '2',
                          '3',
                          '4',
                          '5',
                          '6',
                          '7',
                          '8',
                          '9',
                          '10',
                          '11',
                          '12',
                          '13',
                          '14',
                          '15',
                          '16',
                          '17',
                          '18',
                          '19',
                          '20',
                        ].map(n => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Bringing a pet?
                      <select
                        value={booking.pets}
                        onChange={e =>
                          setBooking({ ...booking, pets: e.target.value })
                        }
                      >
                        <option>No</option>
                        <option>Yes</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Special requests (optional)
                    <textarea
                      value={booking.notes}
                      onChange={e =>
                        setBooking({ ...booking, notes: e.target.value })
                      }
                      placeholder="Anything we should know?"
                      rows={3}
                    />
                  </label>
                  {errorMessage && (
                    <p className="form-error">
                      {errorMessage}{' '}
                      <a href={FACEBOOK} target="_blank" rel="noreferrer">
                        Message us
                      </a>
                    </p>
                  )}
                  <button className="primary-btn submit-btn" disabled={sending}>
                    {sending ? 'Sending request…' : 'Send reservation request'}{' '}
                    <ArrowRight size={18} />
                  </button>
                </form>
              </>
            ) : (
              <div className="success-state">
                <CheckCircle2 size={48} />
                <h2>Request received!</h2>
                <p>
                  Thanks, {booking.name}. Your table request has been sent.
                  Please wait for confirmation from Paws & Brew.
                </p>
                <a
                  className="primary-btn"
                  href={FACEBOOK}
                  target="_blank"
                  rel="noreferrer"
                >
                  Message us on Facebook
                </a>
                <button
                  className="text-btn"
                  onClick={() => setBookingOpen(false)}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
