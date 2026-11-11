import { dateInZone, effortSummary, validMinutes } from '../../../../shared/todoEffort'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { ApiError } from '../../api/client'
import { todosApi, type Todo } from '../../api/todos'
import { NotificationViewport } from '../../components/NotificationViewport'
import { TodoFilterTabs } from './TodoFilterTabs'
import { useTodoFilters } from './useTodoFilters'
import { filterError } from '../../api/todoFilters'
import { TodoActions } from './TodoActions'
import { TodoNotesPreview } from './TodoTextField'
import { TodoSheet } from './TodoSheet'
import { DraftFeedback, draftStatus } from './TodoFeedback'
import { needsAttention, todoDraftStore, todoKey, validTitle } from './todoDrafts'
import styles from './TodoPanel.module.css'

export function TodoPanel({ expanded, onToggle, online }: { expanded: boolean; onToggle: () => void; online: boolean }) {
  const client = useQueryClient()
  const store = useMemo(() => todoDraftStore(client), [client])
  useSyncExternalStore(store.subscribe, store.snapshot)
  const panel = useRef<HTMLElement>(null)
  const filterState = useTodoFilters(online)
  const { selected } = filterState
  const selectedFilter = filterState.selectedId
  const [addedOutside, setAddedOutside] = useState<Todo | null>(null)
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<{ id: string; field: 'title' | 'description' | 'spent' } | null>(null)
  const [busy, setBusy] = useState(false)
  const creating = useRef(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [notice, setNotice] = useState('')
  const [completed, setCompleted] = useState<Todo | null>(null)
  const dismissNotice = useCallback(() => { setNotice(''); setCompleted(null); setAddedOutside(null) }, [])
  const query = useQuery({ queryKey: todoKey, queryFn: ({ signal }) => todosApi.list('ALL', signal), retry: false, networkMode: 'always', staleTime: 15000, refetchOnWindowFocus: 'always' })
  const filteredQuery = useQuery({
    queryKey: ['todo-filter-results', selected?.filter_expr],
    queryFn: ({ signal }) => todosApi.listExpression(selected!.filter_expr, signal),
    enabled: !!selected && online && !!query.data, retry: false, staleTime: 0, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
  })
  useEffect(() => { void client.invalidateQueries({ queryKey: ['todo-filter-results'] }) }, [client, query.dataUpdatedAt])
  useEffect(() => { store.hydrate() }, [store])
  useEffect(() => { if (query.data) store.ingest(query.data) }, [store, query.data])
  useEffect(() => { if (filteredQuery.data && filteredQuery.dataUpdatedAt >= query.dataUpdatedAt) store.ingest(filteredQuery.data, false) }, [store, filteredQuery.data, filteredQuery.dataUpdatedAt, query.dataUpdatedAt])
  useEffect(() => { store.setOnline(online) }, [store, online])
  useEffect(() => {
    let refreshing = false
    let lastAttempt = 0
    const refreshDay = () => {
      if (!store.online || refreshing || Date.now() - lastAttempt < 15000) return
      const cached = client.getQueryData<Todo[]>(todoKey)
      if (cached?.some(todo => todo.time_zone && todo.today !== dateInZone(todo.time_zone))) {
        refreshing = true
        lastAttempt = Date.now()
        void store.flushAll().then(async () => {
          await client.invalidateQueries({ queryKey: ['todos'] })
          await client.invalidateQueries({ queryKey: ['todo-filter-results'] })
        }).finally(() => { refreshing = false })
      }
    }
    const timer = setInterval(refreshDay, 1000)
    window.addEventListener('focus', refreshDay)
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshDay) }
  }, [client, store])
  const dirty = [...store.drafts.values()].some(needsAttention)
  useBlocker({
    shouldBlockFn: async ({ current, next }) => {
      // Browsing dates leaves the same todo workspace mounted.
      if (current.pathname === '/calendar' && next.pathname === '/calendar') return false
      const saved = await store.flushAll()
      return ((!saved || title.length > 0 || busy || uncertain) && !window.confirm('Leave with unsaved changes? Existing todo drafts are kept locally when browser storage is available. A new todo has not been saved.'))
    },
    enableBeforeUnload: dirty || title.length > 0 || busy || uncertain,
  })
  async function open(todo: Todo, field: 'title' | 'description' | 'spent') {
    store.ensure(todo)
    if (!expanded) onToggle()
    if (editing && editing.id !== todo.id) void store.flush(editing.id)
    setEditing({ id: todo.id, field })
  }
  async function exit() {
    const id = editing?.id
    if (id && !await store.flush(id)) {
      panel.current?.querySelector<HTMLElement>('dialog [aria-invalid="true"]')?.focus()
      return
    }
    setEditing(null)
  }
  async function status(todo: Todo) {
    const next = todo.status === 'OPEN' ? 'COMPLETED' : 'OPEN'
    if (await store.setStatus(todo, next)) {
      setNotice(next === 'COMPLETED' ? 'Todo completed.' : 'Todo reopened.')
      setCompleted(next === 'COMPLETED' ? todo : null)
    }
  }
  async function remove(todo: Todo, confirmed = false) {
    if (!confirmed && !window.confirm('Delete this todo and its time records? This cannot be undone.')) return
    if (await store.remove(todo)) {
      if (editing?.id === todo.id) setEditing(null)
      setNotice('Todo deleted.'); setCompleted(null)
    }
  }
  async function create() {
    if (creating.current || uncertain || !online || !validTitle(title)) return
    creating.current = true; setBusy(true); setError('')
    try {
      const saved = await todosApi.create(title)
      await store.addConfirmed(saved); setTitle(''); setNotice('Todo added.'); setCompleted(null); setAddedOutside(null)
      if (selected) {
        try {
          const matches = await todosApi.listExpression(selected.filter_expr)
          client.setQueryData(['todo-filter-results', selected.filter_expr], matches)
          if (!matches.some(todo => todo.id === saved.id)) { setNotice('Todo added. It does not match this filter.'); setAddedOutside(saved) }
        } catch { setNotice('Todo added. Could not refresh this filter.'); setAddedOutside(saved) }
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add todo.'); setUncertain(!(cause instanceof ApiError) || cause.uncertain) }
    finally { creating.current = false; setBusy(false) }
  }
  const items = new Map((query.data ?? []).map(todo => [todo.id, todo]))
  if (selected && filteredQuery.dataUpdatedAt >= query.dataUpdatedAt) for (const todo of filteredQuery.data ?? []) if (!store.isRemoved(todo.id)) items.set(todo.id, todo)
  for (const [id, draft] of store.drafts) if (needsAttention(draft) || draft.missing) items.set(id, draft.base)
  const todos = [...items.values()].sort((a, b) => b.id.length - a.id.length || b.id.localeCompare(a.id))
  const matchingIds = new Set(filteredQuery.data?.map(todo => todo.id))
  const retained = (todo: Todo) => todo.id === editing?.id || !!(store.drafts.get(todo.id) && needsAttention(store.drafts.get(todo.id)!))
  const visibleTodos = selected ? todos.filter(todo => matchingIds.has(todo.id) || retained(todo)) : todos
  const retainedCount = selected ? visibleTodos.filter(todo => !matchingIds.has(todo.id)).length : 0
  const countItems = selected ? filteredQuery.data : query.data
  const countLabel = countItems ? `${countItems.filter(todo => todo.status === 'OPEN').length} open` : 'Loading…'
  function selectFilter(id: string) { void store.flushAll(); filterState.select(id) }
  const active = editing ? store.drafts.get(editing.id) : undefined

  return <section ref={panel} className={styles.panel} aria-label="Todos" data-expanded={expanded}>
    <header className="panel-heading">
      <h2 className={styles.headingTitle}><button className={styles.toggle} onClick={() => { void store.flushAll().then(onToggle) }} aria-expanded={expanded} aria-controls="todo-content"><span className={styles.headingText}>Todos</span><span>{countLabel}{!expanded && dirty ? ' · Unsaved changes' : ''}</span>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></h2>
      <button className={`icon-button ${query.isFetching ? 'refreshing' : ''}`} aria-label="Refresh todos" disabled={query.isFetching || !online} onClick={() => { void query.refetch(); void filterState.query.refetch(); if (selected) void filteredQuery.refetch() }}><RefreshCw size={16} /></button>
    </header>
    <div id="todo-content" className={styles.content} hidden={!expanded}>
      <TodoFilterTabs filters={filterState.query.data ?? []} selected={selectedFilter} online={online} onSelect={selectFilter} />
      {filterState.query.isError && <p role="alert" className={styles.filterWarning}>Could not load filters. <button className="text-button" onClick={() => void filterState.query.refetch()}>Retry</button></p>}
      {filterState.query.isPending && <p className={styles.filterWarning}>{online ? 'Loading filters…' : 'Connect to load your filters.'}</p>}
      <form className={styles.create} onSubmit={event => { event.preventDefault(); void create() }}>
        <label className="sr-only" htmlFor="new-todo">New todo</label><input id="new-todo" placeholder="Add a todo…" value={title} disabled={busy || uncertain || !online} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.repeat)) event.preventDefault() }} />
        <button className="primary" disabled={busy || uncertain || !online || !validTitle(title)}><Plus size={16} /><span className="sr-only">Add todo</span></button>
      </form>
      {[...title].length > 500 && <p className="field-error">Use 500 characters or fewer.</p>}
      <div className={styles.scroll} id="todo-filter-results" role="tabpanel" aria-labelledby={`todo-filter-${selectedFilter || 'all'}`} aria-busy={selected ? filteredQuery.isFetching : query.isFetching}>
        {retainedCount > 0 && <p className={styles.filterDraftNotice}>Also showing {retainedCount} editing or unsaved {retainedCount === 1 ? 'todo' : 'todos'} outside this filter. <button className="text-button" onClick={() => selectFilter('')}>View all todos</button></p>}
        {store.storageWarning && <p role="alert" className={styles.error}>{store.storageWarning}</p>}
        {!online && <p className={styles.offline}>Offline. Your changes are kept here until you reconnect.</p>}
        {error && <div role="alert" className={styles.error}><p>{error}</p>{uncertain && <><p>Refresh and check the list before retrying; adding again may create a duplicate.</p><button className="text-button" onClick={() => { if (window.confirm('Have you checked the list? Retrying may create a duplicate.')) { setUncertain(false); setError('') } }}>I checked the list</button></>}</div>}
        {query.isError && <p role="alert" className={styles.error}>{query.error.message}</p>}
        {query.isPending && !query.isError && <p className={styles.empty}>Loading todos…</p>}
        {query.data && !selected && !todos.length && <p className={styles.empty}>No todos yet. Add your first one above.</p>}
        {selected && filteredQuery.isError && <p role="alert" className={styles.error}>{filterError(filteredQuery.error)} Use Edit filter to check the expression. <button className="text-button" onClick={() => void filteredQuery.refetch()}>Retry</button></p>}
        {selected && filteredQuery.isPending && <p className={styles.empty}>{online ? 'Filtering todos…' : 'Connect to the internet to load this filter.'}</p>}
        {selected && filteredQuery.isSuccess && !visibleTodos.length && <p className={styles.empty}>No todos match this filter.</p>}
        <ul className={styles.list} aria-label={selected ? `${selected.name} todos` : 'All todos'}>{visibleTodos.map(todo => {
          const draft = store.ensure(todo)
          const current = draft
          const summary = effortSummary({ ...draft.base,
            expected_daily_minutes: validMinutes(draft.expected, true) ? draft.expected === '' ? null : Number(draft.expected) : draft.base.expected_daily_minutes,
            today_spent_minutes: draft.base.today && validMinutes(draft.spent) ? Number(draft.spent) : draft.base.today_spent_minutes,
            total_spent_minutes: draft.base.today && validMinutes(draft.spent) ? draft.base.total_spent_minutes! - draft.base.today_spent_minutes! + Number(draft.spent) : draft.base.total_spent_minutes,
          })
          const locked = !online || !!(draft && (draft.deleting || draft.checking || draft.recovery || draft.uncertain || draft.error || draft.missing || draft.pendingStatus))
          return <li key={todo.id} className={styles.item}>

              <div className={styles.itemRow}>
                <button className={styles.check} role="checkbox" aria-checked={todo.status === 'COMPLETED'} aria-label={`${todo.status === 'COMPLETED' ? 'Reopen' : 'Complete'} ${current.title}`} disabled={locked} onClick={() => void status(todo)}><span>{todo.status === 'COMPLETED' && <Check size={10} />}</span></button>
                <button data-todo-trigger={todo.id} aria-haspopup="dialog" className={`${styles.title} ${todo.status === 'COMPLETED' ? styles.completed : ''}`} onClick={() => void open(todo, 'title')}>{current.title || 'Untitled draft'}</button>
                <TodoActions title={current.title} disabled={!!draft?.deleting} onDelete={() => void remove(todo)} />
              </div>
              <TodoNotesPreview value={current.description} onOpen={() => void open(todo, 'description')} />
              {summary && <button className={styles.effortSummary} onClick={() => void open(todo, 'spent')}>{summary}</button>}
              {draft && draftStatus(draft, online) && <div className={styles.noteBody}><p className={styles.saveStatus} role="status">{draftStatus(draft, online)}</p><DraftFeedback draft={draft} store={store} /></div>}
          </li>
        })}</ul>
      </div>
    </div>
    {active && editing && <TodoSheet key={editing.id} draft={active} store={store} initialField={editing.field} onStatus={() => void status(active.base)} onDelete={() => void remove(active.base, true)} onClose={() => void exit()} />}
    <NotificationViewport notice={notice} onDismiss={dismissNotice} action={addedOutside ? { label: 'View todo', onClick: () => { selectFilter(''); void open(addedOutside, 'title'); dismissNotice() } } : completed ? { label: completed.description ? 'Edit note' : 'Add note', onClick: () => { void open(store.drafts.get(completed.id)?.base ?? completed, 'description'); dismissNotice() } } : undefined}>{busy && <p className="notification-card" role="status">Adding todo…</p>}</NotificationViewport>
  </section>
}
