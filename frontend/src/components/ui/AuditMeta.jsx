function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AuditMeta({ status, createdBy, updatedBy, createdAt, updatedAt }) {
  const rows = [
    status ? ['Status', status] : null,
    createdBy ? ['Created by', createdBy] : null,
    createdAt ? ['Created', formatWhen(createdAt)] : null,
    updatedBy ? ['Updated by', updatedBy] : null,
    updatedAt ? ['Updated', formatWhen(updatedAt)] : null,
  ].filter(Boolean);

  if (!rows.length) return null;

  return (
    <dl className="erp-audit">
      {rows.map(([label, value]) => (
        <div key={label} className="erp-audit__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
