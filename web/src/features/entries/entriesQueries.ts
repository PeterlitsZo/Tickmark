import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { entriesApi, ApiError, type Entry, type EntryList, type EntryInput, type TimeRange } from '../../api/entries'
import { intersects } from '../../lib/time'
export const entriesKey = ['entries'] as const
export const sameInput = (a: EntryInput, b: EntryInput) => a.title === b.title && a.start_time === b.start_time && a.end_time === b.end_time && a.category_id === b.category_id
export const entryOrder = (a: Entry, b: Entry) => a.start_time - b.start_time || a.id.length - b.id.length || a.id.localeCompare(b.id)
export const rangeOptions = (range: TimeRange) => queryOptions({
  queryKey: [...entriesKey, range.from, range.to],
  queryFn: ({ signal }) => entriesApi.list(range, signal),
  staleTime: 15000, gcTime: 600000,
  retry: (count, error) => count < 1 && error instanceof ApiError && (error.reason === 'NETWORK' || error.status >= 500),
})
// Adapted from mobile's cache commit: moves can leave any previously cached range.
export async function commitEntry(client: QueryClient, entry: Entry | null, removedId?: string) {
  await client.cancelQueries({ queryKey: entriesKey })
  for (const [key, data] of client.getQueriesData<EntryList>({ queryKey: entriesKey })) {
    if (!data) continue
    const items = data.items.filter(item => item.id !== (entry?.id ?? removedId))
    if (entry && intersects(entry, { from: Number(key[1]), to: Number(key[2]) })) items.push(entry)
    client.setQueryData(key, { items: items.sort(entryOrder) })
  }
  void client.invalidateQueries({ queryKey: entriesKey })
}
export async function readReplacement(original: Entry, target: EntryInput) {
  const results = await Promise.all([original, target].map(entry => entriesApi.list({ from: entry.start_time, to: Math.max(entry.start_time + 1, entry.end_time) })))
  const found = results.flatMap(r => r.items).filter(e => e.id === original.id)
  return found.length && found.every(e => sameInput(e, target)) ? found[0] : null
}
