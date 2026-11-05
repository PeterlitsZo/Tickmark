import { ApiError, object, request } from './client'

export const categoryColors = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE', 'PINK', 'GRAY'] as const
export type CategoryColor = typeof categoryColors[number]
// Preserve future enum values on reads; only the known palette is offered for writes.
export type Category = { id: string; name: string; color: string }
export type CategoryInput = { name: string; color: CategoryColor }
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d*$/.test(value) && (value.length < 19 || (value.length === 19 && value <= '9223372036854775807'))
export const isCategoryColor = (value: string): value is CategoryColor => categoryColors.some(color => color === value)

function parseCategory(value: unknown): Category {
  if (!object(value) || !validId(value.id) || typeof value.name !== 'string' || typeof value.color !== 'string') {
    throw new ApiError('The service returned an invalid category. Refresh and try again.', 'PROTOCOL')
  }
  return { id: value.id, name: value.name, color: value.color }
}
async function write(path: string, method: string, input: Partial<CategoryInput>) {
  const json = await request(path, method, input)
  try { return parseCategory(json) } catch { throw new ApiError('The category may have saved, but its response could not be read. Refresh before retrying.', 'PROTOCOL', {}, true) }
}
export const categoriesApi = {
  async list(signal?: AbortSignal): Promise<Category[]> {
    const json = await request('/categories', 'GET', undefined, signal)
    if (!object(json) || !Array.isArray(json.items)) throw new ApiError('The service returned an invalid category list.', 'PROTOCOL')
    return json.items.map(parseCategory)
  },
  create: (input: CategoryInput) => write('/categories', 'POST', input),
  update: (id: string, input: Partial<CategoryInput>) => write(`/categories/${encodeURIComponent(id)}`, 'PATCH', input),
  remove: (id: string) => request(`/categories/${encodeURIComponent(id)}`, 'DELETE'),
}
