import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN } from '../../api/client';
import type { Category } from '../../api/categories';
const key = `tickmark.last-created-entry-category:${API_ORIGIN}`;
let remembered: string | null = null;
let revision = 0;
export async function loadCategoryPreference() {
  const before = revision;
  try {
    const stored = await AsyncStorage.getItem(key);
    if (revision === before) remembered = stored;
  } catch { /* A preference must never prevent recording time. */ }
}
export function preferredCategoryId(categories: Category[]) {
  if (categories.some(category => category.id === remembered)) return remembered!;
  return [...categories].sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id))[0]?.id;
}
export async function rememberCreatedCategory(id: string) {
  remembered = id;
  revision++;
  try { await AsyncStorage.setItem(key, id); } catch { /* Keep the in-session preference. */ }
}
