import { queryOptions } from '@tanstack/react-query';
import { categoriesApi } from '../../api/categories';
import { API_ORIGIN } from '../../api/client';

export const categoriesKey = ['categories', API_ORIGIN] as const;
export const categoriesOptions = () => queryOptions({
  queryKey: categoriesKey,
  queryFn: ({ signal }) => categoriesApi.list(signal),
  staleTime: 15000,
  retry: false,
});
export const categoryPalette: Record<string, { ink: string; fill: string }> = {
  RED: { ink: '#9C3933', fill: '#FAE8E5' },
  ORANGE: { ink: '#925022', fill: '#F8EBDD' },
  YELLOW: { ink: '#78620E', fill: '#F5F0D6' },
  GREEN: { ink: '#425D48', fill: '#E7EDE3' },
  BLUE: { ink: '#365B87', fill: '#E7EEF7' },
  PURPLE: { ink: '#715098', fill: '#EFE8F7' },
  PINK: { ink: '#934869', fill: '#F8E8EF' },
  GRAY: { ink: '#646963', fill: '#F1F2ED' },
};
export const categoryStyle = (color?: string) => categoryPalette[color ?? 'GRAY'] ?? categoryPalette.GRAY;
