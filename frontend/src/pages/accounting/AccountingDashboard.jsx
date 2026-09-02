import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Wallet } from 'lucide-react';
import { getAccountingDashboard } from '../../api/accounting';
import AppLoader from '../../components/AppLoader';
import StatCard from '../../components/ui/StatCard';
import ChartCard from '../../components/ui/ChartCard';
import { usePageTitle } from '../../context/PageTitleContext';
import { formatRs } from '../../utils/currency';
import { useAppType } from '../../hooks/useAppType';

const AccountingDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  usePageTitle('Accounting Dashboard');
  const { isGuestHouse } = useAppType();
  const base = isGuestHouse ? '/gh/accounting' : '/accounting';

  useEffect(() => {
    let cancelled = false;
    getAccountingDashboard()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || 'Failed to load dashboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <AppLoader inline message="Loading accounting dashboard…" />;
  if (error) return <div className="card" style={{ padding: 24, color: 'crimson' }}>{error}</div>;
  if (!data) return <div className="card" style={{ padding: 24 }}>No data.</div>;

  const cards = [
    { label: "Today's Revenue", value: data.today_revenue },
    { label: "Today's Payments", value: data.today_payments },
    { label: "Today's Expenses", value: data.today_expenses },
    { label: 'Receivables', value: data.total_receivables },
    { label: 'Payables', value: data.total_payables },
    { label: 'Cash Balance', value: data.cash_balance },
    { label: 'Bank Balance', value: data.bank_balance },
    { label: 'Monthly Revenue', value: data.monthly_revenue },
    { label: 'Monthly Expenses', value: data.monthly_expenses },
    { label: 'Net Profit', value: data.net_profit },
  ];

  const revChart = data.charts?.revenue_by_month || [];
  const expChart = data.charts?.expense_by_month || [];
  const chartData = revChart.map((r, i) => ({
    month: r.month,
    revenue: Number(r.amount),
    expense: Number(expChart[i]?.amount || 0),
  }));
  const aging = data.receivables_aging || {};
  const agingData = [
    { name: 'Current', amount: Number(aging.current || 0) },
    { name: '1–30', amount: Number(aging['1_30'] || 0) },
    { name: '31–60', amount: Number(aging['31_60'] || 0) },
    { name: '61–90', amount: Number(aging['61_90'] || 0) },
    { name: '90+', amount: Number(aging['90_plus'] || 0) },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Ledger-based balances. Source of truth is posted journal entries.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn-secondary" to={`${base}/reports?tab=trial-balance`}>Reports</Link>
          <Link className="btn-secondary" to={isGuestHouse ? '/gh/journal-entries' : '/journal-entries'}>Journal Entries</Link>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Bookings, payments, and expenses post to the general ledger automatically on the backend.
        Use Journal Entries only for manual adjustments.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={formatRs(c.value)} icon={Wallet} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartCard title="Revenue vs Expense (6 months)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" fill="#0ea5e9" name="Revenue" />
              <Bar dataKey="expense" fill="#f97316" name="Expense" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Receivables Aging">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={agingData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="amount" fill="#8b5cf6" name="Amount" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default AccountingDashboard;
