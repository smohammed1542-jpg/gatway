const STATUS_MAP = {
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  PAID: 'paid',
  DRAFT: 'default',
  PENDING: 'pending',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  ACTIVE: 'confirmed',
  INACTIVE: 'default',
  MAINTENANCE: 'pending',
  CHECKED_IN: 'confirmed',
  CHECKED_OUT: 'default',
};

function formatLabel(status) {
  if (!status) return '-';
  return String(status)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StatusBadge({ status, label }) {
  const key = String(status || '').toUpperCase();
  const variant = STATUS_MAP[key] || 'default';
  const display = label ?? formatLabel(key);

  return (
    <span className={`dash-badge dash-badge--${variant}`}>
      <span className="dash-badge__dot" aria-hidden />
      {display}
    </span>
  );
}
