const EVENT_ID_RE = /^Evnt-(\d{2})(\d+)$/i;

const yearFromDate = (value) => {
  const iso = String(value || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(2, 4);
  return String(new Date().getFullYear()).slice(-2);
};

/** Display Booking ID as Evnt-YY####. */
export function displayBookingId(booking) {
  const stored = String(booking?.booking_id || '').trim();
  const match = stored.match(EVENT_ID_RE);
  if (match) return `Evnt-${match[1]}${match[2].padStart(4, '0')}`;
  const legacy = stored.match(/^BK-(\d{4})-(\d+)$/i);
  if (legacy) return `Evnt-${legacy[1].slice(-2)}${legacy[2].padStart(4, '0').slice(-4)}`;
  const yy = yearFromDate(booking?.event_date || booking?.created_at || booking?.booking_date);
  const seq = String(booking?.id ?? '').replace(/\D/g, '');
  return `Evnt-${yy}${(seq || '0').padStart(4, '0').slice(-4)}`;
}

export function nextEventBookingId(bookings = [], fromDate) {
  const yy = yearFromDate(fromDate);
  const prefix = `Evnt-${yy}`;
  let highest = 0;
  bookings.forEach((booking) => {
    const match = String(booking?.booking_id || '').match(EVENT_ID_RE);
    if (match && match[1] === yy) {
      highest = Math.max(highest, parseInt(match[2], 10) || 0);
    }
  });
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}
