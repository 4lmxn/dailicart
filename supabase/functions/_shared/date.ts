export function getIstDateString(date: Date = new Date()): string {
  const utcMillis = date.getTime() + date.getTimezoneOffset() * 60_000;
  const istMillis = utcMillis + 5.5 * 60 * 60_000;
  const istDate = new Date(istMillis);
  return istDate.toISOString().slice(0, 10);
}

export function addDaysIst(date: Date, days: number): string {
  const base = new Date(date.getTime() + days * 86_400_000);
  return getIstDateString(base);
}
