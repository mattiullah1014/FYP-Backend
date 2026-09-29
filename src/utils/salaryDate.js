/**
 * Next company payday as YYYY-MM-DD.
 * Default pay day is the 28th (or last day of shorter months).
 * If today is on/before that day, return this month; otherwise next month.
 */
export const computeNextSalaryDate = (fromDate = new Date(), payDay = 28) => {
  const base = new Date(fromDate);
  if (Number.isNaN(base.getTime())) {
    return computeNextSalaryDate(new Date(), payDay);
  }

  const y = base.getFullYear();
  const m = base.getMonth(); // 0-indexed
  const today = base.getDate();

  const paydayThisMonth = Math.min(
    payDay,
    new Date(y, m + 1, 0).getDate()
  );

  let year = y;
  let month = m;
  if (today > paydayThisMonth) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  const day = Math.min(payDay, new Date(year, month + 1, 0).getDate());
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
};
