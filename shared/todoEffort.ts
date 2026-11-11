export type TodoEffort = {
  expected_daily_minutes?: number | null
  today_spent_minutes?: number
  total_spent_minutes?: number
  today?: string
  time_zone?: string
}
export type EffortPatch = { expected_daily_minutes?: number | null; daily_effort?: { date: string; minutes: number } }
export const validMinutes = (text: string, optional = false) => optional && text === '' || /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) >= (optional ? 1 : 0) && Number(text) <= 1440
export const formatMinutes = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
export function dateInZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-')
}
export function parseEffort(value: Record<string, unknown>): TodoEffort {
  const keys = ['expected_daily_minutes', 'today_spent_minutes', 'total_spent_minutes', 'today', 'time_zone']
  // An older server can still provide ordinary todo editing. Never invent zeroes.
  if (keys.every(key => value[key] === undefined)) return {}
  const { expected_daily_minutes: expected, today_spent_minutes: spent, total_spent_minutes: total, today, time_zone: zone } = value
  if (!(expected === null || Number.isSafeInteger(expected) && Number(expected) >= 1 && Number(expected) <= 1440)
    || !Number.isSafeInteger(spent) || Number(spent) < 0 || Number(spent) > 1440
    || !Number.isSafeInteger(total) || Number(total) < Number(spent)
    || typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today) || typeof zone !== 'string') throw new Error('Invalid todo time data.')
  dateInZone(zone) // Validate the server's zone before using it for day rollover.
  return { expected_daily_minutes: expected === null ? null : Number(expected), today_spent_minutes: Number(spent), total_spent_minutes: Number(total), today, time_zone: zone }
}
export function effortSummary(todo: TodoEffort) {
  if (todo.today_spent_minutes === undefined || todo.total_spent_minutes === undefined || todo.expected_daily_minutes == null && todo.total_spent_minutes === 0) return ''
  const label = todo.time_zone && todo.today !== dateInZone(todo.time_zone) ? todo.today : 'Today'
  return `${label} ${todo.today_spent_minutes}${todo.expected_daily_minutes == null ? '' : ` / ${todo.expected_daily_minutes}`} min · Total ${formatMinutes(todo.total_spent_minutes)}`
}
