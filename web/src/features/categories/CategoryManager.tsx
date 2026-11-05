import { useEffect, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import { trimTitle as trimName } from '../../lib/time'
import { categoriesApi, categoryColors, isCategoryColor, type Category, type CategoryInput } from '../../api/categories'
import { categoriesOptions, commitCategory } from './categoriesQueries'
import { categoryTone, colorLabel } from './categoryStyles'
import './categories.css'

type Draft = { original?: Category; name: string; color: string }
type Operation = { kind: 'create' | 'update' | 'delete'; id?: string; input?: Partial<CategoryInput> }

export function CategoryManager({ open, onClose, onCreated, online }: {
  open: boolean; onClose: () => void; onCreated?: (category: Category) => void; online: boolean
}) {
  const query = useQuery(categoriesOptions())
  const client = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const lock = useRef(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<{ id?: string; message: string; field?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState<Operation | null>(null)
  const [notice, setNotice] = useState('')
  const dirty = !!draft && (draft.original ? draft.name !== draft.original.name || draft.color !== draft.original.color : draft.name.length > 0 || draft.color !== 'GRAY')
  const locked = busy || !!uncertain || !online

  useBlocker({
    shouldBlockFn: () => (dirty || busy || !!uncertain) && !window.confirm('Leave the calendar? Unsaved categories and pending save information will be lost.'),
    enableBeforeUnload: dirty || busy || !!uncertain,
  })
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      element.showModal()
    } else if (!open && element.open) {
      element.close()
      previousFocus.current?.focus({ preventScroll: true })
    }
  }, [open])
  const draftKey = draft ? draft.original?.id ?? 'new' : null
  useEffect(() => {
    if (draftKey && !locked) input.current?.focus()
  }, [draftKey, locked])

  function discard() {
    if (busy || uncertain) return false
    if (dirty && !window.confirm('Discard your unsaved category changes?')) return false
    setDraft(null)
    return true
  }
  function close() {
    if (busy) return
    // Keep uncertain operation state mounted, so reopening can check it.
    if (!uncertain && !discard()) return
    setDeleting(null)
    onClose()
  }
  function edit(category?: Category) {
    if (!discard()) return
    setDraft({ original: category, name: category?.name ?? '', color: category?.color ?? 'GRAY' })
    setError(null); setNotice(''); setDeleting(null)
  }
  async function perform(op: Operation) {
    if (lock.current || !online) return
    lock.current = true; setBusy(true); setError(null); setNotice('')
    try {
      if (op.kind === 'delete') {
        try { await categoriesApi.remove(op.id!) } catch (cause) {
          if (!(cause instanceof ApiError) || cause.reason !== 'CATEGORY_NOT_FOUND') throw cause
        }
        await commitCategory(client, undefined, op.id)
        setDeleting(null)
        if (draft?.original?.id === op.id) setDraft(null)
      } else {
        const saved = op.kind === 'create' ? await categoriesApi.create(op.input as CategoryInput) : await categoriesApi.update(op.id!, op.input!)
        await commitCategory(client, saved)
        setDraft(null)
        if (op.kind === 'create') onCreated?.(saved)
      }
      setUncertain(null)
      setNotice(op.kind === 'delete' ? 'Category deleted.' : 'Category saved.')
    } catch (cause) {
      const api = cause instanceof ApiError ? cause : null
      setError({ id: op.id, message: api ? Object.values(api.fields).join(' ') || api.message : 'Could not save this category.', field: api?.fields.name ? 'name' : undefined })
      if (api?.uncertain) { setUncertain(op); void query.refetch() }
      if (api?.reason === 'CATEGORY_NOT_FOUND') void query.refetch()
    } finally { lock.current = false; setBusy(false) }
  }
  function save() {
    if (!draft || locked) return
    const name = trimName(draft.name)
    if ([...name].length < 1 || [...name].length > 100) {
      setError({ id: draft.original?.id, message: 'Use 1–100 characters after trimming.', field: 'name' })
      input.current?.focus(); return
    }
    const changes: Partial<CategoryInput> = {}
    if (!draft.original || name !== draft.original.name) changes.name = name
    if (!draft.original || draft.color !== draft.original.color) {
      if (!isCategoryColor(draft.color)) return
      changes.color = draft.color
    }
    if (!Object.keys(changes).length) { setDraft(null); return }
    void perform({ kind: draft.original ? 'update' : 'create', id: draft.original?.id, input: changes })
  }
  async function check() {
    if (lock.current || !online) return
    lock.current = true; setBusy(true)
    try {
      const result = await query.refetch()
      if (result.error || !result.data) { setNotice('Could not refresh categories. Your draft and pending operation are kept.'); return }
      if (!uncertain) { setNotice('Categories refreshed.'); return }
      const found = result.data.find(item => item.id === uncertain.id)
      if (uncertain.kind === 'delete' && !found) {
        setUncertain(null); setDeleting(null); setError(null); setNotice('Deletion confirmed.'); return
      }
      if (uncertain.kind === 'update' && found && Object.entries(uncertain.input!).every(([key, value]) => found[key as keyof Category] === value)) {
        setUncertain(null); setDraft(null); setError(null); setNotice('Changes confirmed.'); return
      }
      setNotice(uncertain.kind === 'create'
        ? 'Check the list below. A same-name category does not prove this request succeeded. You can use an existing category, or explicitly retry with a risk of duplicates.'
        : 'The change is not confirmed. Another client may have edited this category. Check again before retrying.')
    } finally { lock.current = false; setBusy(false) }
  }
  function retry() {
    if (!uncertain || busy || !online) return
    if (!window.confirm(uncertain.kind === 'create' ? 'The original request may still finish. Retrying can create another category. Retry anyway?' : 'Retry this change? It may overwrite a change made on another device.')) return
    void perform(uncertain)
  }
  const items = query.data ?? []
  const rowLabel = (category: Category) => `${category.name}${items.some(other => other.id !== category.id && other.name === category.name) ? ` #${category.id}` : ''}`
  // Retain an editor whose row was deleted elsewhere, rather than losing its draft.
  const detached = !!draft?.original && !items.some(item => item.id === draft.original!.id)
  return <dialog ref={dialog} className="category-dialog" aria-labelledby="categories-heading" aria-describedby="categories-description" onCancel={event => { event.preventDefault(); close() }}>
    <header className="category-dialog-header"><div><h2 id="categories-heading">Manage categories</h2><p id="categories-description">Organize your time entries.</p></div><button className="icon-button" aria-label="Close categories" disabled={busy} onClick={close}><X size={18} /></button></header>
    <div className="category-dialog-body">
      <div className="category-feedback" aria-live="polite">
        {!online && <p>Offline. Reconnect to save; your draft stays here.</p>}
        {busy ? <p>Saving or checking…</p> : notice && <p>{notice}</p>}
        {query.isPending && <p>Loading categories…</p>}
        {query.isError && <p className="field-error">Could not load categories. <button className="text-button" disabled={!online || busy || query.isFetching} onClick={() => void check()}>Try again</button></p>}
        {uncertain && <div className="category-warning" role="status"><strong>Change not yet confirmed</strong><p>Do not submit another change until you have checked the list.</p><div className="row"><button className="secondary" disabled={busy || !online} onClick={() => void check()}>Check status</button><button className="text-button" disabled={busy || !online} onClick={retry}>Retry explicitly…</button><button className="text-button" disabled={busy || !online || query.isError || !query.data} onClick={() => {
          if (window.confirm('Stop tracking this request? It may still finish. Check the list and use an existing category if appropriate.')) { setUncertain(null); setDraft(null); setError(null); setDeleting(null); setNotice('Request tracking stopped. The original request may still finish.') }
        }}>Use the current list…</button></div></div>}
      </div>
      {query.data && !items.length && !draft && <div className="category-empty"><p>No categories yet.</p><p>Add your own, or save a time entry to create Default.</p></div>}
      <ul className="category-list" aria-label="Categories">
        {items.map(category => <li key={category.id} className="category-item" data-editing={draft?.original?.id === category.id} data-category-color={categoryTone(category.color)}>
          <div className="category-item-heading"><span className="category-dot" aria-hidden="true" /><span className="category-name" title={category.name}>{category.name}{items.some(other => other.id !== category.id && other.name === category.name) && <small> #{category.id}</small>}</span><div className="row">
            <button className="icon-button" aria-label={`Edit category ${rowLabel(category)}`} disabled={locked} onClick={() => edit(category)}>{draft?.original?.id === category.id ? <ChevronDown size={16} /> : <Pencil size={16} />}</button>
            <button className="icon-button category-delete" aria-label={`Delete category ${rowLabel(category)}`} disabled={locked} onClick={() => { if (discard()) { setDeleting(category.id); setError(null) } }}><Trash2 size={16} /></button>
          </div></div>
          {error?.id === category.id && <p className="category-error" role="alert" id="category-form-error">{error.message}</p>}
          {deleting === category.id && <div className="category-delete-confirm"><p>Delete “{category.name}”? This cannot be undone. Categories used by time entries cannot be deleted.</p><div className="row"><button className="danger-button" disabled={locked} onClick={() => void perform({ kind: 'delete', id: category.id })}>Delete category</button><button className="secondary" disabled={busy} onClick={() => setDeleting(null)}>Keep category</button></div></div>}
          {draft?.original?.id === category.id && renderForm()}
        </li>)}
      </ul>
      {draft && (!draft.original || detached) && <div className="category-new"><h3>{detached ? 'Category no longer available' : 'New category'}</h3>{error && <p className="category-error" role="alert" id="category-form-error">{error.message}</p>}{renderForm()}</div>}
    </div>
    <footer className="category-dialog-footer"><button className="secondary" disabled={locked || query.isPending || query.isError} onClick={() => edit()}><Plus size={16} />Add category</button><div className="row"><button className={`icon-button ${query.isFetching ? 'refreshing' : ''}`} aria-label="Refresh categories" disabled={busy || !online || query.isFetching} onClick={() => void check()}><RefreshCw size={16} /></button><button className="primary" disabled={busy} onClick={close}>Done</button></div></footer>
  </dialog>

  function renderForm() {
    if (!draft) return null
    return <form className="category-edit-form" noValidate onSubmit={event => { event.preventDefault(); save() }}>
      <fieldset disabled={locked}>
        <div className="field"><label htmlFor="category-name">Name</label><input ref={input} id="category-name" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.repeat)) event.preventDefault() }} aria-invalid={error?.field === 'name'} aria-describedby={error ? 'category-form-error' : undefined} /><span className="field-meta">{[...trimName(draft.name)].length} / 100</span></div>
        <fieldset className="category-colors"><legend>Color</legend><div className="category-color-grid">
          {!isCategoryColor(draft.color) && <p className="category-help">Unknown color. It will be preserved unless you choose another.</p>}
          {categoryColors.map(color => <label key={color} className="category-color-option" data-category-color={color}>
            <input type="radio" name="category-color" value={color} checked={draft.color === color} onChange={() => setDraft({ ...draft, color })} /><span className="category-dot" aria-hidden="true" /><span>{colorLabel(color)}</span>{draft.color === color && <Check size={14} aria-hidden="true" />}
          </label>)}
        </div></fieldset>
      </fieldset>
      <div className="category-edit-actions"><button type="button" className="secondary" disabled={busy || !!uncertain} onClick={discard}>Cancel</button><button className="primary" disabled={locked || detached}>{busy ? 'Saving…' : draft.original ? 'Save changes' : 'Add category'}</button></div>
    </form>
  }
}
