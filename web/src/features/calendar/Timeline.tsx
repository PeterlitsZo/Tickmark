import { useEffect, type ComponentProps, type CSSProperties } from 'react'
import type { EntryInput } from '../../api/entries'
import { dayRange, today } from '../../lib/time'
import { DayTimeline } from './DayTimeline'
import { DAY_HEADER_HEIGHT, TIME_GUTTER_WIDTH } from './calendarWindow'
import { PIXELS_PER_MINUTE, TOP_PADDING } from './timelineGeometry'
import type { useCalendarViewport } from './useCalendarViewport'
import type { useCalendarEntries } from './useCalendarEntries'
import './timeline.css'

type Props = Omit<ComponentProps<typeof DayTimeline>, 'day' | 'range' | 'loading' | 'scroll' | 'onGesture'> & {
  revealDay?: string
  revealEntry?: EntryInput
  viewport: ReturnType<typeof useCalendarViewport>
  columns: ReturnType<typeof useCalendarEntries>['columns']
}

export function Timeline({ viewport, columns, revealDay, revealEntry, ...props }: Props) {
  const { scroll, width, onScroll, onGesture } = viewport
  const focusStart = revealEntry?.start_time
  const focusEnd = revealEntry?.end_time
  const zone = props.zone
  // This effect belongs to the stable viewport, not recycled day columns.
  // Browsing away and back must not reveal an old selection again.
  useEffect(() => {
    const container = scroll.current
    if (!container || !revealDay || focusStart === undefined || focusEnd === undefined) return
    const range = dayRange(revealDay, zone)
    if (focusStart >= range.to || focusEnd < range.from) return
    const reveal = () => {
      const canvas = container.querySelector<HTMLElement>(`[data-day="${revealDay}"]`)
      const bounds = container.getBoundingClientRect()
      const rect = canvas?.getBoundingClientRect()
      if (!rect || container.querySelector('.dragging') || rect.right <= bounds.left + TIME_GUTTER_WIDTH || rect.left >= bounds.left + container.clientWidth) return
      const top = DAY_HEADER_HEIGHT + TOP_PADDING + (Math.max(range.from, focusStart) - range.from) / 60 * PIXELS_PER_MINUTE
      const blockHeight = (Math.min(range.to, focusEnd) - Math.max(range.from, focusStart)) / 60 * PIXELS_PER_MINUTE
      const visibleHeight = Math.min(Math.max(32, blockHeight), Math.max(32, container.clientHeight - DAY_HEADER_HEIGHT - 48))
      if (top < container.scrollTop + DAY_HEADER_HEIGHT || top + visibleHeight > container.scrollTop + container.clientHeight - 16) container.scrollTop = Math.max(0, top - DAY_HEADER_HEIGHT - 24)
    }
    reveal()
    let previousHeight = container.clientHeight
    const observer = new ResizeObserver(() => {
      if (container.clientHeight < previousHeight) reveal()
      previousHeight = container.clientHeight
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [focusStart, focusEnd, revealDay, zone, scroll])
  const hours = Math.max(...columns.map(({ range }) => (range.to - range.from) / 3600))
  // Reserve the longest regular DST day so recycling a 25-hour column does
  // not clamp the shared vertical position near the bottom of the viewport.
  const height = Math.max(25, hours) * 60 * PIXELS_PER_MINUTE + TOP_PADDING + 40
  const currentDay = today(props.zone)
  return <div className="timeline-shell multi-day-timeline">
    <div className="timeline-scroll" ref={scroll} onScroll={onScroll} role="region" aria-label="Calendar timeline. Scroll horizontally to explore dates." tabIndex={0}>
      <div className="calendar-grid" style={{ width: TIME_GUTTER_WIDTH + width * columns.length, '--day-width': `${width}px`, '--day-header-height': `${DAY_HEADER_HEIGHT}px` } as CSSProperties}>
        <div className="calendar-day-headers">
          <div className="calendar-corner" title={props.zone}>Local</div>
          {columns.map(({ day, range, query }) => {
            const date = new Date(`${day}T12:00:00Z`)
            const dayHours = (range.to - range.from) / 3600
            return <div className="calendar-day-header" key={day} data-date={day} aria-label={day}>
              <div><span>{date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span><strong className={day === currentDay ? 'today-date' : ''}>{Number(day.slice(-2))}</strong></div>
              {query.isError ? <button className="column-retry" title={query.error.message} disabled={!props.online || query.isFetching} onClick={() => void query.refetch()}>Could not load · Retry</button>
                : query.isPending ? <small role="status">{props.online ? 'Loading…' : 'Offline · not loaded'}</small>
                  : dayHours !== 24 ? <small className="dst-note" title="This day uses its own local hour labels. Vertical distance represents elapsed time.">{dayHours}h day · clock change</small> : null}
            </div>
          })}
        </div>
        <div className="calendar-days" style={{ height }}>
          <div className="calendar-time-gutter" aria-label="Hours from midnight; clock-change days have their own labels">
            {Array.from({ length: Math.ceil(hours) + 1 }, (_, hour) => <div className="hour-label" key={hour} style={{ top: TOP_PADDING + hour * 60 * PIXELS_PER_MINUTE }}>{hour < 24 ? `${String(hour).padStart(2, '0')}:00` : hour === 24 ? '00:00' : '+25h'}</div>)}
          </div>
          {columns.map(({ day, range, query }) => <DayTimeline key={`${day}:${props.zone}`} {...props} day={day} range={range} loading={query.isPending || (query.isError && !query.data)} scroll={scroll} onGesture={onGesture} />)}
        </div>
      </div>
    </div>
  </div>
}
