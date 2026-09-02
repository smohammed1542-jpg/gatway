import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import useEscapeClose from '../../hooks/useEscapeClose';

/**
 * Compact ERP dialog — portaled to document.body so it covers the full viewport.
 */
export default function ErpFormDialog({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  size = 'sm',
  ariaLabelledBy,
}) {
  useEscapeClose(open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className="erp-dialog-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`erp-dialog erp-dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="erp-dialog__header">
          <div className="erp-dialog__header-main">
            {Icon && (
              <span className="erp-dialog__icon" aria-hidden>
                <Icon size={18} />
              </span>
            )}
            <div>
              <h2 className="erp-dialog__title" id={ariaLabelledBy}>{title}</h2>
              {subtitle && <p className="erp-dialog__subtitle">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            className="erp-dialog__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </header>

        <div className="erp-dialog__body">
          {children}
        </div>

        {footer && (
          <footer className="erp-dialog__footer">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
