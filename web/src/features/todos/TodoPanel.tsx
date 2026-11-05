import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { ApiError } from '../../api/client'
import { todosApi, type Todo } from '../../api/todos'
import { NotificationViewport } from '../../components/NotificationViewport'
import { TodoActions } from './TodoActions'
import { TodoEditor } from './TodoEditor'
import { TodoNotesPreview } from './TodoTextField'
import { TodoSheet } from './TodoSheet'
import { DraftFeedback, draftStatus } from './TodoFeedback'
import { useTodoInteraction } from './useTodoInteraction'
import { needsAttention, todoDraftStore, todoKey, validTitle } from './todoDrafts'
import styles from './TodoPanel.module.css'

const media = window.matchMedia('(max-width: 758px)')
const subscribeMedia = (listener: () => void) => { media.addEventListener('change', listener); return () => media.removeEventListener('change', listener) }

export function TodoPanel({ expanded, onToggle, online }: { expanded: boolean; onToggle: () => void; online: boolean }) {
  const client = useQueryClient()
  const store = useMemo(() => todoDraftStore(client), [client])
  useSyncExternalStore(store.subscribe, store.snapshot)
  const panel = useRef<HTMLElement>(null)
  const interaction = useTodoInteraction(panel, store)
  const narrow = useSyncExternalStore(subscribeMedia, () => media.matches)
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<{ id: string; field: 'title' | 'description' } | null>(null)
  const [busy, setBusy] = useState(false)
  const creating = useRef(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [notice, setNotice] = useState('')
  const [completed, setCompleted] = useState<Todo | null>(null)
  const dismissNotice = useCallback(() => { setNotice(''); setCompleted(null) }, [])
  const query = useQuery({ queryKey: todoKey, queryFn: ({ signal }) => todosApi.list('ALL', signal), retry: false, networkMode: 'always', staleTime: 15000 })
  useEffect(() => { store.hydrate() }, [store])
  useEffect(() => { if (query.data) store.ingest(query.data) }, [store, query.data])
  useEffect(() => { store.setOnline(online) }, [store, online])
  const dirty = [...store.drafts.values()].some(needsAttention)
  useBlocker({
    shouldBlockFn: async () => {
      const saved = await store.flushAll()
      return ((!saved || title.length > 0 || busy || uncertain) && !window.confirm('Leave with unsaved changes? Existing todo drafts are kept locally when browser storage is available. A new todo has not been saved.'))
    },
    enableBeforeUnload: dirty || title.length > 0 || busy || uncertain,
  })
  async function open(todo: Todo, field: 'title' | 'description') {
    store.ensure(todo)
    if (!expanded) onToggle()
    if (editing && editing.id !== todo.id) void store.flush(editing.id)
    if (narrow) setEditing({ id: todo.id, field })
    else interaction.focusTodo(todo.id, field)
  }
  async function exit() {
    const id = editing?.id
    if (id) await store.flush(id)
    setEditing(null)
    if (id) requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(`[data-todo-trigger="${id}"]`)?.focus({ preventScroll: true }))
  }
  async function status(todo: Todo) {
    const next = todo.status === 'OPEN' ? 'COMPLETED' : 'OPEN'
    if (await store.setStatus(todo, next)) {
      setNotice(next === 'COMPLETED' ? 'Todo completed.' : 'Todo reopened.')
      setCompleted(next === 'COMPLETED' ? todo : null)
    }
  }
  async function remove(todo: Todo) {
    if (!window.confirm('Delete this todo and its local draft? This cannot be undone.')) return
    if (await store.remove(todo)) {
      if (editing?.id === todo.id) setEditing(null)
      setNotice('Todo deleted.'); setCompleted(null)
    }
  }
  async function create() {
    if (creating.current || uncertain || !online || !validTitle(title)) return
    creating.current = true; setBusy(true); setError('')
    try { await store.addConfirmed(await todosApi.create(title)); setTitle(''); setNotice('Todo added.'); setCompleted(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add todo.'); setUncertain(!(cause instanceof ApiError) || cause.uncertain) }
    finally { creating.current = false; setBusy(false) }
  }
  const items = new Map((query.data ?? []).map(todo => [todo.id, todo]))
  for (const [id, draft] of store.drafts) if (needsAttention(draft) || draft.missing) items.set(id, draft.base)
  const todos = [...items.values()].sort((a, b) => b.id.length - a.id.length || b.id.localeCompare(a.id))
  const active = editing ? store.drafts.get(editing.id) : undefined

  return <section ref={panel} onFocusCapture={interaction.onFocusCapture} onBlurCapture={interaction.onBlurCapture} className={styles.panel} aria-label="Todos" data-expanded={expanded}>
    <header className="panel-heading">
      <h2 className={styles.headingTitle}><button className={styles.toggle} onClick={() => { void store.flushAll().then(onToggle) }} aria-expanded={expanded} aria-controls="todo-content"><span className={styles.headingText}>Todos</span><span>{todos.filter(todo => todo.status === 'OPEN').length} open{!expanded && dirty ? ' · Unsaved changes' : ''}</span>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></h2>
      <button className={`icon-button ${query.isFetching ? 'refreshing' : ''}`} aria-label="Refresh todos" disabled={query.isFetching || !online} onClick={() => void query.refetch()}><RefreshCw size={16} /></button>
    </header>
    <div id="todo-content" className={styles.content} hidden={!expanded}>
      <form className={styles.create} onSubmit={event => { event.preventDefault(); void create() }}>
        <label className="sr-only" htmlFor="new-todo">New todo</label><input id="new-todo" placeholder="Add a todo…" value={title} disabled={busy || uncertain || !online} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.repeat)) event.preventDefault() }} />
        <button className="primary" disabled={busy || uncertain || !online || !validTitle(title)}><Plus size={16} /><span className="sr-only">Add todo</span></button>
      </form>
      {[...title].length > 500 && <p className="field-error">Use 500 characters or fewer.</p>}
      <div className={styles.scroll}>
        {store.storageWarning && <p role="alert" className={styles.error}>{store.storageWarning}</p>}
        {!online && <p className={styles.offline}>Offline. Your changes are kept here until you reconnect.</p>}
        {error && <div role="alert" className={styles.error}><p>{error}</p>{uncertain && <><p>Refresh and check the list before retrying; adding again may create a duplicate.</p><button className="text-button" onClick={() => { if (window.confirm('Have you checked the list? Retrying may create a duplicate.')) { setUncertain(false); setError('') } }}>I checked the list</button></>}</div>}
        {query.isError && <p role="alert" className={styles.error}>{query.error.message}</p>}
        {query.isPending && !query.isError && <p className={styles.empty}>Loading todos…</p>}
        {query.data && !todos.length && <p className={styles.empty}>No todos yet. Add your first one above.</p>}
        <ul className={styles.list} aria-label="All todos">{todos.map(todo => {
          const draft = store.ensure(todo)
          const current = draft
          const locked = !online || !!(draft && (draft.deleting || draft.checking || draft.recovery || draft.uncertain || draft.error || draft.missing || draft.pendingStatus))
          return <li key={todo.id} className={styles.item}>
            {!narrow ? <TodoEditor draft={draft} store={store} active={interaction.activeId === todo.id} onStatus={() => void status(draft.base)} onDelete={() => void remove(draft.base)} /> : <>
              <div className={styles.itemRow}>
                <button className={styles.check} role="checkbox" aria-checked={todo.status === 'COMPLETED'} aria-label={`${todo.status === 'COMPLETED' ? 'Reopen' : 'Complete'} ${current.title}`} disabled={locked} onClick={() => void status(todo)}><span>{todo.status === 'COMPLETED' && <Check size={10} />}</span></button>
                <button data-todo-trigger={todo.id} className={`${styles.title} ${todo.status === 'COMPLETED' ? styles.completed : ''}`} onClick={() => void open(todo, 'title')}>{current.title || 'Untitled draft'}</button>
                <TodoActions title={current.title} disabled={!!draft?.deleting} onDelete={() => void remove(todo)} />
              </div>
              <TodoNotesPreview value={current.description} onOpen={() => void open(todo, 'description')} />
              {draft && draftStatus(draft, online) && <div className={styles.noteBody}><p className={styles.saveStatus} role="status">{draftStatus(draft, online)}</p><DraftFeedback draft={draft} store={store} /></div>}
            </>}
          </li>
        })}</ul>
      </div>
    </div>
    {narrow && active && editing && <TodoSheet key={editing.id} draft={active} store={store} initialField={editing.field} onStatus={() => void status(active.base)} onDelete={() => void remove(active.base)} onClose={() => void exit()} />}
    <NotificationViewport notice={notice} onDismiss={dismissNotice} action={completed ? { label: completed.description ? 'Edit note' : 'Add note', onClick: () => { void open(store.drafts.get(completed.id)?.base ?? completed, 'description'); dismissNotice() } } : undefined}>{busy && <p className="notification-card" role="status">Adding todo…</p>}</NotificationViewport>
  </section>
}
