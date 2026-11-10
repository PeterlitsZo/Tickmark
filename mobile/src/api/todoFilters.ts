import { ApiError, object, request } from './client'
import { isSavedTodoFilter, type SavedTodoFilter, type TodoFilterInput } from '../../../shared/todoFilters'
export type { SavedTodoFilter, TodoFilterInput } from '../../../shared/todoFilters'
export function filterError(error: unknown): string {
  return error instanceof ApiError ? error.fields.filter_expr ?? error.fields.filter ?? error.fields.name ?? error.message : error instanceof Error ? error.message : 'Could not save this filter.'
}
async function write(path: string, method: string, input: Partial<TodoFilterInput>): Promise<SavedTodoFilter> {
  const json = await request(path, method, input)
  if (!isSavedTodoFilter(json)) throw new ApiError('The response could not be read. Refresh the filters before retrying.', 'PROTOCOL', {}, true)
  return json
}
export const todoFiltersApi = {
  async list(signal?: AbortSignal): Promise<SavedTodoFilter[]> {
    const json = await request('/todo-filters', 'GET', undefined, signal)
    if (!object(json) || !Array.isArray(json.items) || !json.items.every(isSavedTodoFilter)) throw new ApiError('The service returned invalid filters.', 'PROTOCOL')
    return json.items
  },
  create: (input: TodoFilterInput) => write('/todo-filters', 'POST', input),
  update: (id: string, input: Partial<TodoFilterInput>) => write(`/todo-filters/${encodeURIComponent(id)}`, 'PATCH', input),
  async remove(id: string): Promise<void> { await request(`/todo-filters/${encodeURIComponent(id)}`, 'DELETE') },
}
