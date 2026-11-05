import { isCategoryColor } from '../../api/categories'

export const categoryTone = (color?: string) => isCategoryColor(color ?? '') ? color : 'GRAY'
export const colorLabel = (color: string) => color[0] + color.slice(1).toLowerCase()
