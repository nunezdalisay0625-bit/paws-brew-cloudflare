import { useState, type FormEvent } from 'react';
import { api } from './lib/api';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import GcashQr from './GcashQr';

type PaymentOrder = {
  orderId: string;
  orderReference: string;
  total: number;
  name: string;
  phone: string;
  method: string;
};

type Props = {
  order: PaymentOrder;
  onBack: () => void;
};

const peso = (amount: number) => '₱' + Number(amount || 0).toLocaleString('en-PH');

export default function PaymentInstructions({ order, onBack }: Props) {
  const [referenceNumber, setReferenceNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [referenceSubmitted, setReferenceSubmitted] = useState(false);
  const [message, setMessage] = useState('');

  async function submitReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await api.post(
        '/api/orders/' + encodeURIComponent(order.orderId) + '/payment-reference',
        {
          phone: order.phone,
          referenceNumber: referenceNumber.trim(),
        }
      );
      setReferenceSubmitted(true);
    } catch {
      setMessage('We could not save that reference number. Check it and try again, or contact Paws & Brew.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="payment-page">
      <div className="payment-shell">
        <header className="payment-brand">
          <img src="/resources/paws-and-brew-logo.png" alt="Paws & Brew logo" />
          <div>
            <strong>Paws & Brew</strong>
            <small>GCASH PAYMENT</small>
          </div>
        </header>

        {referenceSubmitted ? (
          <section className="payment-card payment-success">
            <CheckCircle2 size={48} />
            <p className="payment-eyebrow">ORDER RECEIVED</p>
            <h1>Thank you, {order.name}!</h1>
            <p>
              Your GCash payment reference has been submitted. Your payment is still
              <strong> pending manual verification</strong> by our staff. We will
              confirm your order by SMS after checking the transaction.
            </p>
            <div className="payment-summary">
              <div><span>Order reference</span><strong>{order.orderReference}</strong></div>
              <div><span>Amount due</span><strong>{peso(order.total)}</strong></div>
              <div><span>Payment status</span><strong>Pending verification</strong></div>
            </div>
            <p className="payment-reminder">
              Please do not send another payment. Our team will verify the reference you submitted.
            </p>
            <button className="payment-back-button" type="button" onClick={onBack}>
              <ArrowLeft size={17} /> Back to Paws & Brew
            </button>
          </section>
        ) : (
          <section className="payment-card">
            <p className="payment-eyebrow">ORDER SAVED · NEXT STEP</p>
            <h1>Complete your GCash payment</h1>
            <p className="payment-intro">
              Your order has been saved. Scan the Paws & Brew QR code and pay the exact amount shown below.
            </p>

            <div className="payment-total">
              <small>Exact amount due</small>
              <strong>{peso(order.total)}</strong>
              <span>Order {order.orderReference} · {order.method}</span>
            </div>

            <div className="payment-account">
              <div>
                <small>GCash account name</small>
                <strong>Paws &amp; Brew</strong>
              </div>
              <div>
                <small>Payment channel</small>
                <strong>GCash · InstaPay QR</strong>
              </div>
            </div>

            <div className="payment-qr-wrap">
              <GcashQr />
              <strong>Scan to pay Paws &amp; Brew</strong>
              <small>Enter the exact amount due above before confirming your transfer.</small>
            </div>

            <div className="payment-instructions">
              <b>How to pay</b>
              <ol>
                <li>Open GCash and choose Scan QR.</li>
                <li>Scan the Paws &amp; Brew QR code above.</li>
                <li>Enter the exact amount due and complete the transfer.</li>
                <li>Return here and enter the GCash payment reference number.</li>
              </ol>
            </div>

            <form className="payment-form" onSubmit={submitReference}>
              <label htmlFor="gcash-reference">GCash payment reference number</label>
              <input
                id="gcash-reference"
                name="gcash-reference"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                minLength={6}
                maxLength={30}
                pattern="[A-Za-z0-9-]{6,30}"
                required
                value={referenceNumber}
                onChange={event => setReferenceNumber(event.target.value)}
                placeholder="Enter your GCash reference number"
              />
              {message && <p className="payment-error">{message}</p>}
              <button type="submit" disabled={submitting}>
                {submitting ? 'Submitting reference…' : 'Submit payment reference'}
              </button>
            </form>

            <p className="payment-privacy">
              No receipt upload is needed. Your payment will remain pending until Paws &amp; Brew staff
              manually verify the GCash transaction.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
