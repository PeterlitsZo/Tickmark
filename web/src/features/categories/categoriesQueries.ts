import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { categoriesApi, type Category } from '../../api/categories'

export const categoriesKey = ['categories'] as const
export const categoryOrder = (a: Category, b: Category) => a.id.length - b.id.length || a.id.localeCompare(b.id)
export const categoriesOptions = () => queryOptions({
  queryKey: categoriesKey,
  queryFn: ({ signal }) => categoriesApi.list(signal),
  staleTime: 15000,
  retry: false,
  networkMode: 'always',
})
export async function commitCategory(client: QueryClient, category?: Category, removedId?: string) {
  await client.cancelQueries({ queryKey: categoriesKey })
  client.setQueryData<Category[]>(categoriesKey, previous => {
    if (!previous) return previous
    const next = previous.filter(item => item.id !== (category?.id ?? removedId))
    if (category) next.push(category)
    return next.sort(categoryOrder)
  })
  void client.invalidateQueries({ queryKey: categoriesKey })
}
