import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ErpPageShell from '../../components/ui/ErpPageShell';
import { usePageTitle } from '../../context/PageTitleContext';
import {
  TrialBalancePage,
  ProfitLossPage,
  BalanceSheetPage,
  CashFlowPage,
  GeneralLedgerPage,
} from './ReportsPages';

const REPORT_TABS = [
  { id: 'trial-balance', label: 'Trial Balance', component: TrialBalancePage },
  { id: 'profit-loss', label: 'Profit & Loss', component: ProfitLossPage },
  { id: 'balance-sheet', label: 'Balance Sheet', component: BalanceSheetPage },
  { id: 'cash-flow', label: 'Cash Flow', component: CashFlowPage },
  { id: 'general-ledger', label: 'General Ledger', component: GeneralLedgerPage },
];

const AccountingReportsHub = () => {
  usePageTitle('Financial Reports');
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') || 'trial-balance';

  const tab = useMemo(
    () => REPORT_TABS.find((t) => t.id === active) || REPORT_TABS[0],
    [active],
  );

  const ActiveReport = tab.component;

  return (
    <ErpPageShell
      description="Financial statements from posted journal entries. Bookings, payments, and expenses post automatically on the backend."
      toolbar={(
        <div className="erp-filter-pills" role="tablist" aria-label="Report type">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab.id === t.id}
              className={`erp-filter-pill${tab.id === t.id ? ' erp-filter-pill--active' : ''}`}
              onClick={() => setParams({ tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    >
      <div role="tabpanel" aria-label={tab.label}>
        <ActiveReport />
      </div>
    </ErpPageShell>
  );
};

export default AccountingReportsHub;
