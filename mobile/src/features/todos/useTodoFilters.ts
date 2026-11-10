import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { API_ORIGIN } from '../../api/client';
import { todoFiltersApi } from '../../api/todoFilters';
export const todoFiltersKey = ['todo-filters', API_ORIGIN] as const;
const preference = `tickmark.selected-todo-filter.v1.${API_ORIGIN}`;
export function useTodoFilters(online: boolean) {
  const [remembered, setRemembered] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(preference).then(id => { if (live) { setRemembered(id ?? ''); setReady(true); } }, () => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  const query = useQuery({ queryKey: todoFiltersKey, queryFn: ({ signal }) => todoFiltersApi.list(signal), enabled: online, retry: false, staleTime: 0, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always' });
  const selected = query.data?.find(item => item.id === remembered);
  const selectedId = query.data ? selected?.id ?? '' : remembered;
  useEffect(() => { if (ready) void AsyncStorage.setItem(preference, selectedId).catch(() => {}); }, [selectedId, ready]);
  return { query, selected, selectedId, select: setRemembered, ready };
}
