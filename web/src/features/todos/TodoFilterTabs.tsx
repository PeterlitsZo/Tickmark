import { lazy, Suspense, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, Pencil, Plus } from 'lucide-react'
import { ApiError } from '../../api/client'
import { todoFiltersApi, filterError, type SavedTodoFilter, type TodoFilterInput } from '../../api/todoFilters'
import { filterInputError } from '../../../../shared/todoFilters'
import { todoFiltersKey } from './useTodoFilters'
import { TodoFilterHelp } from './TodoFilterHelp'
import type { ExpressionEditorHandle } from './FilterExpressionEditor'
const FilterExpressionEditor = lazy(() => import('./FilterExpressionEditor').then(module => ({ default: module.FilterExpressionEditor })))
import styles from './TodoPanel.module.css'

export function TodoFilterTabs({ filters, selected, online, onSelect }: {
  filters: SavedTodoFilter[]; selected: string; online: boolean; onSelect: (id: string) => void
}) {
  const client = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const helpButton = useRef<HTMLButtonElement>(null)
  const expressionInput = useRef<ExpressionEditorHandle>(null)
  const selection = useRef({ start: 0, end: 0 })
  const submitting = useRef(false)
  const [id, setId] = useState('')
  const [draft, setDraft] = useState<TodoFilterInput>({ name: '', filter_expr: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [help, setHelp] = useState(false)
  const [editorSession, setEditorSession] = useState(0)
  function open(button: HTMLButtonElement, filter?: SavedTodoFilter) {
    trigger.current = button
    setEditorSession(previous => previous + 1)
    setId(filter?.id ?? '')
    setDraft(filter ? { name: filter.name, filter_expr: filter.filter_expr } : { name: '', filter_expr: "status = 'OPEN'" })
    setError(''); setUncertain(false); setHelp(false)
    dialog.current?.showModal()
  }
  async function commit(saved?: SavedTodoFilter) {
    await client.cancelQueries({ queryKey: todoFiltersKey })
    client.setQueryData<SavedTodoFilter[]>(todoFiltersKey, old => {
      const next = (old ?? []).filter(item => item.id !== (saved?.id ?? id))
      if (saved) next.push(saved)
      return next.sort((a, b) => a.position - b.position || a.id.length - b.id.length || a.id.localeCompare(b.id))
    })
    void client.invalidateQueries({ queryKey: todoFiltersKey })
    onSelect(saved?.id ?? '')
    dialog.current?.close()
  }
  async function submit(remove = false) {
    if (submitting.current || uncertain || !online) return
    const invalid = remove ? '' : filterInputError(draft)
    if (invalid) { setError(invalid); return }
    if (remove && !window.confirm('Delete this filter? Your todos will not be deleted.')) return
    submitting.current = true; setBusy(true); setError('')
    try {
      if (remove) { await todoFiltersApi.remove(id); await commit() }
      else await commit(await (id ? todoFiltersApi.update(id, draft) : todoFiltersApi.create(draft)))
    } catch (cause) {
      setError(filterError(cause)); setUncertain(!(cause instanceof ApiError) || cause.uncertain)
      if (cause instanceof ApiError && cause.reason === 'TODO_FILTER_NOT_FOUND') void client.invalidateQueries({ queryKey: todoFiltersKey })
    } finally { submitting.current = false; setBusy(false) }
  }
  async function check() {
    if (submitting.current || !online) return
    submitting.current = true; setBusy(true)
    try {
      const latest = await todoFiltersApi.list()
      client.setQueryData(todoFiltersKey, latest)
      const names = latest.map(item => item.name).join(', ') || '(none)'
      if (window.confirm(`Current filters: ${names}\nCheck for your change before retrying. A delayed request may still complete. Allow another attempt?`)) { setUncertain(false); setError('') }
    } catch (cause) { setError(filterError(cause)) }
    finally { submitting.current = false; setBusy(false) }
  }
  function closeHelp(focusExpression = false) {
    setHelp(false)
    requestAnimationFrame(() => {
      if (focusExpression) expressionInput.current?.focus()
      else helpButton.current?.focus()
      expressionInput.current?.setSelectionRange(selection.current.start, selection.current.end)
    })
  }
  function openHelp() {
    selection.current = expressionInput.current?.getSelection() ?? { start: 0, end: 0 }
    setHelp(true)
  }
  return <>
    <div className={styles.filterBar}>
      <div className={styles.filterTabs} role="tablist" aria-label="Todo filters" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        event.preventDefault(); tabs[next].focus(); tabs[next].click()
      }}>
        {[{ id: '', name: 'All', filter_expr: '' }, ...filters].map(filter => <button key={filter.id} id={`todo-filter-${filter.id || 'all'}`} role="tab" aria-selected={selected === filter.id} aria-controls="todo-filter-results" tabIndex={selected === filter.id ? 0 : -1} title={filter.filter_expr || 'All todos'} onClick={() => onSelect(filter.id)}>{filter.name}</button>)}
      </div>
      {filters.some(filter => filter.id === selected) && <button className="icon-button" aria-label="Edit filter" onClick={event => open(event.currentTarget, filters.find(filter => filter.id === selected))}><Pencil size={14} /></button>}
      <button className="icon-button" aria-label="Create filter tab" onClick={event => open(event.currentTarget)}><Plus size={16} /></button>
    </div>
    <dialog ref={dialog} className={styles.filterDialog} data-help={help} aria-labelledby="todo-filter-dialog-title" onCancel={event => { if (busy || help) { event.preventDefault(); if (!busy) closeHelp() } }} onClose={() => (trigger.current?.isConnected ? trigger.current : document.getElementById('todo-filter-all'))?.focus()}>
      <div className={styles.filterLayout}>
        <form className={styles.filterForm} onSubmit={event => { event.preventDefault(); void submit() }}>
          <h3 id="todo-filter-dialog-title">{id ? 'Edit filter' : 'Create filter tab'}</h3>
          <label>Name<input autoFocus required value={draft.name} disabled={busy || uncertain} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className={styles.expressionHeading}><label onClick={() => expressionInput.current?.focus()}>Expression</label><button ref={helpButton} type="button" aria-expanded={help} onClick={() => help ? closeHelp() : openHelp()}><BookOpen size={16} /> Expression help</button></div>
          {editorSession > 0 && <Suspense fallback={<div style={{ height: 200 }} role="status">Loading editor…</div>}><FilterExpressionEditor key={editorSession} ref={expressionInput} value={draft.filter_expr} disabled={busy || uncertain} errorId={error ? 'filter-error' : undefined} onChange={filter_expr => setDraft(previous => ({ ...previous, filter_expr }))} /></Suspense>}
          {error && <p id="filter-error" role="alert" className="field-error">{error}</p>}
          {uncertain && <div><p>This change may have saved. Refresh and inspect the filters before retrying.</p><button type="button" disabled={busy || !online} onClick={() => void check()}>Check latest filters</button></div>}
          {!online && <p role="status">Connect to validate and save. You can still read Expression help.</p>}
          <div className={styles.filterButtons}>
            {id && <button className={styles.filterDelete} type="button" disabled={busy || uncertain || !online} onClick={() => void submit(true)}>Delete</button>}
            <button type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="primary" disabled={busy || uncertain || !online}>{busy ? 'Saving…' : id ? 'Save' : 'Create'}</button>
          </div>
        </form>
        {help && <TodoFilterHelp onClose={() => closeHelp()} onUse={expression => {
          if (draft.filter_expr.trim() && draft.filter_expr !== expression && !window.confirm('Replace your expression with this example?')) return
          setDraft({ ...draft, filter_expr: expression }); selection.current = { start: expression.length, end: expression.length }; closeHelp(true)
        }} />}
      </div>
    </dialog>
  </>
}
