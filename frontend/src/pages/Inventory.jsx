import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PackagePlus, Trash2, Edit, X, Filter, ChevronRight } from 'lucide-react';
import SearchInput from '../components/SearchInput';
import client from '../api/client';
import toast from 'react-hot-toast';
import AppLoader from '../components/AppLoader';
import {
  STATUS_COLORS,
  CATEGORY_LABELS,
  parseItemToForm,
} from '../utils/inventoryHelpers';
import { usePermissions } from '../hooks/usePermissions';
import DataTable from '../components/ui/DataTable';
import useEscapeClose from '../hooks/useEscapeClose';

const Inventory = () => {
  const { canManage } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    category: 'OTHER',
    quantity: 0,
    unit: '',
    price_per_unit: 0.00,
    status: 'IN_STOCK',
    last_restocked: new Date().toISOString().split('T')[0],
    description: '',
  });

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      let url = '/inventory/items/';
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (filterCategory) params.append('category', filterCategory);
      
      const response = await client.get(`${url}?${params.toString()}`);
      const data = response.data.results || response.data;
      setItems(Array.isArray(data) ? data : []);
      if (!Array.isArray(data)) {
        console.error("Expected array but got:", data);
      }
    } catch (err) {
      toast.error('Failed to fetch inventory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [searchQuery, filterCategory]);

  const openModal = (item = null) => {
    if (!canManage) {
      toast.error('You do not have permission to modify inventory.');
      return;
    }
    if (item) {
      setEditingItem(item);
      setFormData(parseItemToForm(item));
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        category: 'OTHER',
        quantity: 0,
        unit: '',
        price_per_unit: 0.00,
        status: 'IN_STOCK',
        last_restocked: new Date().toISOString().split('T')[0],
        description: '',
      });
    }
    setShowModal(true);
  };

  const openItemDetail = (id) => {
    navigate(`/inventory/${id}`);
  };

  useEffect(() => {
    const editId = location.state?.editItemId;
    if (!editId || items.length === 0) return;
    const item = items.find((i) => String(i.id) === String(editId));
    if (item) {
      openModal(item);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [items, location.state?.editItemId, navigate, location.pathname]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await client.put(`/inventory/items/${editingItem.id}/`, formData);
        toast.success('Item updated successfully');
      } else {
        await client.post('/inventory/items/', formData);
        toast.success('Item added successfully');
      }
      setShowModal(false);
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.name?.[0] || 'Failed to save item');
    }
  };

  const handleDelete = async (id) => {
    if (!canManage) return;
    if (window.confirm('Remove this item from inventory?')) {
      try {
        await client.delete(`/inventory/items/${id}/`);
        toast.success('Item removed');
        fetchItems();
      } catch (err) {
        toast.error('Failed to remove item');
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  useEscapeClose(showModal, closeModal);

  return (
    <>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Track and manage your hall&apos;s supplies and equipment.</p>
          </div>
          {canManage && (
          <button className="btn-primary" onClick={() => openModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PackagePlus size={18} /> Add Item
          </button>
          )}
        </div>

        <div className="search-filter-bar">
          <div className="search-filter-bar__search">
            <SearchInput
              variant="inset"
              placeholder="Search inventory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="filter-field">
            <div style={{ position: 'relative' }}>
              <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1 }} />
              <select
                className="search-filter-bar__select"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{ paddingLeft: '40px', width: '100%', minWidth: '180px' }}
              >
                <option value="">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <AppLoader inline message="Loading inventory…" />
        ) : items.length === 0 ? (
          <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <PackagePlus size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: '16px', fontWeight: '600' }}>No items found</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>Try adjusting your search or add a new item.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <DataTable
              variant="erp"
              sortable
              showColumnChooser
              pageSize={25}
              emptyTitle="No items found"
              emptyDescription="Try adjusting your search or add a new item."
              columns={[
                { key: 'name', label: 'Item Name' },
                { key: 'category', label: 'Category' },
                { key: 'quantity', label: 'Stock / Allocated' },
                { key: 'price_per_unit', label: 'Price/Unit', width: '120px' },
                { key: 'status', label: 'Status', width: '130px' },
              ]}
              data={items}
              onRowClick={(item) => openItemDetail(item.id)}
              getSortValue={(row, key) => {
                if (key === 'quantity') return Number(row.quantity || 0);
                if (key === 'price_per_unit') return Number(row.price_per_unit || 0);
                if (key === 'category') return CATEGORY_LABELS[row.category] || row.category;
                return row[key];
              }}
              rowActions={(item) => [
                { label: 'Open', icon: <ChevronRight size={14} />, onClick: () => openItemDetail(item.id) },
                ...(canManage ? [
                  { label: 'Edit', icon: <Edit size={14} />, onClick: () => openModal(item) },
                  { label: 'Remove', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(item.id) },
                ] : []),
              ]}
              renderCell={(item, key) => {
                if (key === 'name') {
                  return (
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      {item.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.description}</div>}
                    </div>
                  );
                }
                if (key === 'category') return CATEGORY_LABELS[item.category] || item.category;
                if (key === 'quantity') {
                  return (
                    <div>
                      <div>{item.quantity} {item.unit} total</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Allocated: {item.allocated_quantity || 0} · Available: {Math.max(0, (item.quantity || 0) - (item.allocated_quantity || 0))}
                      </div>
                    </div>
                  );
                }
                if (key === 'price_per_unit') {
                  return (
                    <>
                      <span style={{ fontSize: '55%', fontWeight: 600, opacity: 0.65 }}>Rs</span>{' '}
                      {parseFloat(item.price_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </>
                  );
                }
                if (key === 'status') {
                  const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.IN_STOCK;
                  return (
                    <span style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      backgroundColor: statusStyle.bg, color: statusStyle.color,
                    }}>
                      {statusStyle.label}
                    </span>
                  );
                }
                return item[key];
              }}
            />
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="card modal-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>{editingItem ? 'Edit Item' : 'Add New Item'}</h3>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                style={{ backgroundColor: 'transparent', color: 'var(--text-muted)' }}
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Item Name</label>
                  <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Chair, Rice, Lightbulb" />
                </div>
                <div className="input-group">
                  <label>Category</label>
                  <select required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid-3">
                <div className="input-group">
                  <label>Quantity</label>
                  <input type="number" required min="0" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="input-group">
                  <label>Unit</label>
                  <input required value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} placeholder="e.g. pcs, kg" />
                </div>
                <div className="input-group">
                  <label>Price per Unit (Rs)</label>
                  <input type="number" required min="0" step="0.01" value={formData.price_per_unit} onChange={(e) => setFormData({ ...formData, price_per_unit: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="input-group">
                  <label>Status</label>
                  <select required value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="IN_STOCK">In Stock</option>
                    <option value="LOW_STOCK">Low Stock</option>
                    <option value="OUT_OF_STOCK">Out of Stock</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Last Restocked</label>
                  <input type="date" value={formData.last_restocked} onChange={(e) => setFormData({ ...formData, last_restocked: e.target.value })} />
                </div>
              </div>

              <div className="input-group">
                <label>Description (Optional)</label>
                <textarea 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                  placeholder="Additional details about this item..."
                  style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', resize: 'vertical', minHeight: '80px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                <button type="button" onClick={closeModal} className="btn-secondary" style={{ flex: 1, padding: '12px', textAlign: 'center', background: 'transparent', border: '1px solid var(--border-color)' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 2, padding: '12px' }}>
                  {editingItem ? 'Update Item' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Inventory;
