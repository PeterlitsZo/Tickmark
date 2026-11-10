import { ApiError, object, request } from './client'

export type TodoStatus = 'OPEN' | 'COMPLETED'
export type Todo = { id: string; title: string; description: string; status: TodoStatus; created_at: number; updated_at: number }
export type TodoPatch = { title?: string; description?: string; status?: TodoStatus }
export type TodoFilter = TodoStatus | 'ALL'
export function parseTodo(value: unknown): Todo {
  if (!object(value) || typeof value.id !== 'string' || !/^\d+$/.test(value.id) || typeof value.title !== 'string' || typeof value.description !== 'string' ||
      (value.status !== 'OPEN' && value.status !== 'COMPLETED') || !Number.isSafeInteger(value.created_at) || !Number.isSafeInteger(value.updated_at)) {
    throw new ApiError('The service returned an invalid todo. Refresh and try again.', 'PROTOCOL')
  }
  return { id: value.id, title: value.title, description: value.description, status: value.status, created_at: Number(value.created_at), updated_at: Number(value.updated_at) }
}
async function write(path: string, method: string, input: object) {
  const json = await request(path, method, input)
  try { return parseTodo(json) } catch { throw new ApiError('The response could not be read. The change may have saved; refresh before retrying.', 'PROTOCOL', {}, true) }
}
export const todosApi = {
  async list(filter: TodoFilter, signal?: AbortSignal): Promise<Todo[]> {
    return todosApi.listExpression(filter === 'ALL' ? '' : `status = '${filter}'`, signal)
  },
  async listExpression(filter: string, signal?: AbortSignal): Promise<Todo[]> {
    const bytes = new TextEncoder().encode(filter)
    if (bytes.length > 4096) throw new ApiError('Use a filter expression of 4096 UTF-8 bytes or fewer.', 'INVALID_FILTER')
    const expression = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const json = await request(`/todos${expression ? `?filter=${expression}` : ''}`, 'GET', undefined, signal)
    if (!object(json) || !Array.isArray(json.items)) throw new ApiError('The service returned an invalid list.', 'PROTOCOL')
    return json.items.map(parseTodo)
  },
  create: (title: string, description?: string) => write('/todos', 'POST', { title, ...(description === undefined ? {} : { description }) }),
  patch: (id: string, input: TodoPatch) => write(`/todos/${encodeURIComponent(id)}`, 'PATCH', input),
  async remove(id: string): Promise<void> { await request(`/todos/${encodeURIComponent(id)}`, 'DELETE') },
}
