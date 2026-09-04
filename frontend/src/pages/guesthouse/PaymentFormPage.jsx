import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, CreditCard, CheckCircle, X, FileText, HelpCircle,
} from 'lucide-react';
import {
  listStays, createGhPayment, updateGhPayment, getGhPayment,
} from '../../api/guesthouse';
import toast from 'react-hot-toast';
import AppLoader from '../../components/AppLoader';
import { usePermissions } from '../../hooks/usePermissions';
import { formatRs, formatCollectDuePKR, hasCollectDue } from '../../utils/currency';

const emptyForm = {
  stay: '',
  amount: '',
  payment_method: 'CASH',
  status: 'COMPLETED',
  notes: '',
  transaction_id: '',
};

const METHOD_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'ONLINE', label: 'Online' },
];

const sectionTitle = (label) => (
  <h3
    style={{
      fontSize: '13px',
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: 'var(--primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      margin: 0,
    }}
  >
    <span style={{ width: '4px', height: '16px', backgroundColor: 'var(--primary)', borderRadius: '2px' }} />
    {label}
  </h3>
);

export default function PaymentFormPage() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { canOperate } = usePermissions();
  const isEdit = Boolean(paymentId);

  const preselectedStay =
    location.state?.preselectedStayId || searchParams.get('stay') || '';

  const [form, setForm] = useState({ ...emptyForm, stay: preselectedStay ? String(preselectedStay) : '' });
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!canOperate) {
      toast.error('You do not have permission to record payments.');
      navigate('/gh/payments');
    }
  }, [canOperate, navigate]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const stayList = await listStays();
        setStays(stayList.filter((s) => s.status !== 'CANCELLED'));

        if (isEdit && paymentId) {
          const p = await getGhPayment(paymentId);
          setForm({
            stay: String(p.stay),
            amount: String(p.amount),
            payment_method: p.payment_method || 'CASH',
            status: p.status || 'COMPLETED',
            notes: p.notes || '',
            transaction_id: p.transaction_id || '',
          });
        }
      } catch {
        toast.error('Failed to load payment form');
        navigate('/gh/payments');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isEdit, paymentId, navigate]);

  const selectedStay = useMemo(
    () => stays.find((s) => String(s.id) === String(form.stay)),
    [stays, form.stay],
  );

  const staySpecs = useMemo(() => {
    if (!selectedStay) return null;
    const total = Number(selectedStay.total_amount) || 0;
    const paid = Number(selectedStay.advance_paid) || 0;
    const remaining = Math.max(0, total - paid);
    return { total, paid, remaining };
  }, [selectedStay]);

  const amountValue = Number(form.amount);
  const hasValidAmount = Number.isFinite(amountValue) && amountValue > 0;
  const stayFullyPaid = Boolean(staySpecs && staySpecs.remaining <= 0 && !isEdit);

  const sortedStays = useMemo(() => {
    return [...stays].sort((a, b) => {
      const dueA = Math.max(0, Number(a.total_amount) - Number(a.advance_paid));
      const dueB = Math.max(0, Number(b.total_amount) - Number(b.advance_paid));
      return dueB - dueA; // unpaid first
    });
  }, [stays]);

  // Prefill due balance only when something is still collectable (never force "0"/"00")
  useEffect(() => {
    if (isEdit || !staySpecs || !form.stay) return;
    setForm((f) => {
      if (f.amount !== '' && f.amount != null) return f;
      if (staySpecs.remaining <= 0) return f;
      return { ...f, amount: String(Math.round(staySpecs.remaining)) };
    });
  }, [staySpecs, isEdit, form.stay]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.stay) {
      setFormError('Please select a stay booking.');
      return;
    }
    if (!hasValidAmount) {
      if (stayFullyPaid) {
        setFormError(
          'This stay is already fully paid (Due: 00). No further payment is needed. Go to Payments to print the receipt, or enter an amount only for an extra / overpayment.'
        );
      } else {
        setFormError('Enter an amount greater than zero.');
      }
      return;
    }
    setSubmitting(true);
    const payload = {
      stay: Number(form.stay),
      amount: amountValue,
      payment_method: form.payment_method,
      status: form.status,
      notes: form.notes,
      transaction_id: form.transaction_id,
    };
    try {
      if (isEdit) {
        await updateGhPayment(paymentId, payload);
        toast.success('Payment updated');
        navigate('/gh/payments');
      } else {
        const created = await createGhPayment(payload);
        toast.success('Payment recorded - opening print preview');
        navigate(`/gh/print/payment/${created.id}`);
      }
    } catch (err) {
      const msg = err.response?.data?.detail
        || (err.response?.data ? Object.values(err.response.data).flat().join(' ') : null)
        || 'Failed to save payment';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <AppLoader message="Loading…" />;
  }

  return (
    <div className="animate-fade-in">
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '24px',
            marginBottom: '40px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={() => navigate('/gh/payments')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
              }}
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                {isEdit ? 'Update deposit details for a stay' : 'Capture guest payment against a stay booking.'}
              </p>
            </div>
          </div>
        </div>

        {formError && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '16px 20px',
              color: '#b91c1c',
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '32px',
            }}
          >
            {formError}
          </div>
        )}

        {stayFullyPaid && !formError && (
          <div
            style={{
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '12px',
              padding: '16px 20px',
              color: '#166534',
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '32px',
            }}
          >
            This stay is already fully paid. Nothing is due — use Payments list to print the receipt.
            Enter an amount only if you need to record an extra / overpayment.
          </div>
        )}

        <div className="booking-layout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {sectionTitle('Stay & amount')}
              <div className="premium-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="input-group">
                  <label>Stay booking</label>
                  <select
                    required
                    disabled={isEdit}
                    value={form.stay}
                    onChange={(e) => setForm({ ...form, stay: e.target.value, amount: '' })}
                    style={{ width: '100%', opacity: isEdit ? 0.7 : 1 }}
                  >
                    <option value="">Select stay</option>
                    {sortedStays.map((s) => {
                      const due = Math.max(0, Number(s.total_amount) - Number(s.advance_paid));
                      return (
                        <option key={s.id} value={s.id}>
                          {s.booking_ref} - {s.customer_name} - Room {s.room_number}
                          {due > 0 ? ` - Due ${formatRs(due)}` : ' - Paid'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="input-group">
                    <label>Amount (Rs)</label>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      required={!stayFullyPaid}
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder={stayFullyPaid ? 'Already paid — enter only for overpayment' : '0'}
                    />
                  </div>
                  <div className="input-group">
                    <label>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="COMPLETED">Completed</option>
                      <option value="PENDING">Pending</option>
                    </select>
                  </div>
                </div>

                <div className="input-group">
                  <label>Payment method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    {METHOD_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label>Transaction / receipt ref <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                  <input
                    type="text"
                    value={form.transaction_id}
                    onChange={(e) => setForm({ ...form, transaction_id: e.target.value })}
                    placeholder="Cheque no., UPI ref, bank slip…"
                  />
                </div>

                <div className="input-group">
                  <label>Notes <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Cheque no., bank slip, receipt reference…"
                    style={{ width: '100%', resize: 'vertical', minHeight: '72px' }}
                  />
                </div>
              </div>
            </section>
          </div>

          <div style={{ position: 'sticky', top: '100px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="premium-card" style={{ padding: 0, overflow: 'hidden', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <div
                style={{
                  backgroundColor: 'var(--primary-light)',
                  padding: '20px 24px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <FileText size={18} color="var(--primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', margin: 0 }}>
                  Stay ledger
                </h3>
              </div>

              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {staySpecs ? (
                  <>
                    {selectedStay && (
                      <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>Booking</p>
                        <p style={{ fontWeight: '800', margin: 0 }}>{selectedStay.booking_ref}</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                          {selectedStay.customer_name} · Room {selectedStay.room_number}
                        </p>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px 0' }}>Total</p>
                        <p style={{ fontSize: '14px', fontWeight: '800', margin: 0 }}>{formatRs(staySpecs.total)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px 0' }}>Paid</p>
                        <p style={{ fontSize: '14px', fontWeight: '800', color: '#166534', margin: 0 }}>{formatRs(staySpecs.paid)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px 0' }}>Due</p>
                        <p style={{ fontSize: '14px', fontWeight: '800', color: hasCollectDue(staySpecs.remaining) ? 'var(--error)' : 'var(--text-muted)', margin: 0 }}>
                          {formatCollectDuePKR(staySpecs.remaining)}
                        </p>
                      </div>
                    </div>
                    {Number(form.amount) > 0 && (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                        After this payment:{' '}
                        <strong style={{ color: hasCollectDue(Math.max(0, staySpecs.remaining - Number(form.amount))) ? 'var(--error)' : 'var(--primary)' }}>
                          {formatCollectDuePKR(Math.max(0, staySpecs.remaining - Number(form.amount)))}
                        </strong>
                        {' '}remaining
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Select a stay to see balance.</p>
                )}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !form.stay || !hasValidAmount}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '14px',
                    borderRadius: '10px',
                    fontWeight: '700',
                    marginTop: '8px',
                    opacity: submitting || !form.stay || !hasValidAmount ? 0.55 : 1,
                    cursor: submitting || !form.stay || !hasValidAmount ? 'not-allowed' : 'pointer',
                  }}
                >
                  <CheckCircle size={18} />
                  {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Confirm Payment'}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigate('/gh/payments')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '12px',
                    fontWeight: '700',
                  }}
                >
                  <X size={16} /> Cancel
                </button>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--primary-light)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '20px',
              }}
            >
              <h4 style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 10px 0' }}>
                <HelpCircle size={14} /> Note
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                Completed payments update the stay balance automatically. If Due is already 00, the stay is paid — print the receipt from the payments list instead of recording another Rs 0 payment.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
