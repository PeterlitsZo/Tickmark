import type { Entry, TimeRange } from "../api/entries";
import { TZDate } from "@date-fns/tz";
import { getCalendars } from "expo-localization";

export const deviceTimeZone = () => getCalendars()[0].timeZone ?? "UTC";
export const calendarDate = (year: number, month: number, day: number) =>
  new TZDate(year, month, day, deviceTimeZone());

export const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
export const dateOf = (timestamp: number) =>
  new TZDate(timestamp * 1000, deviceTimeZone());
export function dayKey(value: Date) {
  const date = new TZDate(value.getTime(), deviceTimeZone());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function localDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return calendarDate(year, month - 1, day);
}
export function dayRange(key: string): TimeRange {
  const date = localDay(key);
  return {
    from: seconds(date),
    to: seconds(
      calendarDate(date.getFullYear(), date.getMonth(), date.getDate() + 1),
    ),
  };
}
export function shiftDay(key: string, amount: number) {
  const date = localDay(key);
  date.setDate(date.getDate() + amount);
  return dayKey(date);
}
export const clockTime = (timestamp: number) =>
  dateOf(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
export const shortDate = (timestamp: number) =>
  dateOf(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
export function offsetLabel(timestamp: number) {
  const offset = -dateOf(timestamp).getTimezoneOffset();
  return `UTC${offset >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
}
export function duration(value: number) {
  if (value === 0) return "Time point";
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}
export function entryTime(entry: Entry) {
  const crossDay =
    dayKey(dateOf(entry.start_time)) !== dayKey(dateOf(entry.end_time));
  return crossDay
    ? `${shortDate(entry.start_time)}, ${clockTime(entry.start_time)} – ${shortDate(entry.end_time)}, ${clockTime(entry.end_time)}`
    : `${clockTime(entry.start_time)} – ${clockTime(entry.end_time)}`;
}
export function validateInput(title: string, start: number, end: number) {
  const errors: Record<string, string> = {};
  // Rust's str::trim uses Unicode White_Space, rather than JavaScript's BOM-inclusive trim.
  const trimmed = title.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
  if (!trimmed || Array.from(trimmed).length > 500)
    errors.title = "Use a title between 1 and 500 characters.";
  if (!Number.isSafeInteger(start) || start < 0)
    errors.start_time = "Choose a valid start date.";
  if (!Number.isSafeInteger(end) || end < start)
    errors.end_time = "The end must be on or after the start.";
  return { errors, title: trimmed };
}
export function hourTicks(range: TimeRange) {
  const ticks = [];
  for (let timestamp = range.from; timestamp < range.to; timestamp += 3600) {
    ticks.push({
      timestamp,
      label: clockTime(timestamp),
      offset: offsetLabel(timestamp),
    });
  }
  const counts = new Map<string, number>();
  ticks.forEach((tick) =>
    counts.set(tick.label, (counts.get(tick.label) ?? 0) + 1),
  );
  return ticks.map((tick) => ({
    ...tick,
    repeated: (counts.get(tick.label) ?? 0) > 1,
  }));
}

export function otherOccurrences(timestamp: number) {
  const date = dateOf(timestamp);
  const found: number[] = [];
  for (let delta = -10800; delta <= 10800; delta += 900) {
    if (!delta) continue;
    const other = dateOf(timestamp + delta);
    if (
      other.getFullYear() === date.getFullYear() &&
      other.getMonth() === date.getMonth() &&
      other.getDate() === date.getDate() &&
      other.getHours() === date.getHours() &&
      other.getMinutes() === date.getMinutes()
    )
      found.push(timestamp + delta);
  }
  return found;
}
