export const POSTED_BOOKING_STATUSES = ['COMPLETED', 'CANCELLED'];
export const POSTED_STAY_STATUSES = ['CHECKED_OUT', 'CANCELLED'];
export const VOID_PAYMENT_STATUSES = ['VOIDED', 'CANCELLED'];
export const LOCKED_PAYMENT_STATUSES = ['COMPLETED', 'VOIDED'];
export const LOCKED_EXPENSE_STATUSES = ['CANCELLED'];

export const isPostedBooking = (status) => POSTED_BOOKING_STATUSES.includes(status);
export const isPostedStay = (status) => POSTED_STAY_STATUSES.includes(status);
export const isVoided = (status) => VOID_PAYMENT_STATUSES.includes(status);
export const isLockedPayment = (status) => LOCKED_PAYMENT_STATUSES.includes(status);
export const isLockedExpense = (status) => LOCKED_EXPENSE_STATUSES.includes(status);

export const taxRateFromTenant = (tenant) => {
  const n = Number(tenant?.tax_rate);
  return Number.isFinite(n) && n >= 0 ? n : 0.05;
};

export const overtimeRateFromTenant = (tenant) => {
  const n = Number(tenant?.overtime_rate_per_hour);
  return Number.isFinite(n) && n >= 0 ? n : 5000;
};
