import { validId } from './categories'
import { ApiError, object, request } from './client'
export { ApiError } from './client'

export type EntryInput = { title: string; description?: string; start_time: number; end_time: number; category_id?: string }
export type Entry = EntryInput & { id: string; category_id: string; description: string }
export type TimeRange = { from: number; to: number }
export type EntryList = { items: Entry[] }

function parseEntry(value: unknown): Entry {
  if (!object(value) || !validId(value.id) || !validId(value.category_id) || typeof value.title !== 'string' || typeof value.description !== 'string' ||
      !Number.isSafeInteger(value.start_time) || !Number.isSafeInteger(value.end_time) ||
      Number(value.start_time) < 0 || Number(value.end_time) < Number(value.start_time)) {
    throw new ApiError('The service returned an invalid entry. Refresh and try again.', 'PROTOCOL')
  }
  return { id: value.id, category_id: value.category_id, title: value.title, description: value.description, start_time: Number(value.start_time), end_time: Number(value.end_time) }
}

async function write(path: string, method: string, input: EntryInput) {
  const json = await request(path, method, { title: input.title, description: input.description, start_time: input.start_time, end_time: input.end_time, category_id: input.category_id })
  try { return parseEntry(json) } catch { throw new ApiError('The response could not be read. The change may have saved; check its status.', 'PROTOCOL', {}, true) }
}
export const entriesApi = {
  async list(range: TimeRange, signal?: AbortSignal): Promise<EntryList> {
    const json = await request(`/entries?from=${range.from}&to=${range.to}`, 'GET', undefined, signal)
    if (!object(json) || !Array.isArray(json.items)) throw new ApiError('The service returned an invalid list.', 'PROTOCOL')
    return { items: json.items.map(parseEntry) }
  },
  create: (input: EntryInput) => write('/entries', 'POST', input),
  replace: (id: string, input: EntryInput) => write(`/entries/${encodeURIComponent(id)}`, 'PUT', input),
  remove: (id: string) => request(`/entries/${encodeURIComponent(id)}`, 'DELETE'),
}
