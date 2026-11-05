import { useQuery } from '@tanstack/react-query'
import { categoriesOptions } from './categoriesQueries'
import { categoryTone } from './categoryStyles'

export function CategoryField({ value, onChange, onManage, error, disabled, online, allowDefault }: {
  value: string; onChange: (value: string) => void; onManage: () => void; error?: string; disabled: boolean; online: boolean; allowDefault: boolean
}) {
  const query = useQuery(categoriesOptions())
  const items = query.data ?? []
  const selected = items.find(item => item.id === value)
  const missing = !!value && !!query.data && !selected
  const message = error || (missing ? 'This category is no longer available. Choose another category.' : undefined)
  return <div className="field category-field">
    <div className="category-field-heading"><label htmlFor="entry-category_id">Category</label><button type="button" className="text-button" onClick={onManage} disabled={disabled}>Manage categories</button></div>
    <div className="category-select" data-category-color={categoryTone(selected?.color)}>
      <span className="category-dot" aria-hidden="true" />
      <select id="entry-category_id" value={value} onChange={event => onChange(event.target.value)} disabled={disabled || !query.data || query.isError || (!items.length && !value)} aria-invalid={!!message} aria-describedby="entry-category-help">
        {!value && <option value="">{query.isPending ? 'Loading categories…' : !items.length && allowDefault ? 'Default (created on save)' : 'Choose a category'}</option>}
        {missing && <option value={value}>Unavailable category</option>}
        {value && !query.data && <option value={value}>{query.isPending ? 'Loading categories…' : 'Category unavailable'}</option>}
        {items.map(item => <option key={item.id} value={item.id}>{item.name}{items.some(other => other.id !== item.id && other.name === item.name) ? ` · #${item.id}` : ''}</option>)}
      </select>
    </div>
    <div id="entry-category-help">
      {message && <p className="field-error" role="alert">{message}</p>}
      {query.isError ? <div className="field-error" role="alert">Could not load categories. Your draft is kept. <button type="button" className="text-button" disabled={!online || query.isFetching} onClick={() => void query.refetch()}>Try again</button></div>
        : query.data && !items.length && allowDefault && !value ? <p className="category-help">Default will be created when you save.</p> : null}
    </div>
  </div>
}
