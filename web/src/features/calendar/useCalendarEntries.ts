import { useQueries } from '@tanstack/react-query'
import { dayRange, intersects } from '../../lib/time'
import { entryOrder, rangeOptions } from '../entries/entriesQueries'
import type { Operation } from '../entries/useEntryMutations'
import type { Entry } from '../../api/entries'

export function useCalendarEntries(days: string[], zone: string, pending: Record<string, Operation>) {
  // A local day is a stable query block. Retained columns keep their own data
  // while newly exposed columns load; overlapping cross-midnight IDs merge once.
  const ranges = days.map(day => dayRange(day, zone))
  const queries = useQueries({ queries: ranges.map(rangeOptions) })
  const entries = new Map<string, Entry>()
  for (const query of queries) for (const entry of query.data?.items ?? []) entries.set(entry.id, entry)
  const range = { from: ranges[0].from, to: ranges[ranges.length - 1].to }
  for (const op of Object.values(pending)) {
    if (op.kind !== 'replace' || !op.original || !op.input) continue
    entries.delete(op.original.id)
    if (intersects(op.input, range)) entries.set(op.original.id, {
      ...op.original, ...op.input,
      description: op.input.description ?? op.original.description,
      category_id: op.input.category_id ?? op.original.category_id,
    })
  }
  return {
    entries: [...entries.values()].sort(entryOrder),
    columns: days.map((day, i) => ({ day, range: ranges[i], query: queries[i] })),
    isFetching: queries.some(query => query.isFetching),
    refetch: () => Promise.all(queries.map(query => query.refetch())),
  }
}
