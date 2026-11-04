import { TZDate } from "@date-fns/tz";
import { clockTime, dateOf, deviceTimeZone, seconds } from "./time";

// The picker edits wall-clock fields in UTC. Only this adapter assigns an IANA
// zone, so the UI library cannot silently normalize a nonexistent DST hour.
export function pickerValue(timestamp: number) {
  const local = dateOf(timestamp);
  return Date.UTC(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    local.getHours(),
    local.getMinutes(),
    local.getSeconds(),
  );
}

export function applyPickerValue(
  current: number,
  milliseconds: number,
  mode: "date" | "time",
) {
  const chosen = new Date(milliseconds);
  const previous = dateOf(current);
  const year =
    mode === "date" ? chosen.getUTCFullYear() : previous.getFullYear();
  const month = mode === "date" ? chosen.getUTCMonth() : previous.getMonth();
  const day = mode === "date" ? chosen.getUTCDate() : previous.getDate();
  const hour = mode === "time" ? chosen.getUTCHours() : previous.getHours();
  const minute =
    mode === "time" ? chosen.getUTCMinutes() : previous.getMinutes();
  const second = mode === "time" ? 0 : previous.getSeconds();
  const next = new TZDate(
    year,
    month,
    day,
    hour,
    minute,
    second,
    deviceTimeZone(),
  );
  const timestamp = seconds(next);
  const normalized =
    next.getFullYear() !== year ||
    next.getMonth() !== month ||
    next.getDate() !== day ||
    next.getHours() !== hour ||
    next.getMinutes() !== minute;
  return {
    timestamp,
    warning: normalized
      ? `This time does not exist in ${deviceTimeZone()}. Adjusted to ${clockTime(timestamp)}; confirm or choose another time.`
      : "",
  };
}
