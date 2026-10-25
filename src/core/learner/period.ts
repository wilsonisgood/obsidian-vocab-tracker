import { localDayOf } from "./reading";

// Period helpers for the learning report (規劃書 15). Days are local dates
// YYYY-MM-DD; weeks are ISO 8601 (Monday first), keyed "2026-W43".

export interface DayRange {
  from: string;
  to: string;
}
export interface WeekRange extends DayRange {
  key: string;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  return localDayOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

// Days between two dates, inclusive of both ends.
export function daysInRange(r: DayRange): number {
  const a = parseDay(r.from);
  const b = parseDay(r.to);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

// Thursday of the ISO week containing `day` decides the ISO year.
function thursdayOf(day: string): Date {
  const d = parseDay(day);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + 3);
}

export function isoWeekKey(day: string): string {
  const th = thursdayOf(day);
  const jan1 = new Date(th.getFullYear(), 0, 1);
  const yday = Math.round((th.getTime() - jan1.getTime()) / 86_400_000);
  const week = Math.floor(yday / 7) + 1;
  return `${th.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekRange(key: string): DayRange {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(key);
  if (!m) throw new Error(`bad week key: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  // Jan 4th is always in ISO week 1.
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7;
  const monday = new Date(year, 0, 4 - dow + (week - 1) * 7);
  const from = localDayOf(monday);
  return { from, to: addDays(from, 6) };
}

export function previousWeek(day: string): WeekRange {
  const { from } = weekRange(isoWeekKey(day));
  const prevDay = addDays(from, -7);
  const key = isoWeekKey(prevDay);
  return { key, ...weekRange(key) };
}

// The period of equal length right before `r`, for "vs last period".
export function shiftRange(r: DayRange, days?: number): DayRange {
  const n = days ?? daysInRange(r);
  return { from: addDays(r.from, -n), to: addDays(r.to, -n) };
}

// Month / quarter keys for the 回顧 notes (第二十一波 R4): "2026-10", "2026-Q4".
const pad2 = (n: number) => String(n).padStart(2, "0");

export function monthKeyOf(day: string): string {
  return day.slice(0, 7);
}

export function quarterKeyOf(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

function lastDayOfMonth(y: number, m: number): string {
  return `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`;
}

export function monthRange(key: string): DayRange {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`bad month key: ${key}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return { from: `${y}-${pad2(mo)}-01`, to: lastDayOfMonth(y, mo) };
}

export function quarterRange(key: string): DayRange {
  const m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!m) throw new Error(`bad quarter key: ${key}`);
  const y = Number(m[1]);
  const first = (Number(m[2]) - 1) * 3 + 1;
  return { from: `${y}-${pad2(first)}-01`, to: lastDayOfMonth(y, first + 2) };
}
