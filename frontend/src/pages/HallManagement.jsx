import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchInput from '../components/SearchInput';
import {
  Plus,
  MapPin,
  Users,
  Edit2,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import { getVenues, deleteVenue } from '../api/venues';
import toast from 'react-hot-toast';
import AppLoader from '../components/AppLoader';
import { usePermissions } from '../hooks/usePermissions';
import { resolveMediaUrl } from '../utils/media';

const HallManagement = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { canManage } = usePermissions();
  const [halls, setHalls] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchHalls = async () => {
    setIsLoading(true);
    try {
      const data = await getVenues();
      setHalls(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load halls');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHalls();
  }, []);

  const openCreate = () => {
    if (!canManage) {
      toast.error('You do not have permission to modify halls.');
      return;
    }
    navigate('/halls/new');
  };

  const openEdit = (hall) => {
    if (!canManage) return;
    navigate(`/halls/${hall.id}/edit`);
  };

  const filteredHalls = halls.filter((hall) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (hall.name || '').toLowerCase().includes(q) ||
      (hall.location || '').toLowerCase().includes(q) ||
      (hall.description || '').toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id) => {
    if (!canManage) return;
    if (window.confirm('Are you sure you want to delete this hall?')) {
      try {
        const result = await deleteVenue(id);
        toast.success(result?.archived ? 'Hall removed and booking history preserved' : 'Hall deleted');
        fetchHalls();
      } catch (error) {
        const message = error.response?.data?.detail || 'Failed to delete hall';
        toast.error(message);
      }
    }
  };

  return (
    <div className="animate-fade-in">
      {!embedded ? (
        <div className="page-header">
          <div>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Overview of all your available venues and halls.</p>
          </div>
          {canManage && (
            <button type="button" className="btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} /> Add New Hall
            </button>
          )}
        </div>
      ) : canManage ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <button type="button" className="btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} /> Add New Hall
          </button>
        </div>
      ) : null}

      <div className="search-toolbar">
        <SearchInput
          variant="inset"
          placeholder="Search halls by name or location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <AppLoader inline message="Loading halls…" />
      ) : (
        <div className="halls-grid">
          {filteredHalls.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              {searchQuery ? 'No halls match your search.' : 'No halls yet. Add your first hall.'}
            </div>
          ) : filteredHalls.map((hall) => (
            <div key={hall.id} className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ height: '180px', backgroundColor: 'var(--surface-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', position: 'relative' }}>
                {hall.image ? (
                  <img src={resolveMediaUrl(hall.image)} alt={hall.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <ImageIcon size={48} />
                )}
                {canManage && (
                  <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={() => openEdit(hall)} style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--surface)', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                      <Edit2 size={14} />
                    </button>
                    <button type="button" onClick={() => handleDelete(hall.id)} style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--surface)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700' }}>{hall.name}</h3>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    backgroundColor: hall.status === 'ACTIVE' ? '#dcfce7' : 'var(--surface-elevated)',
                    color: hall.status === 'ACTIVE' ? '#166534' : 'var(--text-dim)',
                  }}>
                    {hall.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    <MapPin size={14} /> {hall.location}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    <Users size={14} /> {hall.capacity} Guests
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--primary)', fontWeight: '800', fontSize: '20px' }}>
                    <span style={{ fontSize: '55%', fontWeight: '600', opacity: 0.6 }}>Rs</span> {parseFloat(hall.price_per_day).toLocaleString()}<span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}> /day</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HallManagement;
