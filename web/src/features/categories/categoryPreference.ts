import type { Category } from '../../api/categories'

const storageKey = 'tickmark.last-created-entry-category'

export function preferredCategoryId(categories: Category[]): string | undefined {
  try {
    const remembered = localStorage.getItem(storageKey)
    if (categories.some(category => category.id === remembered)) return remembered!
  } catch {
    // Storage may be unavailable; category selection must still work.
  }
  return categories[0]?.id
}

export function rememberCreatedCategory(id: string) {
  try {
    localStorage.setItem(storageKey, id)
  } catch {
    // A browser preference must never turn a successful save into an error.
  }
}
