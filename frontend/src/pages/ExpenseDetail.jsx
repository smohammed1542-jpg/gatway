import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Printer,
  Edit2,
  Trash2,
  Briefcase,
  User,
  FileText,
} from 'lucide-react';
import { getExpense } from '../api/finance';
import client from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../context/PageTitleContext';
import AppLogo from '../components/AppLogo';
import { BRAND_FULL_NAME } from '../constants/brand';
import {
  getAccountTitleLabel,
  getAccountTitleMeta,
  getPayeeName,
  getNotesOnly,
  getCategoryLabel,
} from '../utils/expenseHelpers';
import AppLoader from '../components/AppLoader';
import AuditMeta from '../components/ui/AuditMeta';
import { isLockedExpense } from '../utils/erp';

const ExpenseDetail = () => {
  const { expenseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [expense, setExpense] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  usePageTitle(expense?.title || null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await getExpense(expenseId);
        setExpense(data);
      } catch {
        toast.error('Voucher not found');
        navigate('/expenses');
      } finally {
        setIsLoading(false);
      }
    };
    if (expenseId) load();
  }, [expenseId, navigate]);

  const handleDelete = async () => {
    if (!window.confirm('Cancel this posted expense? The journal will be reversed; the voucher is kept for audit.')) return;
    try {
      await client.delete(`/finance/expenses/${expenseId}/`);
      toast.success('Expense cancelled');
      navigate('/expenses');
    } catch {
      toast.error('Failed to cancel voucher');
    }
  };

  const handlePrint = () => window.print();

  if (isLoading) {
    return <AppLoader message="Loading voucher…" />;
  }

  if (!expense) return null;

  const accountMeta = getAccountTitleMeta(expense);
  const accountLabel = getAccountTitleLabel(expense);
  const payee = getPayeeName(expense);
  const notes = getNotesOnly(expense);

  return (
    <>
      <div className="animate-fade-in print-hide">
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontWeight: '600',
          }}
        >
          <ArrowLeft size={18} /> Back
        </button>

        <div className="page-header" style={{ marginBottom: '24px' }}>
          <div>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'monospace', marginBottom: '6px' }}>
              PV-{expense.id}
            </p>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
              Payment voucher - yeh expense / receipt ki detail hai
            </p>
            <span
              style={{
                display: 'inline-block',
                marginTop: '12px',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
                backgroundColor: 'var(--surface-elevated)',
                color: 'var(--text-muted)',
              }}
            >
              {getCategoryLabel(expense.category)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Printer size={18} /> Print voucher
            </button>
            {canEdit && !isLockedExpense(expense.status) && (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate('/expenses', { state: { editExpenseId: expense.id } })}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Edit2 size={18} /> Edit voucher
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    background: 'transparent',
                    color: '#b91c1c',
                    fontWeight: '600',
                  }}
                >
                  <Trash2 size={18} /> Cancel voucher
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          <div className="premium-card" style={{ padding: '24px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Amount paid</p>
            <p style={{ fontSize: '28px', fontWeight: '900', color: '#ef4444' }}>
              <span style={{ fontSize: '50%', opacity: 0.7 }}>Rs</span>{' '}
              {parseFloat(expense.amount).toLocaleString()}
            </p>
          </div>
          <div className="premium-card" style={{ padding: '24px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} /> Voucher date
            </p>
            <p style={{ fontSize: '18px', fontWeight: '700' }}>{new Date(expense.expense_date).toLocaleDateString()}</p>
          </div>
          <div className="premium-card" style={{ padding: '24px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Briefcase size={14} /> Account title
            </p>
            <p style={{ fontSize: '16px', fontWeight: '700' }}>{accountLabel}</p>
            {accountMeta?.desc && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{accountMeta.desc}</p>
            )}
          </div>
          <div className="premium-card" style={{ padding: '24px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} /> Payee / vendor
            </p>
            <p style={{ fontSize: '18px', fontWeight: '700' }}>{payee}</p>
          </div>
        </div>

        {notes && (
          <div className="premium-card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} /> Remarks / notes
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{notes}</p>
          </div>
        )}

        <div className="premium-card" style={{ padding: '16px 24px', marginBottom: '24px' }}>
          <AuditMeta
            status={expense.status}
            createdBy={expense.created_by_name}
            createdAt={expense.created_at}
            updatedAt={expense.updated_at}
          />
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Official printable voucher preview below
        </p>
      </div>

      <div
        id="printable-expense-voucher"
        className="card print-page-a5"
        style={{
          margin: '0 auto 40px',
          padding: '16px',
          backgroundColor: 'var(--surface)',
        }}
      >
        <div style={{ border: '2px solid #000', padding: '16px', fontFamily: '"Courier New", Courier, monospace', color: '#000' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px double #000', paddingBottom: '10px' }}>
            <div>
              <AppLogo size="sm" tone="dark" showName name={BRAND_FULL_NAME} className="app-logo--print" />
              <p style={{ fontSize: '9px', margin: '6px 0 0', fontWeight: '600' }}>GT Road, Lahore | Official Accounts Ledger</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h3 style={{ border: '1.5px solid #000', padding: '4px 8px', margin: 0, fontSize: '11px', fontWeight: '800', backgroundColor: 'var(--surface-elevated)' }}>
                PAYMENT VOUCHER
              </h3>
              <p style={{ fontSize: '10px', margin: '4px 0 0', fontWeight: '700' }}>
                No: <span style={{ textDecoration: 'underline' }}>PV-{expense.id}</span>
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '12px 0', fontSize: '11px', fontWeight: '700' }}>
            <div>
              <p style={{ margin: '0 0 6px' }}>Debit Account: <span style={{ textDecoration: 'underline' }}>{accountLabel}</span></p>
              <p style={{ margin: 0 }}>Payment Date: <span style={{ textDecoration: 'underline' }}>{new Date(expense.expense_date).toLocaleDateString()}</span></p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: '0 0 6px' }}>Payee Vendor: <span style={{ textDecoration: 'underline' }}>{payee}</span></p>
              <p style={{ margin: 0 }}>Status: <span style={{ textDecoration: 'underline', color: 'green' }}>PAID (Cash)</span></p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0', border: '1px solid #000' }}>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2' }}>
                <th style={{ border: '1px solid #000', padding: '6px', fontSize: '10px', textAlign: 'left' }}>ACCOUNT HEAD</th>
                <th style={{ border: '1px solid #000', padding: '6px', fontSize: '10px', textAlign: 'left' }}>REASON / DESCRIPTION</th>
                <th style={{ border: '1px solid #000', padding: '6px', fontSize: '10px', textAlign: 'right', width: '110px' }}>AMOUNT (PKR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize: '11px', fontWeight: '700' }}>{accountLabel}</td>
                <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize: '10px' }}>
                  <p style={{ fontWeight: '700', margin: '0 0 2px' }}>{expense.title}</p>
                  <p style={{ margin: 0, fontSize: '9px' }}>{notes || 'No supplementary notes.'}</p>
                </td>
                <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize: '11px', fontWeight: '900', textAlign: 'right' }}>
                  Rs {parseFloat(expense.amount).toLocaleString()}
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ border: '1px solid #000', padding: '8px 6px', fontSize: '11px', textAlign: 'right', fontWeight: '900' }}>GRAND TOTAL</td>
                <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize: '11px', textAlign: 'right', fontWeight: '900', backgroundColor: '#f9f9f9' }}>
                  Rs {parseFloat(expense.amount).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ border: '1px dashed #000', padding: '8px 10px', margin: '12px 0', fontSize: '10px', fontWeight: '700' }}>
            Amount in words: PKR {parseFloat(expense.amount).toLocaleString()} Rupees Only.
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
      @media print {
        @page { size: A5 portrait; margin: 10mm; }
        body * { visibility: hidden; }
        #printable-expense-voucher, #printable-expense-voucher * { visibility: visible; }
        #printable-expense-voucher {
          position: absolute; left: 0; top: 0; width: 100% !important; max-width: 100% !important;
        }
        .print-hide { display: none !important; }
      }
    `,
        }}
      />
    </>
  );
};

export default ExpenseDetail;
