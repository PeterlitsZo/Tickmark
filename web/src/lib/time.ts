import { TZDate } from '@date-fns/tz'
import type { EntryInput, TimeRange } from '../api/entries'

export const getTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const pad = (v: number) => String(v).padStart(2, '0')
export const zoned = (seconds: number, zone: string) => new TZDate(seconds * 1000, zone)
export function dayKey(seconds: number, zone: string) {
  const d = zoned(seconds, zone)
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const today = (zone = getTimeZone()) => dayKey(Date.now() / 1000, zone)
export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1970-01-02' || value > '9999-12-30') return false
  const d = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
}
export function dayRange(day: string, zone: string): TimeRange {
  const [y, m, d] = day.split('-').map(Number)
  return { from: new TZDate(y, m - 1, d, zone).getTime() / 1000, to: new TZDate(y, m - 1, d + 1, zone).getTime() / 1000 }
}
export function shiftDay(day: string, amount: number) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + amount)
  const key = d.toISOString().slice(0, 10)
  return validDay(key) ? key : day
}
export function clockTime(seconds: number, zone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(seconds * 1000)
}
export function offsetLabel(seconds: number, zone: string) {
  const offset = -zoned(seconds, zone).getTimezoneOffset()
  return `UTC${offset >= 0 ? '+' : '−'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
}
export function civilValue(seconds: number, zone: string) {
  const d = zoned(seconds, zone)
  if (!Number.isFinite(d.getTime()) || d.getFullYear() > 9999) return ''
  return `${dayKey(seconds, zone)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
// Enumerate possible offsets around this local date, then round-trip every candidate.
// This detects nonexistent hours and exposes both occurrences of a repeated hour.
export function occurrences(value: string, zone: string): number[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return []
  const full = value.length === 16 ? `${value}:00` : value
  const naive = Date.parse(`${full}Z`) / 1000
  if (!Number.isFinite(naive)) return []
  const offsets = new Set<number>()
  for (let h = -36; h <= 36; h += 3) offsets.add(zoned(naive + h * 3600, zone).getTimezoneOffset())
  return [...offsets].map(offset => naive + offset * 60)
    .filter(t => t >= 0 && civilValue(t, zone) === full).sort((a, b) => a - b)
}
export function duration(seconds: number) {
  if (seconds === 0) return 'Time point'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}h` : ''}${minutes % 60 ? ` ${minutes % 60}m` : ''}`.trim()
}
export function entryTime(entry: EntryInput, zone: string) {
  const startDay = dayKey(entry.start_time, zone)
  const endDay = dayKey(entry.end_time, zone)
  return startDay === endDay ? `${clockTime(entry.start_time, zone)} – ${clockTime(entry.end_time, zone)}`
    : `${startDay} ${clockTime(entry.start_time, zone)} – ${endDay} ${clockTime(entry.end_time, zone)}`
}
export const trimTitle = (title: string) => title.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '')
export function validateInput(input: EntryInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!trimTitle(input.title) || Array.from(trimTitle(input.title)).length > 500) errors.title = 'Use a title between 1 and 500 characters.'
  if (!Number.isSafeInteger(input.start_time) || input.start_time < 0) errors.start_time = 'Choose a valid start time.'
  if (!Number.isSafeInteger(input.end_time) || input.end_time < 0) errors.end_time = 'Choose a valid end time.'
  else if (input.end_time < input.start_time) errors.end_time = 'End must be on or after start.'
  return errors
}
export function intersects(entry: EntryInput, range: TimeRange) {
  return entry.start_time === entry.end_time ? entry.start_time >= range.from && entry.start_time < range.to
    : entry.start_time < range.to && entry.end_time > range.from
}
