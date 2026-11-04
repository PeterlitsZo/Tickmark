import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus, RefreshCw, WifiOff, AlertCircle } from 'lucide-react'
import { type Entry, type EntryInput } from '../../api/entries'
import { dayRange, getTimeZone, today, validDay, intersects, civilValue } from '../../lib/time'
import { DateNavigator, DayControls } from '../../components/DateNavigator'
import { rangeOptions, entryOrder } from '../entries/entriesQueries'
import { useEntryMutations } from '../entries/useEntryMutations'
import { EntryEditor, OperationStatus, type EditorSession } from '../entries/EntryEditor'
import { NotificationViewport } from '../../components/NotificationViewport'
import { Timeline } from './Timeline'
import styles from './CalendarPage.module.css'

export function CalendarPage({ date }: { date?: string }) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 759px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 759px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
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
      if (intersects(op.input, range)) items.push({ ...op.input, id: op.original.id })
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
    setEditor({ key: crypto.randomUUID(), input: entry, original: entry, zone })
  }
  function create(input?: EntryInput) {
    if (mutations.pending.create) { setNotice('Check the previous save before creating another entry.'); return }
    if (!ready()) return
    const start = Math.max(range.from, Math.min(range.to - 900, day === today(zone) ? Math.floor(Date.now() / 1000 / 300) * 300 : range.from + 9 * 3600))
    setDraftPreview(input ?? { title: '', start_time: start, end_time: start + 900 })
    setEditor({ key: crypto.randomUUID(), input: input ?? { title: '', start_time: start, end_time: start + 900 }, zone })
  }
  const onDate = (date: string) => { void navigate({ to: '/calendar', search: { date } }) }
  async function replace(entry: Entry, target: EntryInput) {
    try { await mutations.submit('replace', target, entry) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save changes.') }
  }
  const heading = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return <div className={styles.layout}>
    <DateNavigator inert={compact && !!editor} key={day.slice(0, 7)} day={day} zone={zone} onDate={onDate} />
    <main inert={compact && !!editor} className="calendar-main" aria-label="Calendar">
      <header className="page-header">
        <div className="page-title"><h1 title={day}>{heading}</h1></div>
        <div className="header-actions"><DayControls day={day} zone={zone} onDate={onDate} /><button className={`icon-button refresh ${query.isFetching ? 'refreshing' : ''}`} aria-label={query.isFetching ? 'Refreshing entries' : 'Refresh entries'} aria-busy={query.isFetching} disabled={query.isFetching || !online} onClick={() => void query.refetch()}><RefreshCw size={18} /></button><button className="primary add-entry" aria-label="Add entry" onClick={() => create()} disabled={!!mutations.pending.create}><Plus size={16} /><span>Add entry</span></button></div>
      </header>
      <span className="sr-only" role="status">{query.isFetching ? 'Loading entries' : ''}</span>
      <Timeline key={`${day}:${zone}`} day={day} range={range} zone={zone} entries={visibleEntries} lockedIds={lockedIds} selectedId={editor?.original?.id} draft={editor && !editor.original ? draftPreview : mutations.pending.create?.input ?? null} online={online} loading={query.isPending} onCreate={create} onOpen={open} onReplace={(entry, target) => void replace(entry, target)} beforeDrag={ready} />
    </main>
    <aside className={`details-sidebar ${editor ? 'details-active' : ''}`} aria-label="Entry details">
      {editor ? <EntryEditor key={editor.key} session={editor} mutations={mutations} online={online} modal={compact} notify={setNotice} onClose={closeEditor} onPreviewChange={setDraftPreview} closeGuard={closeGuard} />
        : <header className="editor-heading"><h2>Details</h2></header>}
    </aside>
    {compact && editor && <div className="editor-backdrop" aria-hidden="true" />}
    <NotificationViewport notice={notice} onDismiss={dismissNotice}>
      {!online && <div className="notification-card" role="status"><strong><WifiOff size={14} /> Offline</strong><p>Reconnect to save changes. Your draft stays here.</p></div>}
      {query.isError && <div className="notification-card notification-error" role="alert"><strong><AlertCircle size={14} /> Could not load entries</strong><p>{query.error.message}</p><button className="text-button" disabled={!online || query.isFetching} onClick={() => void query.refetch()}>Try again</button></div>}
      {unsupported.length > 0 && <div className="notification-card notification-error" role="alert">{unsupported.length} entries have dates outside the editor's supported range. Their data has not been changed.</div>}
      {pending.map(op => <OperationStatus key={op.key} operation={op} mutations={mutations} online={online} />)}
    </NotificationViewport>
  </div>
}
