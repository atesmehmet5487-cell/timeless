/**
 * Türkçe tarih ifadelerini metinden çıkarır.
 *
 * Çıktı ham bir "tarih ifadesi"dir; tek güne mi yoksa tekrar eden bir kurala mı
 * karşılık geldiğine niyet katmanı karar verir ("ayın 15'i" ekleme komutunda
 * her ay demektir, erteleme komutunda o ayın 15'i demektir).
 */
import * as D from '../domain/date';
import type { ISODate, Recurrence, Weekday } from '../domain/types';
import { B, E, re } from './boundary';

export type DateExpr =
  | { kind: 'monthlyDay'; day: number }
  | { kind: 'monthEnd' }
  | { kind: 'weekly'; weekday: Weekday }
  | { kind: 'yearly'; month: number; day: number }
  | { kind: 'everyNDays'; interval: number }
  /** Kesin gün. */
  | { kind: 'date'; date: ISODate }
  /** Sadece ayın günü söylenmiş: "20'sine". Bağlama göre çözülür. */
  | { kind: 'dayOfMonth'; day: number };

export interface DateMatch {
  expr: DateExpr;
  /** Metinde eşleşen ham parça — başlık çıkarılırken silinir. */
  matched: string;
}

const MONTHS: Record<string, number> = {
  ocak: 1,
  şubat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  eylül: 9,
  ekim: 10,
  kasım: 11,
  aralık: 12,
};

const WEEKDAYS: Record<string, Weekday> = {
  pazartesi: 1,
  salı: 2,
  çarşamba: 3,
  perşembe: 4,
  cuma: 5,
  cumartesi: 6,
  pazar: 7,
};

/** Ek alabilen kelimelerin kuyruğu: "ekim'de", "salıya", "yarınki". */
const TAIL = "['a-zçğıöşü]*";
const MONTH_RE = Object.keys(MONTHS).join('|');
// Uzun olanlar önce eşleşmeli: "cumartesi" | "cuma", "pazartesi" | "pazar"
const WEEKDAY_RE = 'pazartesi|cumartesi|çarşamba|perşembe|salı|cuma|pazar';
/** Sayıdan sonra gelebilen ekler: "15 inde", "20 sine". */
const DAY_SUFFIX =
  'sinde|sında|sunda|sünde|sine|sına|suna|süne|inde|ında|unda|ünde|ine|ına|une|üne|' +
  'inci|ıncı|uncu|üncü|si|sı|su|sü|de|da|te|ta|i|ı|u|ü|e|a';
const SP = '\\s+';
const DIGITS2 = '\\d{1,2}';

/** "her ayın 15'i" / "ayın 15 inde" / "her ay 15 i" */
const MONTHLY_DAY = re(
  B + '(?:her' + SP + ')?ay(?:ın|in)?' + SP + '(' + DIGITS2 + ')' +
    '(?:' + SP + '(?:' + DAY_SUFFIX + '))?(?:' + SP + 'g[üu]n[üu])?' + E,
);
/** "ayın sonunda" / "ay sonu" / "ayın son günü" */
const MONTH_END = re(
  B + '(?:her' + SP + ')?ay(?:ın|in)?' + SP + 'son(?:unda|u|' + SP + 'g[üu]n[üu])?' + E,
);
/** "her hafta perşembe" / "her perşembe" */
const WEEKLY = re(B + 'her' + SP + '(?:hafta' + SP + ')?(' + WEEKDAY_RE + ')' + TAIL + E);
/** "her yıl 3 nisan" / "her sene 3 nisanda" */
const YEARLY = re(
  B + 'her' + SP + '(?:yıl|sene)' + SP + '(' + DIGITS2 + ')' + SP + '(' + MONTH_RE + ')' + TAIL + E,
);
/** "her 10 günde bir" — normalizasyon "bir"i 1'e çevirmiş olabilir. */
const EVERY_N_DAYS = re(
  B + '(?:her' + SP + ')?(\\d{1,3})' + SP + 'g[üu]nde' + SP + '(?:bir|1)' + E,
);
/** "15 ekim 2026" / "15 ekim" */
const DAY_MONTH = re(
  B + '(' + DIGITS2 + ')' + SP + '(' + MONTH_RE + ')' + TAIL + '(?:' + SP + '(\\d{4}))?' + E,
);
/** "15.10.2026" / "15/10/2026" / "15.10" */
const NUMERIC_DATE = re(
  B + '(' + DIGITS2 + ')[./](' + DIGITS2 + ')(?:[./](\\d{2,4}))?' + E,
);
/** "haftaya salı" / "gelecek hafta perşembe" */
const NEXT_WEEK_DAY = re(
  B + '(?:haftaya|gelecek' + SP + 'hafta|[öo]n[üu]m[üu]zdeki' + SP + 'hafta)' + SP +
    '(' + WEEKDAY_RE + ')' + TAIL + E,
);
/** Tek başına gün adı: "perşembe", "salıya" */
const BARE_WEEKDAY = re(B + '(' + WEEKDAY_RE + ')' + TAIL + E);
/** Sadece ayın günü: "20 sine", "15 inde" */
const BARE_DAY = re(
  B + '(' + DIGITS2 + ')' + SP +
    '(?:sine|sına|suna|süne|ine|ına|une|üne|inde|ında|unda|ünde|si|sı|i|ı)' + E,
);

interface Relative {
  pattern: RegExp;
  days?: number;
  months?: number;
}

const RELATIVES: Relative[] = [
  { pattern: re(B + 'bug[üu]n' + TAIL + E), days: 0 },
  { pattern: re(B + 'yarın' + TAIL + E), days: 1 },
  { pattern: re(B + '[öo]b[üu]r' + SP + 'g[üu]n' + TAIL + E), days: 2 },
  { pattern: re(B + 'ertesi' + SP + 'g[üu]n' + TAIL + E), days: 1 },
  { pattern: re(B + 'd[üu]n' + E), days: -1 },
  {
    pattern: re(B + '(?:haftaya|gelecek' + SP + 'hafta|[öo]n[üu]m[üu]zdeki' + SP + 'hafta)' + E),
    days: 7,
  },
  { pattern: re(B + '(?:gelecek' + SP + 'ay|[öo]n[üu]m[üu]zdeki' + SP + 'ay)' + E), months: 1 },
  { pattern: re(B + '(?:seneye|gelecek' + SP + 'yıl|gelecek' + SP + 'sene)' + E), months: 12 },
];

function normalizeYear(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return n < 100 ? 2000 + n : n;
}

/**
 * Metindeki ilk tarih ifadesini bulur.
 * Sıralama önemlidir: en belirgin kalıplar önce denenir.
 */
export function extractDate(text: string, today: ISODate = D.today()): DateMatch | null {
  const { year: thisYear } = D.parts(today);

  const yearly = YEARLY.exec(text);
  if (yearly) {
    return {
      expr: { kind: 'yearly', month: MONTHS[yearly[2]], day: Number(yearly[1]) },
      matched: yearly[0],
    };
  }

  const everyN = EVERY_N_DAYS.exec(text);
  if (everyN) {
    return { expr: { kind: 'everyNDays', interval: Number(everyN[1]) }, matched: everyN[0] };
  }

  const weekly = WEEKLY.exec(text);
  if (weekly) {
    return { expr: { kind: 'weekly', weekday: WEEKDAYS[weekly[1]] }, matched: weekly[0] };
  }

  const monthEnd = MONTH_END.exec(text);
  if (monthEnd) return { expr: { kind: 'monthEnd' }, matched: monthEnd[0] };

  const monthly = MONTHLY_DAY.exec(text);
  if (monthly) {
    const day = Number(monthly[1]);
    if (day >= 1 && day <= 31) {
      return { expr: { kind: 'monthlyDay', day }, matched: monthly[0] };
    }
  }

  const numeric = NUMERIC_DATE.exec(text);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = normalizeYear(numeric[3], thisYear);
      const date = D.toISO(year, month, Math.min(day, D.daysInMonth(year, month)));
      return {
        expr: { kind: 'date', date: numeric[3] ? date : rollForward(date, today) },
        matched: numeric[0],
      };
    }
  }

  const dayMonth = DAY_MONTH.exec(text);
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = MONTHS[dayMonth[2]];
    if (day >= 1 && day <= D.daysInMonth(thisYear, month)) {
      const year = normalizeYear(dayMonth[3], thisYear);
      const date = D.toISO(year, month, day);
      return {
        expr: { kind: 'date', date: dayMonth[3] ? date : rollForward(date, today) },
        matched: dayMonth[0],
      };
    }
  }

  const nextWeekDay = NEXT_WEEK_DAY.exec(text);
  if (nextWeekDay) {
    const target = WEEKDAYS[nextWeekDay[1]];
    return {
      expr: { kind: 'date', date: nextWeekdayDate(today, target, true) },
      matched: nextWeekDay[0],
    };
  }

  for (const rel of RELATIVES) {
    const match = rel.pattern.exec(text);
    if (!match) continue;
    const date = rel.months ? D.addMonths(today, rel.months) : D.addDays(today, rel.days ?? 0);
    return { expr: { kind: 'date', date }, matched: match[0] };
  }

  const bareWeekday = BARE_WEEKDAY.exec(text);
  if (bareWeekday) {
    return {
      expr: { kind: 'date', date: nextWeekdayDate(today, WEEKDAYS[bareWeekday[1]], false) },
      matched: bareWeekday[0],
    };
  }

  const bareDay = BARE_DAY.exec(text);
  if (bareDay) {
    const day = Number(bareDay[1]);
    if (day >= 1 && day <= 31) return { expr: { kind: 'dayOfMonth', day }, matched: bareDay[0] };
  }

  return null;
}

/** Yıl söylenmemişse geçmiş bir tarihi gelecek yıla taşır. */
function rollForward(date: ISODate, today: ISODate): ISODate {
  return date >= today ? date : D.addYears(date, 1);
}

/**
 * Verilen hafta gününün bir sonraki tarihi (bugün hariç).
 * `nextWeek` ise "haftaya salı" gibi, gelecek haftanın (Pazartesi başlangıçlı)
 * o günü döner.
 */
export function nextWeekdayDate(today: ISODate, target: Weekday, nextWeek: boolean): ISODate {
  if (nextWeek) {
    const nextMonday = D.addDays(today, 8 - D.weekday(today));
    return D.addDays(nextMonday, target - 1);
  }
  const diff = (target - D.weekday(today) + 7) % 7;
  return D.addDays(today, diff === 0 ? 7 : diff);
}

/** Tarih ifadesini tekrar kuralına çevirir (ekleme komutları için). */
export function toRecurrence(expr: DateExpr, today: ISODate = D.today()): Recurrence {
  switch (expr.kind) {
    case 'monthlyDay':
      return { type: 'monthly', day: expr.day, from: today };
    case 'monthEnd':
      return { type: 'monthly', day: 31, from: today };
    case 'weekly':
      return { type: 'weekly', weekday: expr.weekday, from: today };
    case 'yearly':
      return { type: 'yearly', month: expr.month, day: expr.day, from: today };
    case 'everyNDays':
      return { type: 'everyNDays', interval: expr.interval, from: today };
    case 'date':
      return { type: 'once', date: expr.date };
    case 'dayOfMonth':
      return { type: 'monthly', day: expr.day, from: today };
  }
}

/** Tarih ifadesini tek bir güne çevirir (erteleme/işaretleme komutları için). */
export function toSingleDate(expr: DateExpr, today: ISODate = D.today()): ISODate {
  switch (expr.kind) {
    case 'date':
      return expr.date;
    case 'monthEnd':
      return D.lastDayOfMonth(today);
    case 'dayOfMonth':
    case 'monthlyDay': {
      const { year, month } = D.parts(today);
      const day = Math.min(expr.day, D.daysInMonth(year, month));
      const candidate = D.toISO(year, month, day);
      // Gün geçtiyse gelecek ayı kastediyordur
      return candidate >= today ? candidate : D.addMonths(candidate, 1);
    }
    case 'weekly':
      return nextWeekdayDate(today, expr.weekday, false);
    case 'yearly': {
      const { year } = D.parts(today);
      const candidate = D.toISO(year, expr.month, expr.day);
      return candidate >= today ? candidate : D.addYears(candidate, 1);
    }
    case 'everyNDays':
      return D.addDays(today, expr.interval);
  }
}

/** Tekrar eden bir kural mı, tek gün mü? */
export function isRecurringExpr(expr: DateExpr): boolean {
  return (
    expr.kind === 'monthlyDay' ||
    expr.kind === 'monthEnd' ||
    expr.kind === 'weekly' ||
    expr.kind === 'yearly' ||
    expr.kind === 'everyNDays'
  );
}
