const hijriOptions = { calendar: 'islamic-umalqura', numberingSystem: 'arab' };

const hijriFormatter = (options) => {
  try {
    return new Intl.DateTimeFormat('ar-SA', { ...hijriOptions, ...options });
  } catch {
    return new Intl.DateTimeFormat('ar', { calendar: 'islamic', numberingSystem: 'arab', ...options });
  }
};

export function hijriParts(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return { day: '', month: '', year: '' };
  const parts = hijriFormatter({
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(value);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return { day: pick('day'), month: pick('month'), year: pick('year') };
}

export function formatHijriDayMonth(date) {
  const { day, month } = hijriParts(date);
  return day && month ? `${day} ${month}` : '';
}

export function formatHijriLong(date) {
  const { day, month, year } = hijriParts(date);
  return day && month && year ? `${day} ${month} ${year} هـ` : '';
}

export function formatHijriMonthRange(monthStart, monthEnd) {
  const start = hijriParts(monthStart);
  const end = hijriParts(monthEnd);
  if (!start.month || !end.month) return '';
  if (start.month === end.month && start.year === end.year) {
    return `${start.month} ${start.year} هـ`;
  }
  if (start.year === end.year) {
    return `${start.month} – ${end.month} ${start.year} هـ`;
  }
  return `${start.month} ${start.year} – ${end.month} ${end.year} هـ`;
}
