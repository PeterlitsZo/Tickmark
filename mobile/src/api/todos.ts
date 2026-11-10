import { encodeFilter } from '../../../shared/todoFilters'
import { ApiError, object, request } from './client'

export type TodoStatus = 'OPEN' | 'COMPLETED'
export type Todo = { id: string; title: string; status: TodoStatus; created_at: number; updated_at: number }
export type TodoFilter = TodoStatus | 'ALL'
function parseTodo(value: unknown): Todo {
  if (!object(value) || typeof value.id !== 'string' || !/^\d+$/.test(value.id) || typeof value.title !== 'string' ||
      (value.status !== 'OPEN' && value.status !== 'COMPLETED') || !Number.isSafeInteger(value.created_at) || !Number.isSafeInteger(value.updated_at)) {
    throw new ApiError('The service returned an invalid todo. Refresh and try again.', 'PROTOCOL')
  }
  return { id: value.id, title: value.title, status: value.status, created_at: Number(value.created_at), updated_at: Number(value.updated_at) }
}
async function write(path: string, method: string, input: object) {
  const json = await request(path, method, input)
  try { return parseTodo(json) } catch { throw new ApiError('The response could not be read. The change may have saved; refresh before retrying.', 'PROTOCOL', {}, true) }
}
export const todosApi = {
  async list(filter: TodoFilter, signal?: AbortSignal): Promise<Todo[]> {
    return todosApi.listExpression(filter === 'ALL' ? '' : `status = '${filter}'`, signal)
  },
  async listExpression(expression: string, signal?: AbortSignal): Promise<Todo[]> {
    const encoded = encodeFilter(expression)
    const json = await request(`/todos${encoded ? `?filter=${encoded}` : ''}`, 'GET', undefined, signal)
    if (!object(json) || !Array.isArray(json.items)) throw new ApiError('The service returned an invalid list.', 'PROTOCOL')
    return json.items.map(parseTodo)
  },
  create: (title: string) => write('/todos', 'POST', { title }),
  patch: (id: string, input: { title?: string; status?: TodoStatus }) => write(`/todos/${encodeURIComponent(id)}`, 'PATCH', input),
  async remove(id: string): Promise<void> { await request(`/todos/${encodeURIComponent(id)}`, 'DELETE') },
}
