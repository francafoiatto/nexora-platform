/** The UI copy is English, so dates use the same locale instead of mixing languages. */
export const LOCALE = 'en-US';

const dateFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

/** Due dates are calendar dates stored at UTC midnight; format them in UTC to avoid off-by-one days. */
export function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function isOverdue(dueIso: string | null, status: string, now = new Date()): boolean {
  if (!dueIso || status === 'DONE') return false;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(dueIso).getTime() < today;
}

/** yyyy-mm-dd for <input type="date"> from an ISO date stored at UTC midnight. */
export function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), 'day');
  return formatDate(iso);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
