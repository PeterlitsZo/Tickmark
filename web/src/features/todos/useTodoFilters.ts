import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { todoFiltersApi } from '../../api/todoFilters'
export const todoFiltersKey = ['todo-filters'] as const
const preference = 'tickmark.selected-todo-filter.v1'
export function useTodoFilters(online: boolean) {
  const [remembered, setRemembered] = useState(() => { try { return localStorage.getItem(preference) ?? '' } catch { return '' } })
  const query = useQuery({ queryKey: todoFiltersKey, queryFn: ({ signal }) => todoFiltersApi.list(signal), enabled: online, retry: false, staleTime: 0, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always' })
  const selected = query.data?.find(filter => filter.id === remembered)
  const selectedId = query.data ? selected?.id ?? '' : remembered
  useEffect(() => { try { localStorage.setItem(preference, selectedId) } catch { /* Selection persistence is optional. */ } }, [selectedId])
  return { query, selected, selectedId, select: setRemembered }
}
