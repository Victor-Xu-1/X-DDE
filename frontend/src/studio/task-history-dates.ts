/** Calendar labels are local days; API bounds are explicit, half-open UTC instants. */
export function calendarDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999) return null;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

export function dayLabel(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function boundaryDay(value: string, nextDay = false) {
  const date = calendarDay(value);
  if (!date) return null;
  if (nextDay) {
    date.setDate(date.getDate() + 1);
    // Midnight may have normalized to01:00 on the selected DST transition day.
    date.setHours(0, 0, 0, 0);
  }
  return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999
    ? date
    : null;
}

export function historyDateError(filter: {
  startDate?: string;
  endDate?: string;
}) {
  const { startDate = "", endDate = "" } = filter;
  return Boolean(
    (startDate && !boundaryDay(startDate)) ||
    (endDate && !boundaryDay(endDate, true)) ||
    (startDate && endDate && startDate > endDate),
  );
}

export function historyDateParams(filter: {
  startDate?: string;
  endDate?: string;
}) {
  const params: Record<string, string> = {};
  const start = boundaryDay(filter.startDate ?? "");
  const end = boundaryDay(filter.endDate ?? "", true);
  if (start) params.created_from = start.toISOString();
  if (end) {
    params.created_before = end.toISOString();
  }
  return params;
}
