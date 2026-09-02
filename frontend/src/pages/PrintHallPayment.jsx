import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import AppLogo from '../components/AppLogo';
import { BRAND_FULL_NAME } from '../constants/brand';
import { formatRs, formatCollectDuePKR } from '../utils/currency';
import AppLoader from '../components/AppLoader';
import '../print.css';

const METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
};

export default function PrintHallPayment() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState(null);

  useEffect(() => {
    client.get(`/finance/payments/${paymentId}/`)
      .then((res) => setPayment(res.data))
      .catch(() => navigate('/payments'));
  }, [paymentId, navigate]);

  if (!payment) {
    return <AppLoader fullScreen message="Loading receipt…" />;
  }

  const booking = payment.booking_detail || payment.booking || {};
  const receiptId = `MH-PAY-${String(payment.id).padStart(5, '0')}`;
  const isAdvance = (payment.notes || '').toLowerCase().includes('advance');

  return (
    <div className="print-page-a5" style={{ padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <AppLogo variant="compact" />
        <h1 style={{ margin: '12px 0 4px', fontSize: '18px', fontWeight: 800 }}>{BRAND_FULL_NAME}</h1>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
          {isAdvance ? 'Advance receipt' : 'Payment receipt'}
        </p>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '20px', padding: '16px', background: '#f0fdf4', borderRadius: '12px', border: '1px dashed #5BD51E' }}>
        <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
          Amount received
        </p>
        <p style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: '#166534' }}>{formatRs(payment.amount)}</p>
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
          {METHOD_LABELS[payment.payment_method] || payment.payment_method} · {payment.status}
        </p>
      </div>

      <table style={{ width: '100%', marginBottom: '20px', borderCollapse: 'collapse', fontSize: '13px' }}>
        <tbody>
          {[
            ['Receipt ID', receiptId],
            ['Date', payment.payment_date ? new Date(payment.payment_date).toLocaleString() : '-'],
            ['Booking', booking.event_name || booking.booking_id || `#${payment.booking}`],
            ['Customer', payment.customer_name || booking.customer_name],
            ['Hall', payment.venue_name || booking.venue_name],
            ['Recorded by', payment.recorded_by_name || '-'],
          ].map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: '6px 0', color: '#64748b', width: '38%' }}>{label}</td>
              <td style={{ padding: '6px 0', fontWeight: 600 }}>{value ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {booking.total_price != null && (
        <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
          Booking total {formatRs(booking.total_price)} · Balance due {formatCollectDuePKR(booking.remaining_balance)}
        </p>
      )}

      <div style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'center' }} className="no-print">
        <button type="button" className="btn-primary" onClick={() => window.print()}>Print</button>
        <button type="button" className="btn-secondary" onClick={() => navigate('/payments')}>Back</button>
      </div>
    </div>
  );
}
