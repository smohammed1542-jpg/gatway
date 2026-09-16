import { useMemo, useState, useRef, useEffect, useLayoutEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Columns3 } from 'lucide-react';
import EmptyState from './EmptyState';
import { Inbox } from 'lucide-react';

function RowMenu({ items, onClose, anchorRef }) {
  const ref = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, openUp: false });

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = 160;
      const estimatedHeight = Math.max(48, items.length * 40 + 12);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      setCoords({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left,
        openUp,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, items.length]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose();
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
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      className={`dash-menu__dropdown dash-menu__dropdown--portal${coords.openUp ? ' dash-menu__dropdown--up' : ''}`}
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        top: coords.openUp ? undefined : coords.top,
        bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
        left: coords.left,
        right: 'auto',
        zIndex: 10050,
      }}
    >
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
    </div>,
    document.body,
  );
}

function RowActionsCell({ rowId, openMenuId, setOpenMenuId, items }) {
  const triggerRef = useRef(null);
  const isOpen = openMenuId === rowId;

  return (
    <div className="dash-table__row-action">
      <div className="dash-menu">
        <button
          type="button"
          ref={triggerRef}
          className="dash-menu__trigger"
          aria-label="Row actions"
          aria-expanded={isOpen}
          onClick={() => setOpenMenuId(isOpen ? null : rowId)}
        >
          <MoreHorizontal size={18} />
        </button>
        {isOpen && (
          <RowMenu
            items={items}
            anchorRef={triggerRef}
            onClose={() => setOpenMenuId(null)}
          />
        )}
      </div>
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
 * Optional `groupBy` inserts day/section header rows inside the same table.
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
  groupBy,
  renderGroupHeader,
  getGroupSortValue,
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

  const groupedSections = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map();
    for (const row of sorted) {
      const key = String(groupBy(row) ?? '');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    const sections = Array.from(map.entries()).map(([key, rows]) => ({ key, rows }));
    sections.sort((a, b) => {
      const av = getGroupSortValue ? getGroupSortValue(a.key, a.rows) : a.key;
      const bv = getGroupSortValue ? getGroupSortValue(b.key, b.rows) : b.key;
      return compareValues(av, bv);
    });
    return sections;
  }, [sorted, groupBy, getGroupSortValue]);

  const flatForPaging = groupedSections
    ? groupedSections.flatMap((section) => section.rows)
    : sorted;

  const effectivePageSize = pageSize === 0 ? Math.max(flatForPaging.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(flatForPaging.length / effectivePageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * effectivePageSize;
  const pageEnd = pageStart + effectivePageSize;
  const slice = flatForPaging.slice(pageStart, pageEnd);

  const visibleSections = useMemo(() => {
    if (!groupedSections) return null;
    if (pageSize === 0) return groupedSections;
    const pageIds = new Set(slice.map((row) => String(row.id ?? row.key)));
    return groupedSections
      .map((section) => ({
        ...section,
        rows: section.rows.filter((row) => pageIds.has(String(row.id ?? row.key))),
      }))
      .filter((section) => section.rows.length > 0);
  }, [groupedSections, slice, pageSize]);

  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [flatForPaging.length, page, totalPages]);

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
  const colSpan = visibleColumns.length + (rowActions ? 1 : 0);

  const renderDataRow = (row) => {
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
            <RowActionsCell
              rowId={rowId}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              items={rowActions(row)}
            />
          </td>
        )}
      </tr>
    );
  };

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
        <table className={`${tableClass}${groupBy ? ` ${tableClass}--grouped` : ''}`}>
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
            {visibleSections
              ? visibleSections.map((section) => (
                  <Fragment key={`group-${section.key || 'none'}`}>
                    <tr className="erp-table__group-row">
                      <td colSpan={colSpan}>
                        {renderGroupHeader
                          ? renderGroupHeader(section.key, section.rows)
                          : section.key}
                      </td>
                    </tr>
                    {section.rows.map((row) => renderDataRow(row))}
                  </Fragment>
                ))
              : slice.map((row) => renderDataRow(row))}
          </tbody>
        </table>
      </div>
      {pageSize !== 0 && data.length > pageSize && (
        <div className="dash-pagination">
          <span className="dash-pagination__info">
            Showing {safePage * effectivePageSize + 1}–{Math.min((safePage + 1) * effectivePageSize, flatForPaging.length)} of{' '}
            {flatForPaging.length}
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
