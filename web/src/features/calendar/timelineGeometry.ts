import type { Entry, EntryInput, TimeRange } from '../../api/entries'
import { intersects } from '../../lib/time'
import { entryOrder } from '../entries/entriesQueries'
export const PIXELS_PER_MINUTE = 1.6
export const TOP_PADDING = 24
export const SNAP = 300
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export type DragMode = 'create' | 'move' | 'start' | 'end'
export function dragTimes(mode: DragMode, original: EntryInput, delta: number, range: TimeRange): EntryInput {
  if (mode === 'move') {
    const min = range.from - Math.max(range.from, original.start_time)
    const max = range.to - (original.start_time === original.end_time ? 1 : 0) - Math.min(range.to, original.end_time)
    const shift = clamp(Math.round(delta / SNAP) * SNAP, Math.ceil(min / SNAP) * SNAP, Math.floor(max / SNAP) * SNAP)
    return { ...original, start_time: original.start_time + shift, end_time: original.end_time + shift }
  }
  if (mode === 'start') return { ...original, start_time: clamp(Math.round((original.start_time + delta) / SNAP) * SNAP, range.from, Math.min(original.end_time, range.to - 1)) }
  return { ...original, end_time: clamp(Math.round((original.end_time + delta) / SNAP) * SNAP, Math.max(range.from, original.start_time), range.to) }
}
export function layoutEntries(entries: Entry[], range: TimeRange) {
  const positioned = entries.filter(e => intersects(e, range)).sort(entryOrder).map(entry => ({
    entry,
    top: (Math.max(entry.start_time, range.from) - range.from) / 60 * PIXELS_PER_MINUTE,
    height: (Math.min(entry.end_time, range.to) - Math.max(entry.start_time, range.from)) / 60 * PIXELS_PER_MINUTE,
    column: 0, columns: 1,
  }))
  let group: typeof positioned = []
  let ends: number[] = []
  let groupEnd = -1
  const finish = () => group.forEach(item => { item.columns = ends.length })
  for (const item of positioned) {
    // Columns describe actual intersecting time ranges, not label dimensions.
    // A point occupies its timestamp at the API's one-second precision.
    const start = Math.max(item.entry.start_time, range.from)
    const end = Math.max(start + 1, Math.min(item.entry.end_time, range.to))
    if (start >= groupEnd) { finish(); group = []; ends = []; groupEnd = -1 }
    let column = ends.findIndex(end => end <= start)
    if (column === -1) column = ends.length
    item.column = column
    ends[column] = end
    groupEnd = Math.max(groupEnd, ends[column])
    group.push(item)
  }
  finish()
  return positioned
}
