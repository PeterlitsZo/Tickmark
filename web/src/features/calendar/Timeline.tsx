import type { Category } from '../../api/categories'
import { categoryTone } from '../categories/categoryStyles'
import { memo, useEffect, useMemo, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { Entry, EntryInput, TimeRange } from '../../api/entries'
import { clockTime, entryTime, offsetLabel, duration } from '../../lib/time'
import { clamp, dragTimes, layoutEntries, PIXELS_PER_MINUTE, SNAP, TOP_PADDING, type DragMode } from './timelineGeometry'

type Gesture = { id: number; mode: DragMode; entry?: Entry; startY: number; clientY: number; startTime: number; startScroll: number; origin: EntryInput; preview: EntryInput; active: boolean; timer?: ReturnType<typeof setTimeout>; pointerType: string; startX: number }
export function Timeline({ day, range, zone, entries, lockedIds, selectedId, draft, online, loading, onCreate, onOpen, onReplace, beforeDrag, categories, categoriesLoading }: {
  categories: Map<string, Category>; categoriesLoading: boolean;
  day: string; range: TimeRange; zone: string; entries: Entry[]; lockedIds: Set<string>; selectedId?: string; draft: EntryInput | null; online: boolean; loading: boolean;
  onCreate: (input: EntryInput) => void; onOpen: (entry: Entry) => void;
  onReplace: (entry: Entry, target: EntryInput) => void; beforeDrag: () => boolean;
}) {
  const scroll = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef(0)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<{ entry?: Entry; input: EntryInput; mode: DragMode } | null>(null)
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 30000)
    return () => clearInterval(timer)
  }, [])
  const callbacks = useRef({ onCreate, onOpen, onReplace, beforeDrag })
  callbacks.current = { onCreate, onOpen, onReplace, beforeDrag }
  const height = (range.to - range.from) / 60 * PIXELS_PER_MINUTE
  const ticks = useMemo(() => {
    const result: { t: number; label: string }[] = []
    for (let t = range.from; t < range.to; t += 3600) result.push({ t, label: clockTime(t, zone) })
    return result.map(tick => ({ ...tick, repeated: result.filter(other => other.label === tick.label).length > 1 }))
  }, [range.from, range.to, zone])
  const display = preview?.entry ? entries.map(e => e.id === preview.entry!.id ? { ...e, ...preview.input, description: preview.input.description ?? e.description, category_id: preview.input.category_id ?? e.category_id } : e) : entries
  const selection = preview ? (preview.entry ? null : preview.input) : draft
  const selectionStart = selection ? Math.max(selection.start_time, range.from) : 0
  const selectionEnd = selection ? Math.min(selection.end_time, range.to) : 0
  const blocks = useMemo(() => layoutEntries(display, range), [display, range])
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 8 * 60 * PIXELS_PER_MINUTE
  }, [day, zone])
  const focusedEntry = entries.find(entry => entry.id === selectedId) ?? draft
  const focusStart = focusedEntry?.start_time
  const focusEnd = focusedEntry?.end_time
  useEffect(() => {
    const container = scroll.current
    if (!container || focusStart === undefined || focusEnd === undefined || focusStart >= range.to || focusEnd < range.from) return
    // The inline editor reduces the mobile timeline height. Keep the selected
    // block's start visible without interfering with ordinary scrolling or dragging.
    const reveal = () => {
      if (gesture.current || !container.clientHeight) return
      const top = TOP_PADDING + (Math.max(range.from, focusStart) - range.from) / 60 * PIXELS_PER_MINUTE
      const blockHeight = (Math.min(range.to, focusEnd) - Math.max(range.from, focusStart)) / 60 * PIXELS_PER_MINUTE
      const visibleHeight = Math.min(Math.max(32, blockHeight), Math.max(32, container.clientHeight - 48))
      if (top < container.scrollTop || top + visibleHeight > container.scrollTop + container.clientHeight - 16) {
        container.scrollTop = Math.max(0, top - 24)
      }
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(container)
    return () => observer.disconnect()
  }, [focusStart, focusEnd, range.from, range.to])
  function timeAt(clientY: number) {
    const rect = canvas.current!.getBoundingClientRect()
    return clamp(range.from + (clientY - rect.top - TOP_PADDING) / PIXELS_PER_MINUTE * 60, range.from, range.to)
  }
  function cancel() {
    if (gesture.current?.timer) clearTimeout(gesture.current.timer)
    gesture.current = null
    cancelAnimationFrame(frame.current)
    setPreview(null)
  }
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && gesture.current) { e.preventDefault(); cancel() } }
    const blur = () => cancel()
    const visibility = () => { if (document.hidden) cancel() }
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    const surface = canvas.current
    const preventPan = (event: TouchEvent) => { if (gesture.current?.active) event.preventDefault() }
    surface?.addEventListener('touchmove', preventPan, { passive: false })
    return () => { surface?.removeEventListener('touchmove', preventPan); window.removeEventListener('keydown', escape); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); if (gesture.current?.timer) clearTimeout(gesture.current.timer); gesture.current = null; cancelAnimationFrame(frame.current) }
  }, [day, zone])
  function update() {
    const g = gesture.current
    if (!g?.active) return
    const current = timeAt(g.clientY)
    if (g.mode === 'create') {
      const snapped = clamp(Math.round(current / SNAP) * SNAP, range.from, range.to)
      g.preview = { title: '', start_time: Math.min(g.startTime, snapped), end_time: Math.max(g.startTime, snapped) }
      if (g.preview.start_time === g.preview.end_time) g.preview.end_time = Math.min(range.to, g.preview.start_time + 900)
    } else {
      // Closing the editor can move the calendar header. Only pointer movement
      // and scrolling should change an existing entry's timestamps.
      const delta = (g.clientY - g.startY + (scroll.current?.scrollTop ?? 0) - g.startScroll) / PIXELS_PER_MINUTE * 60
      g.preview = dragTimes(g.mode, g.origin, delta, range)
    }
    setPreview({ entry: g.entry, input: g.preview, mode: g.mode })
  }
  function autoScroll() {
    const g = gesture.current
    const container = scroll.current
    if (!g?.active || !container) return
    const bounds = container.getBoundingClientRect()
    const edge = 48
    const speed = g.clientY < bounds.top + edge ? -Math.min(12, (bounds.top + edge - g.clientY) / 4)
      : g.clientY > bounds.bottom - edge ? Math.min(12, (g.clientY - bounds.bottom + edge) / 4) : 0
    if (speed) { container.scrollTop += speed; update() }
    frame.current = requestAnimationFrame(autoScroll)
  }
  function activate(g: Gesture) {
    if (!online && g.mode !== 'create') { cancel(); return }
    if (!callbacks.current.beforeDrag()) { cancel(); return }
    g.active = true
    canvas.current?.setPointerCapture(g.id)
    update()
    frame.current = requestAnimationFrame(autoScroll)
  }
  function down(event: ReactPointerEvent, mode: DragMode, entry?: Entry) {
    if (loading || event.button !== 0 || (entry && lockedIds.has(entry.id))) return
    event.stopPropagation()
    if (event.pointerType === 'mouse') event.preventDefault()
    const startTime = mode === 'create' ? clamp(Math.round(timeAt(event.clientY) / SNAP) * SNAP, range.from, range.to - SNAP) : timeAt(event.clientY)
    const origin = entry ?? { title: '', start_time: startTime, end_time: Math.min(range.to, startTime + 900) }
    const g: Gesture = { id: event.pointerId, mode, entry, startY: event.clientY, clientY: event.clientY, startX: event.clientX, startTime, startScroll: scroll.current?.scrollTop ?? 0, origin, preview: origin, active: false, pointerType: event.pointerType }
    gesture.current = g
    // Capturing mouse input also makes releasing outside the calendar safe.
    if (event.pointerType === 'mouse') canvas.current?.setPointerCapture(g.id)
    else g.timer = setTimeout(() => { if (gesture.current === g) activate(g) }, 300)
  }
  function move(event: ReactPointerEvent) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    g.clientY = event.clientY
    const distance = Math.hypot(event.clientY - g.startY, event.clientX - g.startX)
    if (!g.active && distance > 5) {
      if (g.pointerType !== 'mouse') { cancel(); return }
      activate(g)
    }
    if (g.active) { event.preventDefault(); update() }
  }
  function up(event: ReactPointerEvent) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    if (g.timer) clearTimeout(g.timer)
    suppressClick.current = true
    setTimeout(() => { suppressClick.current = false }, 0)
    if (g.active) {
      if (g.mode === 'create') callbacks.current.onCreate(g.preview)
      else if (g.entry && (g.preview.start_time !== g.entry.start_time || g.preview.end_time !== g.entry.end_time)) callbacks.current.onReplace(g.entry, g.preview)
    } else if (g.entry) callbacks.current.onOpen(g.entry)
    else callbacks.current.onCreate(g.origin)
    cancel()
  }
  const blockActions = useRef({ down, open: onOpen, suppressClick })
  blockActions.current = { down, open: onOpen, suppressClick }
  return <div className="timeline-shell">
    <div className="timeline-scroll" ref={scroll} aria-label="Daily timeline">
      <div className={`timeline-canvas ${preview ? 'dragging' : ''}`} ref={canvas} data-drag-mode={preview?.mode} style={{ height: height + TOP_PADDING + 40 }} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current?.active) cancel() }}>
        {ticks.map(tick => <div className="hour-row" key={tick.t} style={{ top: TOP_PADDING + (tick.t - range.from) / 60 * PIXELS_PER_MINUTE }}><div className="hour-label">{tick.label}{tick.repeated && <small>{offsetLabel(tick.t, zone)}</small>}</div><div className="hour-rule" /></div>)}
        <div className="hour-row" style={{ top: height + TOP_PADDING }}><div className="hour-label">00:00</div><div className="hour-rule" /></div>
        <div className="timeline-track" style={{ top: TOP_PADDING, height }} onPointerDown={event => down(event, 'create')}>
          {blocks.map(({ entry, top, height: blockHeight, column, columns }) => <EntryBlock key={entry.id} entry={entry} category={categories.get(entry.category_id)} categoriesLoading={categoriesLoading} top={top} height={blockHeight} column={column} columns={columns} selected={entry.id === selectedId} locked={lockedIds.has(entry.id)} from={range.from} to={range.to} zone={zone} actions={blockActions} />)}
          {selection && selectionEnd > selectionStart && <div className={`selection-preview ${(selectionEnd - selectionStart) / 60 * PIXELS_PER_MINUTE < 60 ? 'block-small' : ''} ${(selectionEnd - selectionStart) / 60 * PIXELS_PER_MINUTE < 39 ? 'block-tiny' : ''} ${(selectionEnd - selectionStart) / 60 * PIXELS_PER_MINUTE < 14 ? 'block-sliver' : ''} ${!preview ? 'draft-preview' : ''}`} data-category-color={categoryTone(categories.get(selection.category_id ?? '')?.color)} role="status" aria-label={`Unsaved entry, ${entryTime(selection, zone)}`} style={{ top: (selectionStart - range.from) / 60 * PIXELS_PER_MINUTE, height: (selectionEnd - selectionStart) / 60 * PIXELS_PER_MINUTE }}><div className="block-content"><BlockHeading title={selection.title || 'New entry'} categoryName={selection.category_id ? categories.get(selection.category_id)?.name ?? 'Category unavailable' : undefined} /><span>{entryTime(selection, zone)}</span></div></div>}
          {now >= range.from && now < range.to && <div className="now-line" style={{ top: (now - range.from) / 60 * PIXELS_PER_MINUTE }}><span /></div>}
        </div>
      </div>
    </div>
  </div>
}


function BlockHeading({ title, categoryName }: { title: string; categoryName?: string }) {
  return <strong className="block-heading">{categoryName && <small className="category-badge">{categoryName}</small>}<span className="entry-title">{title}</span></strong>
}

type BlockActions = {
  down: (event: ReactPointerEvent, mode: DragMode, entry?: Entry) => void
  open: (entry: Entry) => void
  suppressClick: RefObject<boolean>
}
// Only blocks whose geometry or data changed need to rerender during a drag.
const EntryBlock = memo(function EntryBlock({ entry, top, height, column, columns, selected, locked, from, to, zone, actions, category, categoriesLoading }: {
  category?: Category; categoriesLoading: boolean;
  entry: Entry; top: number; height: number; column: number; columns: number;
  selected: boolean; locked: boolean; from: number; to: number; zone: string;
  actions: RefObject<BlockActions>;
}) {
  const categoryName = category?.name ?? (categoriesLoading ? 'Loading category' : 'Category unavailable')
  const time = entryTime(entry, zone)
  function pointerMode(event: ReactPointerEvent<HTMLButtonElement>): DragMode {
    // Measure the visible button, excluding the gap below the time block.
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    if (locked || event.pointerType !== 'mouse' || entry.start_time === entry.end_time || rect.height < 12 ||
      y < 0 || y >= rect.height || event.clientX < rect.left || event.clientX >= rect.right) return 'move'
    const edge = Math.min(4, (rect.height - 8) / 2)
    if (y < edge && entry.start_time >= from) return 'start'
    if (y >= rect.height - edge && entry.end_time <= to) return 'end'
    return 'move'
  }
  function updateCursor(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.cursor = locked ? 'default' : pointerMode(event) === 'move' ? 'grab' : 'ns-resize'
  }
  return <div data-category-color={categoryTone(category?.color)} className={`time-block ${height < 60 ? 'block-small' : ''} ${height < 39 ? 'block-tiny' : ''} ${height > 0 && height < 14 ? 'block-sliver' : ''} ${selected ? 'is-selected' : ''} ${locked ? 'is-pending' : ''} ${entry.start_time === entry.end_time ? 'is-point' : ''}`} onPointerDown={event => event.stopPropagation()} style={{ top, height, left: `calc(${column / columns * 100}% + 3px)`, width: `calc(${100 / columns}% - 8px)` }}>
    <button className="block-content" data-entry-id={entry.id} disabled={locked} onPointerEnter={updateCursor} onPointerMove={updateCursor} onPointerLeave={event => { event.currentTarget.style.cursor = '' }} onPointerDown={event => { updateCursor(event); actions.current.down(event, pointerMode(event), entry) }} onClick={event => { if (event.detail === 0 && !actions.current.suppressClick.current) actions.current.open(entry) }} title={`${entry.title} · ${time} · ${categoryName}`} aria-label={`${entry.title}, ${time}, ${duration(entry.end_time - entry.start_time)}, ${categoryName}`}>
      <BlockHeading title={entry.title} categoryName={categoryName} /><span>{time}</span>{locked && <small>Awaiting confirmation</small>}
    </button>
  </div>
})
