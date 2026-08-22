/** Every 30-minute slot of the day as "HH:MM" (24h) — the stored/scheduler format. */
export const REMINDER_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, '0');
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

/** "21:30" -> "9:30 PM" */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** "21:30" -> "21:30" (normalized passthrough). */
export function formatTime24(hhmm: string): string {
  return hhmm;
}

/** Formats a stored "HH:MM" value in the user's chosen display format. */
export function formatTime(hhmm: string, format: '12h' | '24h'): string {
  return format === '24h' ? formatTime24(hhmm) : formatTime12(hhmm);
}
