import type { Category } from '../../api/categories'
import { categoriesOptions } from '../categories/categoriesQueries'
import { preferredCategoryId } from '../categories/categoryPreference'
import { CategoryManager } from '../categories/CategoryManager'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus, RefreshCw, WifiOff, AlertCircle, Tags } from 'lucide-react'
import { type Entry, type EntryInput } from '../../api/entries'
import { dayRange, getTimeZone, today, validDay, intersects, civilValue } from '../../lib/time'
import { DateNavigator, DayControls } from '../../components/DateNavigator'
import { rangeOptions, entryOrder } from '../entries/entriesQueries'
import { useEntryMutations } from '../entries/useEntryMutations'
import { EntrySheet } from '../entries/EntrySheet'
import { EntryEditor, OperationStatus, type EditorSession } from '../entries/EntryEditor'
import { NotificationViewport } from '../../components/NotificationViewport'
import { Timeline } from './Timeline'
import { TodoPanel } from '../todos/TodoPanel'
import styles from './CalendarPage.module.css'

export function CalendarPage({ date }: { date?: string }) {
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const categoryCreated = useRef<((category: Category) => void) | undefined>(undefined)
  function manageCategories(onCreated?: (category: Category) => void) {
    categoryCreated.current = onCreated
    setCategoriesOpen(true)
  }
  const [todosExpanded, setTodosExpanded] = useState(true)
  const [zone, setZone] = useState(getTimeZone)
  const [online, setOnline] = useState(navigator.onLine)
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<EditorSession | null>(null)
  const [draftPreview, setDraftPreview] = useState<EntryInput | null>(null)
  const closeGuard = useRef(() => true)
  const navigate = useNavigate()
  const day = date && validDay(date) ? date : today(zone)
  const range = useMemo(() => dayRange(day, zone), [day, zone])
  const query = useQuery(rangeOptions(range))
  const categories = useQuery(categoriesOptions())
  const categoryMap = useMemo(() => new Map(categories.data?.map(item => [item.id, item])), [categories.data])
  const mutations = useEntryMutations(setNotice)
  const closeEditor = useCallback(() => { setEditor(null); setDraftPreview(null); closeGuard.current = () => true }, [])
  useEffect(() => {
    if (!date || !validDay(date)) {
      if (date) setNotice('That date was not valid. Showing today instead.')
      void navigate({ to: '/calendar', search: { date: day }, replace: true })
    }
  }, [date, day, navigate])
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); setZone(getTimeZone()) }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('focus', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('focus', update) }
  }, [])
  const dismissNotice = useCallback(() => setNotice(''), [])
  const pending = Object.values(mutations.pending)
  useEffect(() => {
    if (!pending.length) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending.length])
  const lockedIds = new Set(pending.filter(op => op.original).map(op => op.original!.id))
  const entries = useMemo(() => {
    const items = [...(query.data?.items ?? [])]
    for (const op of Object.values(mutations.pending)) {
      if (op.kind !== 'replace' || !op.original || !op.input) continue
      const index = items.findIndex(e => e.id === op.original!.id)
      if (index >= 0) items.splice(index, 1)
      if (intersects(op.input, range)) items.push({ ...op.original, ...op.input, description: op.input.description ?? op.original.description, category_id: op.input.category_id ?? op.original.category_id })
    }
    return items.sort(entryOrder)
  }, [query.data, mutations.pending, range])
  const unsupported = entries.filter(e => !civilValue(e.start_time, zone) || !civilValue(e.end_time, zone))
  const visibleEntries = entries.filter(e => !unsupported.includes(e))
  function ready() {
    if (editor && !closeGuard.current()) return false
    closeEditor()
    return true
  }
  function open(entry: Entry) {
    if (lockedIds.has(entry.id) || !ready()) return
    document.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(entry.id)}"]`)?.focus({ preventScroll: true })
    setEditor({ key: crypto.randomUUID(), input: entry, original: entry, zone })
  }
  function create(input?: EntryInput) {
    if (mutations.pending.create) { setNotice('Check the previous save before creating another entry.'); return }
    if (!ready()) return
    const start = Math.max(range.from, Math.min(range.to - 900, day === today(zone) ? Math.floor(Date.now() / 1000 / 300) * 300 : range.from + 9 * 3600))
    const initial = { description: '', ...(input ?? { title: '', start_time: start, end_time: start + 900 }), category_id: input?.category_id ?? preferredCategoryId(categories.data ?? []) }
    setDraftPreview(initial)
    setEditor({ key: crypto.randomUUID(), input: initial, zone })
  }
  const onDate = (date: string) => { void navigate({ to: '/calendar', search: { date } }) }
  async function replace(entry: Entry, target: EntryInput) {
    try { await mutations.submit('replace', { title: target.title, category_id: target.category_id, start_time: target.start_time, end_time: target.end_time }, entry) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save changes.') }
  }
  const heading = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return <div className={styles.layout}>
    <DateNavigator key={day.slice(0, 7)} day={day} zone={zone} onDate={onDate} />
    <main className="calendar-main" aria-label="Calendar">
      <header className="page-header">
        <div className="page-title"><h1 title={day}>{heading}</h1></div>
        <div className="header-actions"><DayControls day={day} zone={zone} onDate={onDate} /><button className="icon-button category-mobile-action" aria-label="Manage categories" onClick={() => manageCategories()}><Tags size={18} /></button><button className={`icon-button refresh ${query.isFetching ? 'refreshing' : ''}`} aria-label={query.isFetching ? 'Refreshing entries' : 'Refresh entries'} aria-busy={query.isFetching} disabled={query.isFetching || !online} onClick={() => { void query.refetch(); void categories.refetch() }}><RefreshCw size={18} /></button><button className="primary add-entry" aria-label="Add entry" onClick={() => create()} disabled={!!mutations.pending.create}><Plus size={16} /><span>Add entry</span></button></div>
      </header>
      <span className="sr-only" role="status">{query.isFetching ? 'Loading entries' : ''}</span>
      <Timeline key={`${day}:${zone}`} day={day} range={range} zone={zone} entries={visibleEntries} categories={categoryMap} categoriesLoading={categories.isPending} lockedIds={lockedIds} selectedId={editor?.original?.id} draft={editor && !editor.original ? draftPreview : mutations.pending.create?.input ?? null} online={online} loading={query.isPending} onCreate={create} onOpen={open} onReplace={(entry, target) => void replace(entry, target)} beforeDrag={ready} />
    </main>
    <aside className={styles.workspace} data-editing={!!editor} data-todos-expanded={todosExpanded} aria-label="Todos and entry details">
      <TodoPanel expanded={todosExpanded} onToggle={() => setTodosExpanded(value => !value)} online={online} />
      {editor && <div className={styles.details}>
        <EntrySheet existing={!!editor.original} key={editor.key} closeGuard={closeGuard} onClose={closeEditor}><EntryEditor session={editor} mutations={mutations} online={online} onClose={closeEditor} onPreviewChange={setDraftPreview} closeGuard={closeGuard} onManageCategories={manageCategories} /></EntrySheet>
      </div>}
    </aside>
    <CategoryManager open={categoriesOpen} onClose={() => { setCategoriesOpen(false); categoryCreated.current = undefined }} onCreated={category => categoryCreated.current?.(category)} online={online} />
    <NotificationViewport notice={notice} onDismiss={dismissNotice}>
      {!online && <div className="notification-card" role="status"><strong><WifiOff size={14} /> Offline</strong><p>Reconnect to save changes. Your draft stays here.</p></div>}
      {categories.isError && <div className="notification-card notification-error" role="alert"><strong>Could not refresh categories</strong><p>Your entries are still available.</p><button className="text-button" disabled={!online || categories.isFetching} onClick={() => void categories.refetch()}>Retry categories</button></div>}
      {query.isError && <div className="notification-card notification-error" role="alert"><strong><AlertCircle size={14} /> Could not load entries</strong><p>{query.error.message}</p><button className="text-button" disabled={!online || query.isFetching} onClick={() => { void query.refetch(); void categories.refetch() }}>Try again</button></div>}
      {unsupported.length > 0 && <div className="notification-card notification-error" role="alert">{unsupported.length} entries have dates outside the editor's supported range. Their data has not been changed.</div>}
      {pending.filter(op => !editor || op.key !== (editor.original?.id ?? 'create')).map(op => <OperationStatus key={op.key} operation={op} mutations={mutations} online={online} />)}
    </NotificationViewport>
  </div>
}
