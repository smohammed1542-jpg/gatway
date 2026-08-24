import { useMemo, useState, useRef, useEffect } from 'react';
import { MoreHorizontal, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Columns3 } from 'lucide-react';
import EmptyState from './EmptyState';
import { Inbox } from 'lucide-react';

function RowMenu({ items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="dash-menu__dropdown" ref={ref} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`dash-menu__item ${item.danger ? 'dash-menu__item--danger' : ''}`}
          onClick={() => {
            item.onClick?.();
            onClose();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Shared workspace table. `variant="dash"` keeps dashboard look.
 * `variant="erp"` is the dense ERP list (sticky header, sort, column chooser).
 */
export default function DataTable({
  columns,
  data = [],
  renderCell,
  rowActions,
  pageSize = 5,
  emptyTitle = 'No data yet',
  emptyDescription = 'Records will appear here once available.',
  onRowClick,
  variant = 'dash',
  sortable = false,
  selectedId,
  showColumnChooser = false,
  getSortValue,
}) {
  const [page, setPage] = useState(0);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [hidden, setHidden] = useState(() => new Set());
  const [chooserOpen, setChooserOpen] = useState(false);
  const chooserRef = useRef(null);

  const visibleColumns = useMemo(
    () => columns.filter((col) => !hidden.has(col.key)),
    [columns, hidden],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const copy = [...data];
    copy.sort((left, right) => {
      const av = getSortValue ? getSortValue(left, sortKey) : left[sortKey];
      const bv = getSortValue ? getSortValue(right, sortKey) : right[sortKey];
      const cmp = compareValues(av, bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, sortDir, getSortValue]);

  const effectivePageSize = pageSize === 0 ? Math.max(sorted.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(sorted.length / effectivePageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = sorted.slice(safePage * effectivePageSize, safePage * effectivePageSize + effectivePageSize);

  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [sorted.length, page, totalPages]);

  useEffect(() => {
    if (!chooserOpen) return undefined;
    const handler = (e) => {
      if (chooserRef.current && !chooserRef.current.contains(e.target)) setChooserOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setChooserOpen(false);
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, [chooserOpen]);

  const toggleSort = (key, enabled) => {
    if (!sortable && !enabled) return;
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
      return;
    }
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  };

  const wrapClass = variant === 'erp' ? 'erp-table-wrap' : 'dash-table-wrap';
  const tableClass = variant === 'erp' ? 'erp-table' : 'dash-table';

  if (!data.length) {
    return (
      <EmptyState
        icon={Inbox}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      {showColumnChooser && (
        <div className="erp-table-toolbar" ref={chooserRef}>
          <button
            type="button"
            className="dash-btn dash-btn--ghost dash-btn--sm"
            onClick={() => setChooserOpen((o) => !o)}
            aria-expanded={chooserOpen}
            aria-label="Choose columns"
          >
            <Columns3 size={14} /> Columns
          </button>
          {chooserOpen && (
            <div className="erp-table-chooser" role="menu">
              {columns.map((col) => (
                <label key={col.key} className="erp-table-chooser__item">
                  <input
                    type="checkbox"
                    checked={!hidden.has(col.key)}
                    onChange={() => {
                      setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(col.key)) next.delete(col.key);
                        else if (next.size < columns.length - 1) next.add(col.key);
                        return next;
                      });
                    }}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div className={wrapClass}>
        <table className={tableClass}>
          <thead>
            <tr>
              {visibleColumns.map((col) => {
                const canSort = sortable || col.sortable;
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={canSort ? 'erp-table__th--sort' : undefined}
                    onClick={() => toggleSort(col.key, col.sortable)}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <span className="erp-table__th-label">
                      {col.label}
                      {canSort && active && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </span>
                  </th>
                );
              })}
              {rowActions && <th style={{ width: 48 }} aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => {
              const rowId = row.id ?? row.key;
              const selected = selectedId != null && String(selectedId) === String(rowId);
              return (
                <tr
                  key={rowId}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={selected ? 'erp-table__row--selected' : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {visibleColumns.map((col) => (
                    <td key={col.key}>{renderCell(row, col.key)}</td>
                  ))}
                  {rowActions && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="dash-table__row-action">
                        <div className="dash-menu">
                          <button
                            type="button"
                            className="dash-menu__trigger"
                            aria-label="Row actions"
                            aria-expanded={openMenuId === rowId}
                            onClick={() =>
                              setOpenMenuId(openMenuId === rowId ? null : rowId)
                            }
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {openMenuId === rowId && (
                            <RowMenu
                              items={rowActions(row)}
                              onClose={() => setOpenMenuId(null)}
                            />
                          )}
                        </div>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageSize !== 0 && data.length > pageSize && (
        <div className="dash-pagination">
          <span className="dash-pagination__info">
            Showing {safePage * effectivePageSize + 1}–{Math.min((safePage + 1) * effectivePageSize, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <div className="dash-pagination__controls">
            <button
              type="button"
              className="dash-btn dash-btn--ghost dash-btn--sm"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="dash-btn dash-btn--ghost dash-btn--sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
