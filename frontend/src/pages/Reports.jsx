import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Calendar as CalendarIcon, 
  Download, 
  Wallet, 
  Activity, 
  Printer, 
  FileText, 
  Briefcase, 
  Percent, 
  ChevronRight, 
  Grid,
  Filter,
  RefreshCw,
  Building
} from 'lucide-react';
import AppLogo from '../components/AppLogo';
import usePersistentState from '../hooks/usePersistentState';
import { BRAND_FULL_NAME } from '../constants/brand';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import client from '../api/client';
import toast from 'react-hot-toast';
import AppLoader from '../components/AppLoader';

// 12 Marriage Hall Standard Account Titles for categorization
const ACCOUNT_TITLES = [
  { id: 'CAPITAL_AC', label: 'Capital A/C' },
  { id: 'CASH_AC', label: 'Cash A/C' },
  { id: 'ABC_VENDOR', label: 'ABC Vendor' },
  { id: 'CLOTH_TABLE_CHAIRS', label: 'Cloth, Table & Chairs' },
  { id: 'DECORATION_EXP', label: 'Decoration Exp' },
  { id: 'DISCOUNT_RECEIVED', label: 'Discount Received' },
  { id: 'ELECTRIC_BILL_HALL', label: 'Electric Bill Hall' },
  { id: 'FBR_TAX', label: 'FBR Tax Marriage Hall' },
  { id: 'MAINTENANCE', label: 'Marriage Hall Maintenance' },
  { id: 'GENERATOR_FUEL', label: 'Generator Fuel & Diesel' },
  { id: 'STAFF_SALARY', label: 'Staff Salary' },
  { id: 'CATERING_KITCHEN', label: 'Catering & Kitchen Exp' }
];

const Reports = () => {
  const [activeTab, setActiveTab] = usePersistentState('hall-reports-tab', 'financial');
  const [isLoading, setIsLoading] = useState(true);
  
  // RAW Data states from DB
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [halls, setHalls] = useState([]);

  // Date Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); // default last 6 months
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Load everything
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [bookingsRes, paymentsRes, expensesRes, hallsRes] = await Promise.all([
        client.get('/bookings/'),
        client.get('/finance/payments/'),
        client.get('/finance/expenses/'),
        client.get('/venues/')
      ]);

      setBookings(bookingsRes.data.results || bookingsRes.data || []);
      setPayments(paymentsRes.data.results || paymentsRes.data || []);
      setExpenses(expensesRes.data.results || expensesRes.data || []);
      setHalls(hallsRes.data.results || hallsRes.data || []);
    } catch (err) {
      console.error('Failed to load reports data:', err);
      toast.error('Failed to reload live analytics data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter Helper
  const filterByDate = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= new Date(startDate) && d <= new Date(endDate);
  };

  // Helper to extract account title label
  const getAccountTitleLabel = (expense) => {
    if (expense.description && expense.description.includes('[Account Title:')) {
      const match = expense.description.match(/\[Account Title: (.*?)\]/);
      if (match && match[1]) {
        const found = ACCOUNT_TITLES.find(at => at.id === match[1]);
        return found ? found.label : match[1];
      }
    }
    const map = {
      'SALARY': 'Staff Salary',
      'UTILITIES': 'Electric Bill Hall',
      'DECORATION': 'Decoration Exp',
      'MAINTENANCE': 'Marriage Hall Maintenance',
      'CATERING': 'Catering & Kitchen Exp',
      'OTHER': 'Other Miscellaneous Expenses'
    };
    return map[expense.category] || 'Other Miscellaneous Expenses';
  };

  // 1. FINANCIAL REPORT CALCULATIONS
  const filteredPayments = payments.filter(p => p.status === 'COMPLETED' && filterByDate(p.payment_date));
  const filteredExpenses = expenses.filter(e => filterByDate(e.expense_date));

  const totalIncome = filteredPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const totalExpense = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const netProfit = totalIncome - totalExpense;

  // Monthly breakdown for Income vs Expense graph
  const getFinancialChartData = () => {
    const monthlyMap = {};

    // Group Completed Income
    filteredPayments.forEach(p => {
      const date = new Date(p.payment_date);
      const monthStr = date.toLocaleString('default', { month: 'short', year: 'numeric' });
      if (!monthlyMap[monthStr]) monthlyMap[monthStr] = { month: monthStr, income: 0, expense: 0 };
      monthlyMap[monthStr].income += parseFloat(p.amount);
    });

    // Group Expenses
    filteredExpenses.forEach(e => {
      const date = new Date(e.expense_date);
      const monthStr = date.toLocaleString('default', { month: 'short', year: 'numeric' });
      if (!monthlyMap[monthStr]) monthlyMap[monthStr] = { month: monthStr, income: 0, expense: 0 };
      monthlyMap[monthStr].expense += parseFloat(e.amount);
    });

    return Object.values(monthlyMap).sort((a, b) => new Date(a.month) - new Date(b.month));
  };

  // 2. VENUE UTILIZATION REPORT CALCULATIONS
  const filteredBookings = bookings.filter(b => filterByDate(b.event_date));

  const getVenueUtilizationData = () => {
    return halls.map(hall => {
      const hallBookings = filteredBookings.filter(b => String(b.venue) === String(hall.id));
      const confirmedBookings = hallBookings.filter(b => b.booking_status === 'CONFIRMED' || b.booking_status === 'COMPLETED');
      const totalRevenue = confirmedBookings.reduce((sum, b) => {
        return sum + parseFloat(b.total_price || 0);
      }, 0);

      // Compute occupancy percentage (assuming 1 slot per shift, max slots in selected range = days * 2)
      const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      const totalAvailableSlots = diffDays * 2;
      const occupiedSlots = hallBookings.length;
      const occupancyRate = Math.min(100, Math.round((occupiedSlots / totalAvailableSlots) * 100));

      return {
        id: hall.id,
        name: hall.name,
        totalBookings: hallBookings.length,
        confirmed: confirmedBookings.length,
        totalRevenue,
        occupancyRate
      };
    });
  };

  // 3. EXPENSE ANALYSIS CALCULATIONS
  const getExpenseAnalysisData = () => {
    const analysisMap = {};
    filteredExpenses.forEach(exp => {
      const titleLabel = getAccountTitleLabel(exp);
      if (!analysisMap[titleLabel]) analysisMap[titleLabel] = { name: titleLabel, value: 0 };
      analysisMap[titleLabel].value += parseFloat(exp.amount);
    });
    return Object.values(analysisMap).sort((a, b) => b.value - a.value);
  };

  const expenseChartColors = ['#5BD51E', '#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#14b8a6', '#6366f1', '#ec4899', '#64748b', '#475569'];

  const handlePrintReport = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const rows = [
      ['Type', 'Description', 'Date', 'Amount (Rs)'],
      ...filteredPayments.map((p) => ['INCOME', p.booking_event_name || 'Payment', p.payment_date, p.amount]),
      ...filteredExpenses.map((e) => ['EXPENSE', e.title, e.expense_date, e.amount]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hallora-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported as CSV');
  };

  return (
    <>
    <div className="animate-fade-in print-hide">
      
      {/* Title */}
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', margin: 0 }}>
            Generate and examine financial balance sheets, hall utilization reports, and cost analysis.
          </p>
        </div>
        <div className="page-header__actions">
          <button 
            className="btn-secondary" 
            onClick={loadData}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px' }}
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCsv}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px' }}
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePrintReport}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px' }}
          >
            <Printer size={16} /> Print Report Sheet
          </button>
        </div>
      </div>

      {/* Date filtration panel */}
      <div className="card" style={{ padding: '20px 24px', display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Filter size={18} color="var(--primary)" />
          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--secondary)' }}>Date Filters:</span>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>From:</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px', fontWeight: '600' }} 
            />
          </div>
          <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>To:</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px', fontWeight: '600' }} 
            />
          </div>
        </div>
      </div>

      {/* Interactive Tabs Menu */}
      <div className="reports-tabs">
        <button
          onClick={() => setActiveTab('financial')}
          style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: '700',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'financial' ? 'var(--surface)' : 'transparent',
            color: activeTab === 'financial' ? 'var(--primary)' : 'var(--text-dim)',
            boxShadow: activeTab === 'financial' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <Wallet size={16} /> Financial Balance
        </button>
        <button
          onClick={() => setActiveTab('utilization')}
          style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: '700',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'utilization' ? 'var(--surface)' : 'transparent',
            color: activeTab === 'utilization' ? 'var(--primary)' : 'var(--text-dim)',
            boxShadow: activeTab === 'utilization' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <Building size={16} /> Venue Utilization
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: '700',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'expenses' ? 'var(--surface)' : 'transparent',
            color: activeTab === 'expenses' ? 'var(--primary)' : 'var(--text-dim)',
            boxShadow: activeTab === 'expenses' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <Briefcase size={16} /> Expense Analysis
        </button>
      </div>

      {isLoading ? (
        <AppLoader message="Loading reports and compiling charts…" />
      ) : (
        <>
          {/* TAB 1: FINANCIAL STATEMENT */}
          {activeTab === 'financial' && (
            <div className="animate-fade-in">
              <div className="grid-3 grid-3--mb">
                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
                      <Wallet size={24} />
                    </div>
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Completed Revenue</p>
                    <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px', color: '#166534' }}>
                      <span style={{ fontSize: '55%', fontWeight: '600', opacity: 0.6 }}>Rs</span> {totalIncome.toLocaleString()}
                    </h3>
                  </div>
                </div>

                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
                      <Briefcase size={24} />
                    </div>
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Outgoings & Expenses</p>
                    <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px', color: '#ef4444' }}>
                      <span style={{ fontSize: '55%', fontWeight: '600', opacity: 0.6 }}>Rs</span> {totalExpense.toLocaleString()}
                    </h3>
                  </div>
                </div>

                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
                      <TrendingUp size={24} />
                    </div>
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Net Balance Profit</p>
                    <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px', color: netProfit >= 0 ? '#166534' : '#ef4444' }}>
                      <span style={{ fontSize: '55%', fontWeight: '600', opacity: 0.6 }}>Rs</span> {netProfit.toLocaleString()}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="card" style={{ marginBottom: '32px', padding: '28px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px' }}>Revenue vs Expenses Growth</h3>
                <div style={{ height: '300px', width: '100%' }}>
                  {getFinancialChartData().length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getFinancialChartData()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                        <Legend />
                        <Bar dataKey="income" name="Revenue (Rs)" fill="#5BD51E" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="expense" name="Expenses (Rs)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      No analytical records in chosen date bracket.
                    </div>
                  )}
                </div>
              </div>

              {/* Details table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Balance Sheet Ledger Details</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>TRANSACTION SUMMARY</th>
                      <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>TYPE</th>
                      <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>DATE</th>
                      <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textAlign: 'right' }}>AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Combine payments and expenses */}
                    {[
                      ...filteredPayments.map(p => ({ id: `PAY-${p.id}`, desc: `Payment for booking: ${p.booking_event_name || 'N/A'}`, type: 'INCOME', date: p.payment_date, amount: parseFloat(p.amount) })),
                      ...filteredExpenses.map(e => ({ id: `EXP-${e.id}`, desc: `${e.title} - ${getAccountTitleLabel(e)}`, type: 'EXPENSE', date: e.expense_date, amount: parseFloat(e.amount) }))
                    ]
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .map((t, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '14px 24px' }}>
                            <p style={{ fontWeight: '700', fontSize: '14px' }}>{t.desc}</p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Reference: {t.id}</p>
                          </td>
                          <td style={{ padding: '14px 24px' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: t.type === 'INCOME' ? '#dcfce7' : '#fee2e2',
                              color: t.type === 'INCOME' ? '#15803d' : '#b91c1c'
                            }}>
                              {t.type}
                            </span>
                          </td>
                          <td style={{ padding: '14px 24px', fontSize: '13px', color: 'var(--text-muted)' }}>{new Date(t.date).toLocaleDateString()}</td>
                          <td style={{ padding: '14px 24px', fontWeight: '800', fontSize: '14px', textAlign: 'right', color: t.type === 'INCOME' ? '#166534' : '#ef4444' }}>
                            {t.type === 'INCOME' ? '+' : '-'}Rs {t.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: VENUE UTILIZATION */}
          {activeTab === 'utilization' && (
            <div className="animate-fade-in">
              <div className="grid-3 grid-3--mb">
                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
                      <Building size={24} />
                    </div>
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Active Marriage Halls</p>
                    <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px' }}>{halls.length} Halls</h3>
                  </div>
                </div>

                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
                      <CalendarIcon size={24} />
                    </div>
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Events Booked</p>
                    <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px' }}>{filteredBookings.length} Events</h3>
                  </div>
                </div>

                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
                      <Percent size={24} />
                    </div>
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Overall Hall Occupancy</p>
                    <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px', color: 'var(--primary)' }}>
                      {halls.length > 0 ? Math.round(getVenueUtilizationData().reduce((sum, h) => sum + h.occupancyRate, 0) / halls.length) : 0}%
                    </h3>
                  </div>
                </div>
              </div>

              {/* Occupancy detailed table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Hall Utilization and Revenue breakdown</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>HALL NAME</th>
                      <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>OCCUPANCY RATE</th>
                      <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textAlign: 'center' }}>TOTAL BOOKINGS</th>
                      <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textAlign: 'right' }}>REVENUE GENERATED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getVenueUtilizationData().map((h) => (
                      <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '16px 24px', fontWeight: '700', fontSize: '14px' }}>{h.name}</td>
                        <td style={{ padding: '16px 24px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '100px', backgroundColor: '#e2e8f0', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${h.occupancyRate}%`, backgroundColor: 'var(--primary)', height: '100%' }}></div>
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--secondary)' }}>{h.occupancyRate}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px 24px', textAlign: 'center', fontWeight: '600' }}>{h.totalBookings}</td>
                        <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: '800', color: 'var(--primary)' }}>
                          Rs {h.totalRevenue.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: EXPENSE ANALYSIS */}
          {activeTab === 'expenses' && (
            <div className="animate-fade-in">
              <div className="grid-charts-2">
                
                {/* Table */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Categorized Account Title Cost Breakdown</h3>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>ACCOUNT TITLE</th>
                        <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textAlign: 'right' }}>TOTAL EXPENSE</th>
                        <th style={{ padding: '14px 24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textAlign: 'right', width: '100px' }}>SHARE (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getExpenseAnalysisData().map((e, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '14px 24px', fontWeight: '700', fontSize: '13px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: expenseChartColors[idx % expenseChartColors.length] }}></span>
                              {e.name}
                            </div>
                          </td>
                          <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: '800', color: '#ef4444' }}>Rs {e.value.toLocaleString()}</td>
                          <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)' }}>
                            {totalExpense > 0 ? ((e.value / totalExpense) * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                      ))}
                      {getExpenseAnalysisData().length === 0 && (
                        <tr>
                          <td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No expense records registered yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pie Chart Card */}
                <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', width: '100%', marginBottom: '24px' }}>Cost Share Analysis</h3>
                  <div style={{ width: '100%', height: '240px' }}>
                    {getExpenseAnalysisData().length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={getExpenseAnalysisData()}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {getExpenseAnalysisData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={expenseChartColors[index % expenseChartColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        No records.
                      </div>
                    )}
                  </div>
                  <div style={{ width: '100%', marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {getExpenseAnalysisData().slice(0, 6).map((e, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: expenseChartColors[idx % expenseChartColors.length] }}></span>
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{e.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}
        </>
      )}

    </div>

    {/* PRINT ONLY — A5 sheet */}
    <div className="print-sheet-wrapper" id="printable-report-sheet">
      <div className="print-page-a5" style={{ border: '2px solid #000', padding: '16px', fontFamily: '"Courier New", Courier, monospace', color: '#000', backgroundColor: '#fff', fontSize: '10px' }}>
        
        {/* Letterhead */}
        <div style={{ borderBottom: '3px double #000', paddingBottom: '16px', marginBottom: '20px' }}>
          <AppLogo size="sm" tone="dark" showName name={BRAND_FULL_NAME} className="app-logo--print" />
          <p style={{ fontSize: '11px', margin: '4px 0 0 0', fontWeight: '700' }}>GT Road, Lahore, Pakistan | Official Business Audit & Report Statement</p>
          <p style={{ fontSize: '11px', margin: '2px 0 0 0', fontWeight: '700' }}>
            Period: <span style={{ textDecoration: 'underline' }}>{new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}</span>
          </p>
        </div>

        <h3 style={{ textAlign: 'center', border: '2px solid #000', padding: '6px 12px', fontSize: '14px', fontWeight: '900', backgroundColor: '#f2f2f2', marginBottom: '24px' }}>
          AUDITED BUSINESS PERFORMANCE STATEMENT ({activeTab.toUpperCase()})
        </h3>

        {/* Audit metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', border: '1px solid #000', padding: '15px', marginBottom: '24px', fontSize: '12px', fontWeight: '700' }}>
          <div>
            <p style={{ margin: '0 0 6px 0' }}>Audit Run Date: {new Date().toLocaleDateString()}</p>
            <p style={{ margin: '0' }}>Target: {activeTab === 'financial' ? 'Ledger Income & Expenses' : activeTab === 'utilization' ? 'Venue Capacity & Occupancy' : 'Account Category Cost Shares'}</p>
          </div>
          <div style={{ borderLeft: '1px dashed #000', paddingLeft: '15px' }}>
            <p style={{ margin: '0 0 6px 0' }}>Total Business Revenue: Rs {totalIncome.toLocaleString()}</p>
            <p style={{ margin: '0' }}>Total Cost Burden: Rs {totalExpense.toLocaleString()}</p>
          </div>
          <div style={{ borderLeft: '1px dashed #000', paddingLeft: '15px', textAlign: 'right' }}>
            <p style={{ margin: '0 0 6px 0', fontSize: '13px' }}>NET EARNINGS BAL:</p>
            <p style={{ margin: '0', fontSize: '15px', fontWeight: '900', textDecoration: 'underline' }}>Rs {netProfit.toLocaleString()}</p>
          </div>
        </div>

        {/* Dynamic Table for Printing */}
        {activeTab === 'financial' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2', borderBottom: '2px solid #000', fontSize: '11px' }}>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>REFERENCE ID</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>TRANSACTION DESCRIPTION</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>DATE</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>AMOUNT (PKR)</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '11px' }}>
              {[
                ...filteredPayments.map(p => ({ id: `PAY-${p.id}`, desc: `Revenue: ${p.booking_event_name || 'Booking Payment'}`, date: p.payment_date, amount: parseFloat(p.amount), type: 'IN' })),
                ...filteredExpenses.map(e => ({ id: `EXP-${e.id}`, desc: `Expense: ${e.title} (${getAccountTitleLabel(e)})`, date: e.expense_date, amount: parseFloat(e.amount), type: 'OUT' }))
              ]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((t, idx) => (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #000', padding: '8px' }}>{t.id}</td>
                    <td style={{ border: '1px solid #000', padding: '8px', fontWeight: '700' }}>{t.desc}</td>
                    <td style={{ border: '1px solid #000', padding: '8px' }}>{new Date(t.date).toLocaleDateString()}</td>
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: '700' }}>
                      {t.type === 'IN' ? '+' : '-'}Rs {t.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {activeTab === 'utilization' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2', borderBottom: '2px solid #000', fontSize: '11px' }}>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>HALL VENUE NAME</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>TOTAL SCHEDULING COUNT</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>OCCUPANCY RATE (%)</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>REVENUE GENERATED (PKR)</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '11px' }}>
              {getVenueUtilizationData().map((h) => (
                <tr key={h.id}>
                  <td style={{ border: '1px solid #000', padding: '10px', fontWeight: '700' }}>{h.name}</td>
                  <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>{h.totalBookings} events</td>
                  <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'center', fontWeight: '700' }}>{h.occupancyRate}% occupancy</td>
                  <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'right', fontWeight: '700' }}>Rs {h.totalRevenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'expenses' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2', borderBottom: '2px solid #000', fontSize: '11px' }}>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>ACCOUNT TITLE CLASS</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>TOTAL EXPENSES BURDEN</th>
                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>SHARE (%)</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '11px' }}>
              {getExpenseAnalysisData().map((e, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #000', padding: '10px', fontWeight: '700' }}>{e.name}</td>
                  <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'right', fontWeight: '700' }}>Rs {e.value.toLocaleString()}</td>
                  <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'right' }}>
                    {totalExpense > 0 ? ((e.value / totalExpense) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Audit closing signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '60px', textAlign: 'center', fontSize: '11px', fontWeight: '700' }}>
          <div>
            <div style={{ borderBottom: '1.5px solid #000', margin: '0 auto 8px auto', width: '70%', height: '20px' }}></div>
            <p style={{ margin: '0' }}>AUDITING ACCOUNTANT SIGNATURE</p>
          </div>
          <div>
            <div style={{ borderBottom: '1.5px solid #000', margin: '0 auto 8px auto', width: '70%', height: '20px' }}></div>
            <p style={{ margin: '0' }}>GATEWAY GENERAL MANAGER APPROVED</p>
          </div>
        </div>

      </div>
    </div>

    {/* PRINT ONLY MEDIA CSS STYLING INJECTION */}
    <style dangerouslySetInnerHTML={{__html: `
      #printable-report-sheet {
        display: none !important;
      }
      @media print {
        @page { size: A5 portrait; margin: 10mm; }
        .print-hide {
          display: none !important;
        }
        body * {
          visibility: hidden;
        }
        #printable-report-sheet, #printable-report-sheet * {
          visibility: visible;
        }
        #printable-report-sheet {
          display: block !important;
          position: absolute;
          left: 0;
          top: 0;
          width: 100% !important;
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
          background-color: white !important;
        }
      }
    `}} />

    </>
  );
};

export default Reports;
