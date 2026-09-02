/**
 * ERP workspace page chrome: compact header, sticky toolbar, optional KPI row and summary panel.
 */
export default function ErpPageShell({
  description,
  actions,
  toolbar,
  kpis,
  summary,
  children,
  className = '',
}) {
  return (
    <div className={`erp-page animate-fade-in ${className}`.trim()}>
      {(description || actions) && (
        <div className="erp-page__header page-header">
          {description && (
            <div className="erp-page__desc">
              {typeof description === 'string' ? (
                <p>{description}</p>
              ) : (
                description
              )}
            </div>
          )}
          {actions && <div className="page-header__actions">{actions}</div>}
        </div>
      )}

      {kpis && <section className="erp-page__kpis dash-kpi-grid">{kpis}</section>}

      {toolbar && <div className="erp-page__toolbar erp-toolbar">{toolbar}</div>}

      <div className={`erp-page__body${summary ? ' erp-page__body--split' : ''}`}>
        <div className="erp-page__main">{children}</div>
        {summary && <aside className="erp-page__summary" aria-label="Summary">{summary}</aside>}
      </div>
    </div>
  );
}
