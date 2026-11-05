import { useEffect, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { todosApi, type Todo } from '../../api/todos'
import styles from './TodoPanel.module.css'

const todoKey = ['todos', 'ALL'] as const
const validTitle = (title: string) => [...title].length > 0 && [...title].length <= 500

export function TodoPanel({ expanded, onToggle, online }: { expanded: boolean; onToggle: () => void; online: boolean }) {
  const client = useQueryClient()
  const [showCompleted, setShowCompleted] = useState(false)
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<{ todo: Todo; title: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  const focusNew = useRef(false)
  const query = useQuery({ queryKey: todoKey, queryFn: ({ signal }) => todosApi.list('ALL', signal), retry: false, networkMode: 'always', staleTime: 15000 })
  const mutation = useMutation({ mutationFn: (operation: () => Promise<Todo | void>) => operation(), retry: false, networkMode: 'always' })
  const [busy, setBusy] = useState(false)
  const locked = busy || uncertain || !online
  useEffect(() => {
    if (!locked && focusNew.current) { input.current?.focus(); focusNew.current = false }
  }, [locked])
  const dirty = title.length > 0 || !!(editing && editing.title !== editing.todo.title) || busy || uncertain
  useBlocker({
    shouldBlockFn: ({ next }) => next.fullPath !== '/calendar' && dirty && !window.confirm('Leave the calendar? Unsaved todos and pending save information will be lost.'),
    enableBeforeUnload: dirty,
  })

  async function save(operation: () => Promise<Todo | void>, done: () => void, message: string, removedId?: string) {
    if (lock.current || uncertain || !online) return
    lock.current = true
    setBusy(true)
    setError(''); setNotice('')
    try {
      const saved = await mutation.mutateAsync(operation)
      await client.cancelQueries({ queryKey: ['todos'] })
      // Commit the confirmed response even if the following refresh fails.
      client.setQueryData<Todo[]>(todoKey, items => {
        if (!items) return items
        const next = items.filter(item => item.id !== (saved?.id ?? removedId))
        if (saved) next.push(saved)
        return next.sort((a, b) => b.id.length - a.id.length || b.id.localeCompare(a.id))
      })
      done()
      setNotice(message)
      await client.invalidateQueries({ queryKey: ['todos'] })
    } catch (cause) {
      setError(cause instanceof ApiError ? Object.values(cause.fields).join(' ') || cause.message : 'Could not save this change.')
      if (cause instanceof ApiError && cause.uncertain) { setUncertain(true); setShowCompleted(true) }
      if (cause instanceof ApiError && cause.status === 404) await client.invalidateQueries({ queryKey: ['todos'] })
    } finally { lock.current = false; setBusy(false) }
  }
  const cancelEdit = () => {
    if (editing && editing.title !== editing.todo.title && !window.confirm('Discard changes to this title?')) return false
    setEditing(null)
    return true
  }
  const openTodos = query.data?.filter(todo => todo.status === 'OPEN') ?? []
  const completedTodos = query.data?.filter(todo => todo.status === 'COMPLETED') ?? []
  return <section className={styles.panel} aria-label="Todos" data-expanded={expanded}>
    <header className={styles.heading}>
      <h2 className={styles.headingTitle}><button className={styles.toggle} onClick={onToggle} aria-expanded={expanded} aria-controls="todo-content">
        <span className={styles.headingText}>Todos</span><span>{query.data ? `${openTodos.length} open` : '…'}</span>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button></h2>
      <button className={`icon-button ${query.isFetching ? 'refreshing' : ''}`} aria-label="Refresh todos" disabled={query.isFetching || busy || !online} onClick={() => void query.refetch()}><RefreshCw size={16} /></button>
    </header>
    <div id="todo-content" className={styles.content} hidden={!expanded}>
          <form className={styles.create} onSubmit={event => { event.preventDefault(); if (validTitle(title)) void save(() => todosApi.create(title), () => { setTitle(''); focusNew.current = true }, 'Todo added.') }}>
            <label className="sr-only" htmlFor="new-todo">New todo</label>
            <input ref={input} id="new-todo" onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.repeat)) event.preventDefault() }} placeholder="Add a todo…" value={title} disabled={locked} onChange={event => setTitle(event.target.value)} aria-describedby={ [...title].length > 500 ? 'new-title-error' : undefined } />
            <button className="primary" disabled={locked || !validTitle(title)}><Plus size={16} /><span className="sr-only">Add todo</span></button>
          </form>
          {[...title].length > 500 && <p id="new-title-error" className="field-error">Use 500 characters or fewer.</p>}
          <div className={styles.scroll}>
          {error && <div className={styles.error} role="alert"><p>{error}</p>{uncertain && <><p>Refresh and check the open and completed lists before retrying. Retrying an add may create a duplicate.</p><button className="text-button" onClick={() => { if (window.confirm('Have you checked the list? Retrying may duplicate a todo or overwrite a newer change.')) { setUncertain(false); setError('') } }}>I checked the list; allow changes</button></>}</div>}
          {query.isError && <div className={styles.error} role="alert"><p>{query.error.message}</p><button className="text-button" disabled={query.isFetching} onClick={() => void query.refetch()}>Try again</button></div>}
          <p className={styles.status} role="status">{busy ? 'Saving…' : query.isFetching ? 'Refreshing todos…' : notice}</p>
          {!online && <p className={styles.offline}>Offline. Reconnect to save; your draft stays here.</p>}
          {query.isPending && !query.isError ? <p className={styles.empty}>Loading todos…</p> : query.data && openTodos.length === 0 ? <div className={styles.empty}><Check size={22} /><p>No open todos. Add one above.</p></div> : null}
          {renderList(openTodos, 'Open todos')}
          {query.data && <button className={styles.completedToggle} aria-expanded={showCompleted} aria-controls="completed-todos" onClick={() => setShowCompleted(value => !value)}>{showCompleted ? <ChevronDown size={15} /> : <ChevronRight size={15} />}Completed · {completedTodos.length}</button>}
          <div id="completed-todos" hidden={!showCompleted}>
            {renderList(completedTodos, 'Completed todos')}
            {query.data && completedTodos.length === 0 && <p className={styles.empty}>No completed todos yet.</p>}
          </div>
          </div>
    </div>
  </section>

  function renderList(items: Todo[], label: string) {
    return <ul className={styles.list} aria-label={label}>
            {items.map(todo => <li key={todo.id} className={styles.item}>
              <div className={styles.itemRow}>
                <button className={styles.check} role="checkbox" aria-checked={todo.status === 'COMPLETED'} aria-label={`${todo.status === 'COMPLETED' ? 'Reopen' : 'Complete'} ${todo.title}`} disabled={locked || editing?.todo.id === todo.id} onClick={() => void save(() => todosApi.patch(todo.id, { status: todo.status === 'OPEN' ? 'COMPLETED' : 'OPEN' }), () => {}, todo.status === 'OPEN' ? 'Todo completed.' : 'Todo reopened.')}><span>{todo.status === 'COMPLETED' && <Check size={14} />}</span></button>
                {editing?.todo.id === todo.id ? <form className={styles.edit} onSubmit={event => { event.preventDefault(); if (validTitle(editing.title)) void save(() => todosApi.patch(todo.id, { title: editing.title }), () => setEditing(null), 'Title saved.') }}><label className="sr-only" htmlFor="edit-todo">Todo title</label><textarea autoFocus id="edit-todo" value={editing.title} disabled={locked} onChange={event => setEditing({ ...editing, title: event.target.value })} /><div className="row"><button className="primary" disabled={locked || !validTitle(editing.title)}>Save</button><button type="button" className="secondary" disabled={locked} onClick={cancelEdit}>Cancel</button></div>{[...editing.title].length > 500 && <p className="field-error">Use 500 characters or fewer.</p>}</form>
                  : <span className={`${styles.title} ${todo.status === 'COMPLETED' ? styles.completed : ''}`}>{todo.title}</span>}
                {editing?.todo.id !== todo.id && <div className={styles.actions}><button className="icon-button" aria-label={`Edit ${todo.title}`} disabled={locked} onClick={() => { if (cancelEdit()) { setEditing({ todo, title: todo.title }); setDeleting(null) } }}><Pencil size={15} /></button><button className="icon-button" aria-label={`Delete ${todo.title}`} disabled={locked} onClick={() => setDeleting(todo.id)}><Trash2 size={15} /></button></div>}
              </div>
              {deleting === todo.id && <div className="delete-confirm"><strong>Delete this todo?</strong><p>This cannot be undone.</p><div className="row"><button className="danger-button" disabled={locked} onClick={() => void save(() => todosApi.remove(todo.id), () => setDeleting(null), 'Todo deleted.', todo.id)}>Delete todo</button><button className="secondary" disabled={locked} onClick={() => setDeleting(null)}>Keep todo</button></div></div>}
            </li>)}
    </ul>
  }
}
