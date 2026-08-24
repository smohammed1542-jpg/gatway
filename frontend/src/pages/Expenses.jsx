import React, { useState, useEffect } from 'react';
import SearchInput from '../components/SearchInput';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Plus, 
  TrendingUp, 
  Calendar as CalendarIcon, 
  ArrowUpRight,
  ChevronRight,
  Trash2,
  Edit2,
  X,
  Wallet,
  Briefcase,
  FileText,
  Percent,
  Activity,
  Layers
} from 'lucide-react';
import client from '../api/client';
import toast from 'react-hot-toast';
import {
  ACCOUNT_TITLES,
  getAccountTitleLabel,
  getPayeeName,
  getNotesOnly,
  parseExpenseToForm,
} from '../utils/expenseHelpers';
import DataTable from '../components/ui/DataTable';
import useEscapeClose from '../hooks/useEscapeClose';
import { isLockedExpense } from '../utils/erp';

const Expenses = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form State
  const [formData, setFormData] = useState({
    accountTitleId: 'ELECTRIC_BILL_HALL', // Selector
    title: '', // Specific reason
    payeeName: 'ABC Vendor', // Vendor Name
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const response = await client.get('/finance/expenses/');
      setExpenses(response.data.results || response.data || []);
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const openEditExpense = (expense) => {
    if (isLockedExpense(expense.status)) {
      toast.error('Cancelled vouchers are read-only.');
      return;
    }
    setEditingExpenseId(expense.id);
    setFormData(parseExpenseToForm(expense));
    setShowModal(true);
  };

  const openExpenseDetail = (expenseId) => {
    navigate(`/expenses/${expenseId}`);
  };

  useEffect(() => {
    const editId = location.state?.editExpenseId;
    if (!editId || expenses.length === 0) return;
    const expense = expenses.find((e) => String(e.id) === String(editId));
    if (expense) {
      openEditExpense(expense);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [expenses, location.state?.editExpenseId, navigate, location.pathname]);

  const closeExpenseModal = () => {
    setShowModal(false);
    setEditingExpenseId(null);
  };

  useEscapeClose(showModal, closeExpenseModal);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const selectedAccount = ACCOUNT_TITLES.find(at => at.id === formData.accountTitleId);
      
      // Inject Account Title and Payee into the description safely to bypass django schema limits
      const structuredDesc = `[Account Title: ${selectedAccount.id}] [Payee: ${formData.payeeName}] ${formData.description}`;
      
      const payload = {
        title: formData.title || selectedAccount.label.split(' (')[0],
        category: selectedAccount.category,
        amount: parseFloat(formData.amount),
        expense_date: formData.expense_date,
        description: structuredDesc
      };

      if (editingExpenseId) {
        await client.patch(`/finance/expenses/${editingExpenseId}/`, payload);
        toast.success('Voucher updated successfully');
      } else {
        await client.post('/finance/expenses/', payload);
        toast.success('Payment voucher recorded successfully!');
      }
      setShowModal(false);
      setEditingExpenseId(null);
      
      // Reset
      setFormData({
        accountTitleId: 'ELECTRIC_BILL_HALL',
        title: '',
        payeeName: 'ABC Vendor',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        description: ''
      });

      fetchExpenses();
    } catch (err) {
      toast.error('Failed to record expense. Check input values.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Cancel this posted expense? The journal will be reversed; the voucher is kept for audit.')) {
      try {
        await client.delete(`/finance/expenses/${id}/`);
        toast.success('Expense cancelled');
        fetchExpenses();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to cancel voucher');
      }
    }
  };

  // Realtime search filter
  const filteredExpenses = expenses.filter(exp => {
    const q = searchQuery.toLowerCase();
    const title = (exp.title || '').toLowerCase();
    const desc = (exp.description || '').toLowerCase();
    const category = (exp.category || '').toLowerCase();
    const accountLabel = getAccountTitleLabel(exp).toLowerCase();
    const payee = getPayeeName(exp).toLowerCase();
    return (
      title.includes(q) ||
      desc.includes(q) ||
      category.includes(q) ||
      accountLabel.includes(q) ||
      payee.includes(q)
    );
  });

  // Analytics totals
  const totalExpense = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
  const electricTotal = expenses.reduce((sum, exp) => {
    return sum + (exp.description?.includes('ELECTRIC_BILL_HALL') || exp.category === 'UTILITIES' ? parseFloat(exp.amount) : 0);
  }, 0);
  const taxTotal = expenses.reduce((sum, exp) => {
    return sum + (exp.description?.includes('FBR_TAX') ? parseFloat(exp.amount) : 0);
  }, 0);
  const maintTotal = expenses.reduce((sum, exp) => {
    return sum + (exp.category === 'MAINTENANCE' ? parseFloat(exp.amount) : 0);
  }, 0);

  return (
    <>
    <div className="animate-fade-in print-hide">
      
      {/* Title */}
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', margin: 0 }}>
            Manage official cash accounts, utility bills, capital draws, decoration, FBR tax, and vendor payments.
          </p>
        </div>
        <button 
          className="btn-primary" 
          onClick={() => setShowModal(true)} 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: '600' }}
        >
          <Plus size={18} /> Add Payment Receipt
        </button>
      </div>

      {/* Analytics widgets */}
      <div className="grid-4">
        
        <div className="premium-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
              <Wallet size={24} />
            </div>
          </div>
          <div style={{ marginTop: '20px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Total Expenses</p>
            <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px' }}>
              <span style={{ fontSize: '55%', fontWeight: '600', opacity: 0.6 }}>Rs</span> {totalExpense.toLocaleString()}
            </h3>
          </div>
        </div>

        <div className="premium-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
              <Activity size={24} />
            </div>
          </div>
          <div style={{ marginTop: '20px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Utilities & Fuel</p>
            <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px' }}>
              <span style={{ fontSize: '55%', fontWeight: '600', opacity: 0.6 }}>Rs</span> {electricTotal.toLocaleString()}
            </h3>
          </div>
        </div>

        <div className="premium-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '12px', color: 'var(--primary)' }}>
              <Percent size={24} />
            </div>
          </div>
          <div style={{ marginTop: '20px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>FBR Tax Paid</p>
            <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px' }}>
              <span style={{ fontSize: '55%', fontWeight: '600', opacity: 0.6 }}>Rs</span> {taxTotal.toLocaleString()}
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
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>Maintenance</p>
            <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '4px' }}>
              <span style={{ fontSize: '55%', fontWeight: '600', opacity: 0.6 }}>Rs</span> {maintTotal.toLocaleString()}
            </h3>
          </div>
        </div>

      </div>

      {/* Realtime Search & Filtration */}
      <div className="search-toolbar">
        <SearchInput
          variant="inset"
          placeholder="Search payment receipts by reason, vendor name (ABC Vendor), account title, category or notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Main Expenses Table */}
      <div className="card" style={{ padding: 0, borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <DataTable
          variant="erp"
          sortable
          showColumnChooser
          pageSize={25}
          emptyTitle="No payment vouchers matching your criteria"
          emptyDescription="Try another search or record a voucher."
          columns={[
            { key: 'title', label: 'Voucher / Reason' },
            { key: 'account', label: 'Account Title' },
            { key: 'payee', label: 'Payee Vendor' },
            { key: 'expense_date', label: 'Date', width: '130px' },
            { key: 'amount', label: 'Amount', width: '120px' },
            { key: 'status', label: 'Status', width: '110px' },
          ]}
          data={filteredExpenses}
          onRowClick={(expense) => openExpenseDetail(expense.id)}
          getSortValue={(row, key) => {
            if (key === 'amount') return Number(row.amount || 0);
            if (key === 'account') return getAccountTitleLabel(row);
            if (key === 'payee') return getPayeeName(row);
            return row[key];
          }}
          rowActions={(expense) => [
            { label: 'Open', icon: <ChevronRight size={14} />, onClick: () => openExpenseDetail(expense.id) },
            ...(!isLockedExpense(expense.status) ? [{ label: 'Edit', icon: <Edit2 size={14} />, onClick: () => openEditExpense(expense) }] : []),
            ...(!isLockedExpense(expense.status) ? [{ label: 'Cancel', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(expense.id) }] : []),
          ]}
          renderCell={(expense, key) => {
            if (key === 'title') {
              return (
                <div>
                  <p style={{ fontWeight: 700, margin: 0 }}>{expense.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{getNotesOnly(expense) || 'N/A'}</p>
                </div>
              );
            }
            if (key === 'account') return getAccountTitleLabel(expense);
            if (key === 'payee') return getPayeeName(expense);
            if (key === 'expense_date') return new Date(expense.expense_date).toLocaleDateString();
            if (key === 'amount') {
              return (
                <span style={{ fontWeight: 800, color: '#ef4444' }}>
                  -<span style={{ fontSize: '80%', opacity: 0.6, marginRight: 2 }}>PKR</span>
                  {parseFloat(expense.amount).toLocaleString()}
                </span>
              );
            }
            if (key === 'status') return expense.status || 'POSTED';
            return expense[key];
          }}
        />
      </div>

    </div>

    {/* NEW VOUCHER MODAL */}
    {showModal && (
      <div className="modal-overlay">
        <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '580px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileText size={22} color="var(--primary)" />
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--secondary)' }}>
                {editingExpenseId ? 'Edit Payment Voucher' : 'Record Payment Receipt'}
              </h3>
            </div>
            <button
              type="button"
              onClick={closeExpenseModal}
              aria-label="Close"
              style={{ backgroundColor: 'transparent', color: 'var(--text-muted)' }}
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            
            {/* Account Title Selector */}
            <div className="input-group">
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Account Title
              </label>
              <select 
                value={formData.accountTitleId} 
                onChange={(e) => setFormData({...formData, accountTitleId: e.target.value})}
                style={{ width: '100%', height: '48px', border: '1.5px solid var(--border)', borderRadius: '10px', padding: '0 16px', fontSize: '14px', fontWeight: '600' }}
              >
                {ACCOUNT_TITLES.map(at => (
                  <option key={at.id} value={at.id}>{at.label}</option>
                ))}
              </select>
            </div>

            {/* Title / specific reason */}
            <div className="input-group">
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>Voucher Reason / Specific Title</label>
              <input 
                type="text"
                required 
                value={formData.title} 
                onChange={(e) => setFormData({...formData, title: e.target.value})} 
                placeholder="e.g. Electric bill May 2026, Tables maintenance, diesel refill..." 
                style={{ width: '100%', height: '48px', border: '1.5px solid var(--border)', borderRadius: '10px', padding: '0 16px', fontSize: '14px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Payee / vendor */}
              <div className="input-group">
                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>Vendor / Payee Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.payeeName} 
                  onChange={(e) => setFormData({...formData, payeeName: e.target.value})} 
                  placeholder="e.g. ABC Vendor, FBR Office, Cashier" 
                  style={{ width: '100%', height: '48px', border: '1.5px solid var(--border)', borderRadius: '10px', padding: '0 16px', fontSize: '14px' }}
                />
              </div>

              {/* Amount */}
              <div className="input-group">
                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>Amount Paid (PKR)</label>
                <input 
                  type="number" 
                  required 
                  min="1"
                  value={formData.amount} 
                  onChange={(e) => setFormData({...formData, amount: e.target.value})} 
                  placeholder="0.00" 
                  style={{ width: '100%', height: '48px', border: '1.5px solid var(--border)', borderRadius: '10px', padding: '0 16px', fontSize: '14px', fontWeight: '700' }}
                />
              </div>
            </div>

            {/* Date */}
            <div className="input-group">
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>Voucher Date</label>
              <input 
                type="date" 
                required 
                value={formData.expense_date} 
                onChange={(e) => setFormData({...formData, expense_date: e.target.value})} 
                style={{ width: '100%', height: '48px', border: '1.5px solid var(--border)', borderRadius: '10px', padding: '0 16px', fontSize: '14px' }}
              />
            </div>

            {/* Notes */}
            <div className="input-group">
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>Voucher Remarks / Notes</label>
              <textarea 
                rows="2" 
                value={formData.description} 
                onChange={(e) => setFormData({...formData, description: e.target.value})} 
                placeholder="Write any additional observations or comments regarding this transaction..."
                style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: '10px', padding: '12px 16px', fontSize: '14px', resize: 'none' }} 
              />
            </div>

            <button 
              type="submit" 
              className="btn-primary" 
              style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(255, 107, 44, 0.2)' }}
            >
              <FileText size={18} /> Confirm & Print Voucher
            </button>
          </form>

        </div>
      </div>
    )}

    </>
  );
};

export default Expenses;
