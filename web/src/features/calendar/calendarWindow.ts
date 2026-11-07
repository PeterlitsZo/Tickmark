import { shiftDay } from '../../lib/time'

export const FIRST_DAY = '1970-01-02'
export const LAST_DAY = '9999-12-30'
export const BUFFER_DAYS = 4
export const DAY_HEADER_HEIGHT = 40
export const TIME_GUTTER_WIDTH = 64

// UTC ordinals are only used for civil date arithmetic, never event timestamps.
export const dayNumber = (day: string) => Date.parse(`${day}T12:00:00Z`) / 86400000
export const dayDistance = (from: string, to: string) => dayNumber(to) - dayNumber(from)
export const limitFirstDay = (day: string, count: number) =>
  day < FIRST_DAY ? FIRST_DAY : day > shiftDay(LAST_DAY, 1 - count) ? shiftDay(LAST_DAY, 1 - count) : day

export function windowStart(day: string, count: number) {
  const before = Math.min(BUFFER_DAYS, dayDistance(FIRST_DAY, day))
  return limitFirstDay(shiftDay(day, -before), count + 2 * BUFFER_DAYS)
}

export function dateHeading(first: string, last: string) {
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return formatter.formatRange(new Date(`${first}T12:00:00Z`), new Date(`${last}T12:00:00Z`))
}
