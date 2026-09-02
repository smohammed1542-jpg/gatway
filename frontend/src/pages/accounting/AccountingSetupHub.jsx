import { Link } from 'react-router-dom';
import ErpPageShell from '../../components/ui/ErpPageShell';
import { usePageTitle } from '../../context/PageTitleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useAppType } from '../../hooks/useAppType';

const SETUP_LINKS = [
  { key: 'vendors', label: 'Vendors & Bills', desc: 'Supplier master and AP documents' },
  { key: 'invoices', label: 'Sales Invoices', desc: 'Customer invoice register' },
  { key: 'receivables', label: 'Receivables', desc: 'AR aging detail' },
  { key: 'payables', label: 'Payables', desc: 'AP aging detail' },
  { key: 'customer-ledger', label: 'Customer Ledger', desc: 'Per-customer GL activity' },
  { key: 'banks', label: 'Bank Accounts', desc: 'Bank master and transfers' },
  { key: 'reconciliation', label: 'Bank Reconciliation', desc: 'Match bank statements' },
  { key: 'cash-book', label: 'Cash Book', desc: 'Cash account movements' },
  { key: 'bank-book', label: 'Bank Book', desc: 'Bank account movements' },
  { key: 'opening-balances', label: 'Opening Balances', desc: 'Period-start balances' },
  { key: 'periods', label: 'Fiscal Periods', desc: 'Close and reopen periods' },
  { key: 'cost-centers', label: 'Cost Centers', desc: 'Dimension tags for reporting' },
  { key: 'health', label: 'Health Check', desc: 'Ledger integrity diagnostics' },
];

const AccountingSetupHub = () => {
  usePageTitle('Accounting Setup');
  const { isAdmin } = usePermissions();
  const { isGuestHouse } = useAppType();
  const base = isGuestHouse ? '/gh/accounting' : '/accounting';

  if (!isAdmin) {
    return (
      <ErpPageShell description="Administrator access required.">
        <div className="card" style={{ padding: 24 }}>You do not have permission to view accounting setup.</div>
      </ErpPageShell>
    );
  }

  return (
    <ErpPageShell description="Advanced accounting tools. Day-to-day bookings, payments, and expenses post to the GL automatically — use these screens only when needed.">
      <div className="erp-card" style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
          {SETUP_LINKS.map((item) => (
            <Link
              key={item.key}
              to={`${base}/${item.key}`}
              className="erp-setup-link"
              style={{
                display: 'block',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <strong style={{ display: 'block', fontSize: 13 }}>{item.label}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </ErpPageShell>
  );
};

export default AccountingSetupHub;
