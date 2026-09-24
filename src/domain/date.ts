/**
 * "YYYY-AA-GG" metin tarihleri üzerinde çalışan yardımcılar.
 *
 * Neden Date nesnesi değil: JS Date her zaman bir saat dilimi taşır ve
 * "ayın 15'i" gibi bir gün, cihaz saat dilimi değişince 14'üne kayabilir.
 * Burada gün = metin; aritmetik için UTC'de geçici Date kullanılır (kayma olmaz).
 */
import type { ISODate, Weekday } from './types';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): value is ISODate {
  if (!ISO_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toISO(year: number, month: number, day: number): ISODate {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function parts(date: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/** Cihazın yerel saatine göre bugün. */
export function today(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** "09:00" biçiminde şu anki saat. */
export function nowHHMM(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function toUTC(date: ISODate): Date {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUTC(d: Date): ISODate {
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/**
 * Ay ekler. Hedef ayda gün yoksa ayın son gününe çeker
 * (31 Ocak + 1 ay = 28/29 Şubat).
 */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = parts(date);
  const total = year * 12 + (month - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

export function addYears(date: ISODate, years: number): ISODate {
  const { year, month, day } = parts(date);
  return toISO(year + years, month, Math.min(day, daysInMonth(year + years, month)));
}

/** İki tarih arasındaki tam gün farkı (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000);
}

export function compare(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function min(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function max(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Pazartesi = 1 ... Pazar = 7. */
export function weekday(date: ISODate): Weekday {
  const wd = toUTC(date).getUTCDay();
  return (wd === 0 ? 7 : wd) as Weekday;
}

export function isWeekend(date: ISODate): boolean {
  const wd = weekday(date);
  return wd === 6 || wd === 7;
}

export function lastDayOfMonth(date: ISODate): ISODate {
  const { year, month } = parts(date);
  return toISO(year, month, daysInMonth(year, month));
}

export function startOfMonth(date: ISODate): ISODate {
  const { year, month } = parts(date);
  return toISO(year, month, 1);
}

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const WEEKDAYS_TR = [
  'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
];

export function monthNameTR(month: number): string {
  return MONTHS_TR[month - 1] ?? '';
}

export function weekdayNameTR(date: ISODate): string {
  return WEEKDAYS_TR[weekday(date) - 1];
}

/** "15 Eylül 2026 Salı" */
export function formatLongTR(date: ISODate, withWeekday = true): string {
  const { year, month, day } = parts(date);
  const base = `${day} ${monthNameTR(month)} ${year}`;
  return withWeekday ? `${base} ${weekdayNameTR(date)}` : base;
}

/** "15.09.2026" */
export function formatShortTR(date: ISODate): string {
  const { year, month, day } = parts(date);
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

/** "bugün" / "yarın" / "dün" / "3 gün sonra" / "15 Eylül 2026" */
export function formatRelativeTR(date: ISODate, from: ISODate = today()): string {
  const d = diffDays(from, date);
  if (d === 0) return 'bugün';
  if (d === 1) return 'yarın';
  if (d === 2) return 'öbür gün';
  if (d === -1) return 'dün';
  if (d > 0 && d <= 7) return `${d} gün sonra`;
  if (d < 0 && d >= -7) return `${-d} gün önce`;
  return formatLongTR(date, false);
}

/**
 * Ayın gününe Türkçe iyelik eki ekler: 1 → "1'i", 12 → "12'si", 30 → "30'u".
 * Sesli okuma ve komut ayrıştırma da bu tabloyu kullanır.
 */
const DAY_SUFFIX: Record<number, string> = {
  1: "'i", 2: "'si", 3: "'ü", 4: "'ü", 5: "'i",
  6: "'sı", 7: "'si", 8: "'i", 9: "'u", 0: "'u",
};

export function dayOrdinalTR(day: number): string {
  if (day === 20) return "20'si";
  return `${day}${DAY_SUFFIX[day % 10] ?? "'i"}`;
}
